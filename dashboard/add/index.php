<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method Not Allowed', 405);
}

try {
    $user = requireTeam();
    $db = getDb();

    $teamNumber = isset($_POST['team_number']) ? preg_replace('/[\r\n]/', '', $_POST['team_number']) : null;
    $eventId = isset($_POST['event_id']) ? preg_replace('/[\r\n]/', '', $_POST['event_id']) : null;
    $data = isset($_POST['data']) ? preg_replace('/[\r\n]/', '', $_POST['data']) : null;

    if (!$teamNumber || !$eventId || !$data) {
        errorResponse('Missing parameters', 400);
    }

    // DEVDATA0 is read-only — block all saves
    if (isDevDataReadOnly($eventId)) {
        errorResponse('Demo event DEVDATA0 is read-only', 403);
    }

    // Block writes to events that have ended
    if (isEventEnded($eventId)) {
        errorResponse('This event has ended — scouting data is read-only', 403);
    }

    $formConfig = getDefaultFormConfig();
    $privateFieldIndexes = getPrivateFieldIndexes($formConfig);

    // Parse JSON data
    $dataFields = json_decode($data, true);

    // Handle backward compatibility: if JSON decode fails, try pipe-separated format
    if ($dataFields === null || !is_array($dataFields)) {
        $dataFields = explode('|', $data);
        if (isset($dataFields[0]) && strpos($dataFields[0], $eventId) !== false) {
            array_shift($dataFields);
        }
    }

    $publicData = $dataFields;

    // Replace private fields with placeholder
    foreach ($privateFieldIndexes as $index) {
        if (isset($publicData[$index])) {
            $publicData[$index] = 'Redacted Field';
        }
    }

    $seasonYear = getSeasonYear();

    // Upsert: delete existing data from this scouting team for this team/event, then insert fresh
    $stmt = $db->prepare("
        DELETE FROM scouting_data
        WHERE team_number = ? AND event_code = ? AND season_year = ? AND scouting_team = ?
    ");
    $stmt->execute([$teamNumber, $eventId, $seasonYear, $user['team_number']]);

    // Save both public and private data
    $stmt = $db->prepare("
        INSERT INTO scouting_data 
        (team_number, event_code, season_year, scouting_team, data, is_private)
        VALUES (?, ?, ?, ?, ?, 0)
    ");
    $stmt->execute([$teamNumber, $eventId, $seasonYear, $user['team_number'], json_encode($publicData)]);

    $stmt = $db->prepare("
        INSERT INTO scouting_data 
        (team_number, event_code, season_year, scouting_team, data, is_private)
        VALUES (?, ?, ?, ?, ?, 1)
    ");
    $stmt->execute([$teamNumber, $eventId, $seasonYear, $user['team_number'], json_encode($dataFields)]);

    jsonResponse(['success' => true]);

} catch (Exception $e) {
    error_log("Add scouting data error: " . $e->getMessage());
    errorResponse('Database operation failed', 500);
}
?>
