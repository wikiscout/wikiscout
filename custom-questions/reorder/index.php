<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method Not Allowed', 405);
}

try {
    $user = requireTeam();
    $db = getDb();

    $body = json_decode(file_get_contents('php://input'), true);
    $order = $body['order'] ?? null;

    if (!is_array($order)) {
        errorResponse('order must be an array of { id, sort_order }', 400);
    }

    foreach ($order as $item) {
        $stmt = $db->prepare("
            UPDATE custom_questions SET sort_order = ?
            WHERE id = ? AND team_number = ?
        ");
        $stmt->execute([(int)($item['sort_order'] ?? 0), (int)($item['id'] ?? 0), $user['team_number']]);
    }

    jsonResponse(['success' => true]);

} catch (Exception $e) {
    error_log("Custom questions reorder error: " . $e->getMessage());
    errorResponse('Failed to reorder custom questions', 500);
}
?>
