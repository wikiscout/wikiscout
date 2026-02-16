<?php
require_once __DIR__ . '/../../../helpers.php';
bootstrap();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

$token = $_GET['token'] ?? null;

if (!$token) {
    errorResponse('Missing token', 400);
}

try {
    $db = getDb();

    // Validate session
    $stmt = $db->prepare("
        SELECT * FROM photo_upload_sessions
        WHERE session_token = ?
        AND status = 'pending'
        AND expires_at > CURRENT_TIMESTAMP
    ");
    $stmt->execute([$token]);
    $session = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$session) {
        errorResponse('Invalid or expired session', 404);
    }

    // Update session status
    $stmt = $db->prepare("UPDATE photo_upload_sessions SET status = 'uploading' WHERE id = ?");
    $stmt->execute([$session['id']]);

    // Get the image data
    if (!isset($_FILES['photo']) || $_FILES['photo']['error'] !== UPLOAD_ERR_OK) {
        $stmt = $db->prepare("UPDATE photo_upload_sessions SET status = 'failed' WHERE id = ?");
        $stmt->execute([$session['id']]);
        errorResponse('No photo provided', 400);
    }

    // Save original image to local storage
    $seasonYear = getSeasonYear();
    $timestamp = time();
    $originalPath = "profiles/$seasonYear/{$session['team_number']}/original-$timestamp.jpg";

    $imageContent = file_get_contents($_FILES['photo']['tmp_name']);
    storeFile($originalPath, $imageContent, 'image/jpeg');

    // Update profile with original image path
    $stmt = $db->prepare("
        UPDATE team_profiles
        SET original_image_path = ?, updated_at = CURRENT_TIMESTAMP
        WHERE team_number = ? AND season_year = ?
    ");
    $stmt->execute([$originalPath, $session['team_number'], $seasonYear]);

    // Update session status to processing
    $stmt = $db->prepare("UPDATE photo_upload_sessions SET status = 'processing' WHERE id = ?");
    $stmt->execute([$session['id']]);

    // Start AI processing in background (PHP doesn't have ctx.waitUntil, so we use register_shutdown_function or fastcgi_finish_request)
    $sessionId = $session['id'];
    $teamNumber = $session['team_number'];

    // Send response immediately, then process in background
    jsonResponse([
        'success' => true,
        'message' => 'Photo uploaded successfully. AI processing started.',
        'original_path' => $originalPath,
    ]);

    // Close the connection to the client
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    }

    // AI processing (runs after response is sent if using FastCGI)
    processImageWithAI($db, $teamNumber, $originalPath, $imageContent, $timestamp, $sessionId);

} catch (Exception $e) {
    error_log("Photo upload error: " . $e->getMessage());
    errorResponse('Failed to upload photo', 500);
}

/**
 * Process image with AI (OpenRouter)
 */
