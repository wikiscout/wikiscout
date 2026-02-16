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

    $id = $body['id'] ?? null;
    $label = $body['label'] ?? null;
    $fieldType = $body['field_type'] ?? null;
    $config = $body['config'] ?? [];
    $sortOrder = $body['sort_order'] ?? 0;

    if (!$label || !$fieldType) {
        errorResponse('Label and field_type are required', 400);
    }

    $validTypes = ['boolean', 'slider', 'dropdown', 'number', 'text'];
    if (!in_array($fieldType, $validTypes)) {
        errorResponse('Invalid field_type. Must be one of: ' . implode(', ', $validTypes), 400);
    }

    $configStr = json_encode($config ?: new stdClass());

    if ($id) {
        // Update existing — only if it belongs to this team
        $stmt = $db->prepare("SELECT id FROM custom_questions WHERE id = ? AND team_number = ?");
        $stmt->execute([(int)$id, $user['team_number']]);
        $existing = $stmt->fetch();

        if (!$existing) {
            errorResponse('Question not found', 404);
        }

        $stmt = $db->prepare("
            UPDATE custom_questions
            SET label = ?, field_type = ?, config = ?, sort_order = ?
            WHERE id = ? AND team_number = ?
        ");
        $stmt->execute([$label, $fieldType, $configStr, (int)$sortOrder, (int)$id, $user['team_number']]);

        jsonResponse(['success' => true, 'id' => (int)$id]);
    } else {
        // Create new
        $stmt = $db->prepare("
            INSERT INTO custom_questions (team_number, label, field_type, config, sort_order)
            VALUES (?, ?, ?, ?, ?)
        ");
        $stmt->execute([$user['team_number'], $label, $fieldType, $configStr, (int)$sortOrder]);

        jsonResponse(['success' => true, 'id' => (int)$db->lastInsertId()]);
    }

} catch (Exception $e) {
    error_log("Custom question save error: " . $e->getMessage());
    errorResponse('Failed to save custom question', 500);
}
?>
