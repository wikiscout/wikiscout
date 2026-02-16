<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    errorResponse('Method Not Allowed', 405);
}

try {
    $user = requireTeam();
    $db = getDb();

    $noteId = $_GET['id'] ?? null;

    if (!$noteId) {
        errorResponse('Note ID is required', 400);
    }

    // Only allow deleting own notes
    $stmt = $db->prepare("DELETE FROM match_notes WHERE id = ? AND user_id = ?");
    $stmt->execute([(int)$noteId, $user['id']]);

    jsonResponse(['success' => true]);

} catch (Exception $e) {
    if ($e->getCode() === 401) {
        errorResponse('Unauthorized', 401);
    }
    error_log("Match note delete error: " . $e->getMessage());
    errorResponse('Failed to delete match note', 500);
}
?>
