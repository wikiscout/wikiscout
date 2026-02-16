<?php
require_once __DIR__ . '/../../../helpers.php';
bootstrap();

try {
    $user = requireTeam();
    $db = getDb();

    $scoutedTeam = $_GET['team'] ?? null;
    $eventCode = $_GET['event'] ?? null;

    if (!$scoutedTeam || !$eventCode) {
        errorResponse('team and event are required', 400);
    }

    // Get this team's custom questions
    $stmt = $db->prepare("
        SELECT id, label, field_type, config, sort_order
        FROM custom_questions
        WHERE team_number = ?
        ORDER BY sort_order ASC, id ASC
    ");
    $stmt->execute([$user['team_number']]);
    $questions = $stmt->fetchAll();

    // Get related event codes for cross-division data sharing
    $relatedEvents = getRelatedEventCodes($eventCode, $user['team_number']);
    $eventPlaceholders = implode(',', array_fill(0, count($relatedEvents), '?'));

    // Get responses for the scouted team (only this team's responses) across related events
    $params = array_merge([$scoutedTeam], $relatedEvents, [$user['team_number']]);
    $stmt = $db->prepare("
        SELECT question_id, value
        FROM custom_question_responses
        WHERE scouted_team = ? AND event_code IN ($eventPlaceholders) AND scouting_team = ?
    ");
    $stmt->execute($params);
    $responses = $stmt->fetchAll();

    $responseMap = [];
    foreach ($responses as $r) {
        $responseMap[(int)$r['question_id']] = $r['value'];
    }

    $result = array_map(fn($q) => [
        'id' => (int)$q['id'],
        'label' => $q['label'],
        'field_type' => $q['field_type'],
        'config' => json_decode($q['config'] ?: '{}', true),
        'sort_order' => (int)$q['sort_order'],
        'value' => $responseMap[(int)$q['id']] ?? null,
    ], $questions);

    jsonResponse(['questions' => $result]);

} catch (Exception $e) {
    error_log("Custom responses get error: " . $e->getMessage());
    errorResponse('Failed to get custom responses', 500);
}
?>
