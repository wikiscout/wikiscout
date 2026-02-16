<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

try {
    $user = requireTeam();
    $db = getDb();

    $stmt = $db->prepare("
        SELECT id, label, field_type, config, sort_order
        FROM custom_questions
        WHERE team_number = ?
        ORDER BY sort_order ASC, id ASC
    ");
    $stmt->execute([$user['team_number']]);
    $results = $stmt->fetchAll();

    $questions = array_map(fn($q) => [
        'id' => (int)$q['id'],
        'label' => $q['label'],
        'field_type' => $q['field_type'],
        'config' => json_decode($q['config'] ?: '{}', true),
        'sort_order' => (int)$q['sort_order'],
    ], $results);

    jsonResponse(['questions' => $questions]);

} catch (Exception $e) {
    error_log("Custom questions list error: " . $e->getMessage());
    errorResponse('Failed to list custom questions', 500);
}
?>
