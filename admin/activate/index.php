<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

global $servers, $apikey, $adminUserIds;

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $token = getAuthCookie();
    if (!$token) {
        header('Location: https://static.cirrus.center/http/404/');
        exit;
    }

    // Validate via external Cirrus API
    $server = $servers[array_rand($servers)];
    $ch = curl_init("https://$server/v2/auth/user/");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            "Authorization: Bearer $apikey",
            "Token: $token",
        ],
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 401) {
        header('Location: https://static.cirrus.center/http/404/');
        exit;
    }

    if ($httpCode === 200) {
        $data = json_decode($response, true);
        if (isset($data['user']['id']) && in_array($data['user']['id'], $adminUserIds)) {
            jsonResponse(['authorized' => true]);
        }
    }

    header('Location: https://static.cirrus.center/http/404/');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $db = getDb();
        $input = json_decode(file_get_contents('php://input'), true);
        $email = $input['email'] ?? null;
        $teamNumber = isset($input['teamNumber']) ? strip_tags($input['teamNumber']) : null;

        if (!$email || !$teamNumber) {
            errorResponse('Invalid input', 400);
        }

        // First, set team_number to NULL for any account that currently has this team number
        $stmt = $db->prepare("UPDATE users SET team_number = NULL WHERE team_number = ?");
        $stmt->execute([$teamNumber]);

        // Check if user exists
        $stmt = $db->prepare("SELECT id FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $existing = $stmt->fetch();

        if ($existing) {
            // Update existing user
            $stmt = $db->prepare("UPDATE users SET team_number = ? WHERE id = ?");
            $stmt->execute([$teamNumber, $existing['id']]);
        } else {
            // Create new user with placeholder password (they need to register properly)
            $stmt = $db->prepare("INSERT INTO users (email, team_number, password_hash) VALUES (?, ?, ?)");
            $stmt->execute([$email, $teamNumber, 'NEEDS_REGISTRATION']);
        }

        jsonResponse(['success' => true]);

    } catch (Exception $e) {
        error_log("Activate error: " . $e->getMessage());
        errorResponse('Database error', 500);
    }
    exit;
}

errorResponse('Method not allowed', 405);
?>
