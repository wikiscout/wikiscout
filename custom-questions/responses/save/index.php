<?php
require_once __DIR__ . '/../../../helpers.php';
bootstrap();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method Not Allowed', 405);
}

try {
    $user = requireTeam();
    $db = getDb();

    $body = json_decode(file_get_contents('php://input'), true);
    $scoutedTeam = $body['scouted_team'] ?? null;
    $eventCode = $body['event_code'] ?? null;
    $responses = $body['responses'] ?? null;

    if (!$scoutedTeam || !$eventCode || !is_array($responses)) {
        errorResponse('scouted_team, event_code, and responses[] are required', 400);
    }

    // Block writes to events that have ended
    if (isEventEnded($eventCode)) {
        errorResponse('This event has ended — custom responses are read-only', 403);
    }

    $seasonYear = getSeasonYear();

    // Get question IDs from responses
    $questionIds = array_map(fn($r) => (int)($r['question_id'] ?? 0), $responses);
    $questionIds = array_filter($questionIds, fn($id) => $id > 0);

    if (count($questionIds) > 0) {
        // Verify all questions belong to this team
        $placeholders = implode(',', array_fill(0, count($questionIds), '?'));
        $stmt = $db->prepare("
            SELECT id FROM custom_questions
            WHERE id IN ($placeholders) AND team_number = ?
        ");
        $params = array_merge(array_values($questionIds), [$user['team_number']]);
        $stmt->execute($params);
        $ownedResults = $stmt->fetchAll();
        $ownedIds = array_column($ownedResults, 'id');
        $ownedIds = array_map('intval', $ownedIds);

        foreach ($responses as $resp) {
            $qid = (int)($resp['question_id'] ?? 0);
            if (!in_array($qid, $ownedIds)) continue; // skip non-owned questions

            // Delete existing response for this specific question + scouted team + event
            $stmt = $db->prepare("
                DELETE FROM custom_question_responses
                WHERE question_id = ? AND scouted_team = ? AND event_code = ? AND scouting_team = ?
            ");
            $stmt->execute([$qid, $scoutedTeam, $eventCode, $user['team_number']]);

            // Insert new response
            $stmt = $db->prepare("
                INSERT INTO custom_question_responses
                (question_id, scouted_team, event_code, season_year, scouting_team, scouter_user_id, value)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $qid,
                $scoutedTeam,
                $eventCode,
                $seasonYear,
                $user['team_number'],
                $user['id'],
                (string)($resp['value'] ?? ''),
            ]);
        }
    }

    jsonResponse(['success' => true]);

} catch (Exception $e) {
    error_log("Custom responses save error: " . $e->getMessage());
    errorResponse('Failed to save custom responses', 500);
}
?>