function processImageWithAI(PDO $db, string $teamNumber, string $originalPath, string $imageContent, int $timestamp, int $sessionId): void {
    global $openrouterApiKey;
    $seasonYear = getSeasonYear();

    try {
        if (empty($openrouterApiKey)) {
            throw new \Exception('OpenRouter API key not configured');
        }

        $imageBase64 = base64_encode($imageContent);

        // First AI call: Create 3D render
        $renderPrompt = "Take this image and create a 3D render of this robot. Make sure to maintain details, but make it look like a CAD render. Only include the robot. Remove everything else from the environment. Make the robot centered in the image and as large and detailed as possible while staying within frame. Pay very close attention to the details of the robot and create a 1:1 replica. Keep the robot oriented in the exact same way as the reference photo. Preserve all mechanical details, wheels, arms, and structural components exactly as shown.";

        $renderedImageBase64 = callOpenRouterImageGen($openrouterApiKey, $renderPrompt, $imageBase64);

        if (!$renderedImageBase64) {
            throw new \Exception('No rendered image returned from AI (step 1: 3D render)');
        }

        // Save rendered image
        $renderedPath = "profiles/$seasonYear/$teamNumber/rendered-$timestamp.png";
        storeFile($renderedPath, base64_decode($renderedImageBase64), 'image/png');

        // Second AI call: Add spotlight and background
        $finalPrompt = "Add a well lit environment for this robot, with a dramatic spotlight on the robot and a dark background. Make sure the robot is in the exact same orientation and position, just add a dark gradient background with professional studio lighting. Make sure the robot is well lit so you can see all its details clearly. Add subtle reflections on the floor. Keep it looking professional and polished like a product showcase.";

        $finalImageBase64 = callOpenRouterImageGen($openrouterApiKey, $finalPrompt, $renderedImageBase64);

        if (!$finalImageBase64) {
            // Second step failed but first succeeded — save what we have
            $stmt = $db->prepare("
                UPDATE team_profiles
                SET rendered_image_path = ?, final_image_path = ?, updated_at = CURRENT_TIMESTAMP
                WHERE team_number = ? AND season_year = ?
            ");
            $stmt->execute([$renderedPath, $renderedPath, $teamNumber, $seasonYear]);

            $stmt = $db->prepare("UPDATE photo_upload_sessions SET status = 'complete' WHERE id = ?");
            $stmt->execute([$sessionId]);
            return;
        }

        // Save final image
        $finalPath = "profiles/$seasonYear/$teamNumber/final-$timestamp.png";
        storeFile($finalPath, base64_decode($finalImageBase64), 'image/png');

        // Update profile with all image paths
        $stmt = $db->prepare("
            UPDATE team_profiles
            SET rendered_image_path = ?, final_image_path = ?, updated_at = CURRENT_TIMESTAMP
            WHERE team_number = ? AND season_year = ?
        ");
        $stmt->execute([$renderedPath, $finalPath, $teamNumber, $seasonYear]);

        // Mark session complete
        $stmt = $db->prepare("UPDATE photo_upload_sessions SET status = 'complete' WHERE id = ?");
        $stmt->execute([$sessionId]);

    } catch (\Exception $e) {
        error_log("AI processing error for team $teamNumber: " . $e->getMessage());
        try {
            $stmt = $db->prepare("UPDATE photo_upload_sessions SET status = 'failed' WHERE id = ?");
            $stmt->execute([$sessionId]);
        } catch (\Exception $dbErr) {
            error_log("Failed to update session status: " . $dbErr->getMessage());
        }
    }
}

/**
 * Call OpenRouter API for image generation
 */
function callOpenRouterImageGen(string $apiKey, string $prompt, ?string $inputImageBase64 = null): ?string {
    $contentParts = [];

    if ($inputImageBase64) {
        $contentParts[] = [
            'type' => 'image_url',
            'image_url' => ['url' => "data:image/jpeg;base64,$inputImageBase64"],
        ];
    }

    $contentParts[] = ['type' => 'text', 'text' => $prompt];

    $requestBody = [
        'model' => 'black-forest-labs/flux.2-klein-4b',
        'messages' => [
            [
                'role' => 'user',
                'content' => count($contentParts) === 1 ? $prompt : $contentParts,
            ]
        ],
        'modalities' => ['image', 'text'],
    ];

    $ch = curl_init('https://openrouter.ai/api/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($requestBody),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            "Authorization: Bearer $apiKey",
            'HTTP-Referer: https://app.wikiscout.org',
            'X-Title: WikiScout Trading Card',
        ],
        CURLOPT_TIMEOUT => 120,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200 || !$response) {
        error_log("OpenRouter API error $httpCode: " . substr($response ?: 'Unknown error', 0, 200));
        throw new \Exception("OpenRouter API error $httpCode");
    }

    $data = json_decode($response, true);

    if (isset($data['error'])) {
        error_log("AI API returned error: " . ($data['error']['message'] ?? json_encode($data['error'])));
        return null;
    }

    return extractImageBase64($data);
}

/**
 * Extract base64 image data from OpenRouter response
 */
function extractImageBase64(array $data): ?string {
    $content = $data['choices'][0]['message']['content'] ?? null;
    if (!$content) return null;

    // Case 1: content is a structured array (multi-modal response)
    if (is_array($content)) {
        foreach ($content as $item) {
            if (($item['type'] ?? '') === 'image_url' && !empty($item['image_url']['url'])) {
                $url = $item['image_url']['url'];
                if (str_starts_with($url, 'data:image')) {
                    $parts = explode(',', $url, 2);
                    return $parts[1] ?? null;
                }
                return $url; // Raw base64 or URL
            }
        }
        return null;
    }

    // Case 2: content is a string
    if (is_string($content)) {
        if (str_starts_with($content, 'data:image')) {
            $parts = explode(',', $content, 2);
            return $parts[1] ?? null;
        }
        // Might be raw base64
        if (strlen($content) > 100 && preg_match('/^[A-Za-z0-9+\/=]+$/', substr($content, 0, 100))) {
            return $content;
        }
        return null;
    }

    return null;
}
?>
