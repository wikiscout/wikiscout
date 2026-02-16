<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

try {
    $db = getDb();
    $input = json_decode(file_get_contents('php://input'), true);
    $teamNumber = isset($input['teamNumber']) ? strip_tags($input['teamNumber']) : null;

    if (!$teamNumber) {
        errorResponse('Invalid input', 400);
    }

    $stmt = $db->prepare("UPDATE users SET team_number = NULL WHERE team_number = ?");
    $stmt->execute([$teamNumber]);

    if ($stmt->rowCount() > 0) {
        jsonResponse(['success' => true]);
    } else {
        errorResponse('Team not found', 404);
    }

} catch (Exception $e) {
    error_log("Deactivate error: " . $e->getMessage());
    errorResponse('Database error', 500);
}
?>
