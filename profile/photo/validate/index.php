<?php
require_once __DIR__ . '/../../../helpers.php';
bootstrap();

$token = $_GET['token'] ?? null;

if (!$token) {
    errorResponse('Missing token', 400);
}

try {
    $db = getDb();

    $stmt = $db->prepare("
        SELECT ps.*, u.team_number as user_team
        FROM photo_upload_sessions ps
        JOIN users u ON ps.user_id = u.id
        WHERE ps.session_token = ?
        AND ps.status = 'pending'
        AND ps.expires_at > CURRENT_TIMESTAMP
    ");
    $stmt->execute([$token]);
    $session = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$session) {
        errorResponse('Invalid or expired session', 404);
    }

    jsonResponse([
        'valid' => true,
        'team_number' => $session['team_number'],
        'expires_at' => $session['expires_at'],
    ]);

} catch (Exception $e) {
    error_log("Photo session validate error: " . $e->getMessage());
    errorResponse('Failed to validate session', 500);
}
?>
