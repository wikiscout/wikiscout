<?php
require_once __DIR__ . '/../../../helpers.php';
bootstrap();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

try {
    $user = requireMainAccount();
    $db = getDb();
    $seasonYear = getSeasonYear();

    // Auto-create a profile entry if one doesn't exist yet
    $stmt = $db->prepare("SELECT id FROM team_profiles WHERE team_number = ? AND season_year = ?");
    $stmt->execute([$user['team_number'], $seasonYear]);
    $existingProfile = $stmt->fetch();

    if (!$existingProfile) {
        $profileSlug = generateProfileSlug($user['team_number']);
        $stmt = $db->prepare("
            INSERT INTO team_profiles (team_number, user_id, season_year, profile_slug)
            VALUES (?, ?, ?, ?)
        ");
        $stmt->execute([$user['team_number'], $user['id'], $seasonYear, $profileSlug]);
    }

    // Invalidate any existing pending sessions
    $stmt = $db->prepare("
        UPDATE photo_upload_sessions
        SET status = 'expired'
        WHERE team_number = ? AND status = 'pending'
    ");
    $stmt->execute([$user['team_number']]);

    // Create new session
    $sessionToken = generateOneTimeToken();
    $expiresAt = date('Y-m-d H:i:s', strtotime('+15 minutes'));

    $stmt = $db->prepare("
        INSERT INTO photo_upload_sessions (team_number, user_id, session_token, expires_at)
        VALUES (?, ?, ?, ?)
    ");
    $stmt->execute([$user['team_number'], $user['id'], $sessionToken, $expiresAt]);

    $uploadUrl = getPublicUrl() . "/upload.html?token=$sessionToken";

    jsonResponse([
        'session_token' => $sessionToken,
        'upload_url' => $uploadUrl,
        'expires_at' => $expiresAt,
    ]);

} catch (Exception $e) {
    if ($e->getCode() === 401 || $e->getCode() === 501) {
        errorResponse($e->getMessage(), $e->getCode());
    }
    error_log("Photo session create error: " . $e->getMessage());
    errorResponse('Failed to create upload session', 500);
}
?>
