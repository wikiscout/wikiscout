<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    errorResponse('Method Not Allowed', 405);
}

try {
    $user = requireTeam();
    $db = getDb();

    $questionId = $_GET['id'] ?? null;

    if (!$questionId) {
        errorResponse('Question ID is required', 400);
    }

    // Verify ownership
    $stmt = $db->prepare("SELECT id FROM custom_questions WHERE id = ? AND team_number = ?");
    $stmt->execute([(int)$questionId, $user['team_number']]);
    $existing = $stmt->fetch();

    if (!$existing) {
        errorResponse('Question not found', 404);
    }

    // Delete responses first, then the question
    $stmt = $db->prepare("DELETE FROM custom_question_responses WHERE question_id = ?");
    $stmt->execute([(int)$questionId]);

    $stmt = $db->prepare("DELETE FROM custom_questions WHERE id = ? AND team_number = ?");
    $stmt->execute([(int)$questionId, $user['team_number']]);

    jsonResponse(['success' => true]);

} catch (Exception $e) {
    error_log("Custom question delete error: " . $e->getMessage());
    errorResponse('Failed to delete custom question', 500);
}
?>
