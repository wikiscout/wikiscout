<?php
require_once __DIR__ . '/../../../helpers.php';
bootstrap();

try {
    $user = requireTeam();
    $db = getDb();

    $stmt = $db->prepare("
        SELECT * FROM photo_upload_sessions
        WHERE team_number = ?
        ORDER BY created_at DESC
        LIMIT 1
    ");
    $stmt->execute([$user['team_number']]);
    $session = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$session) {
        jsonResponse(['status' => 'none']);
    }

    jsonResponse([
        'status' => $session['status'],
        'created_at' => $session['created_at'],
        'expires_at' => $session['expires_at'],
    ]);

} catch (Exception $e) {
    if ($e->getCode() === 401 || $e->getCode() === 501) {
        errorResponse($e->getMessage(), $e->getCode());
    }
    error_log("Photo session status error: " . $e->getMessage());
    errorResponse('Failed to get session status', 500);
}
?>
