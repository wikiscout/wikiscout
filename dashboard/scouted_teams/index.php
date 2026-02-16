<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

try {
    $user = requireTeam();
    $db = getDb();

    $eventCode = $_GET['event'] ?? null;
    if (!$eventCode) {
        errorResponse('Event code is required', 400);
    }

    $seasonYear = getSeasonYear();

    // Get related event codes for cross-division data sharing
    $relatedEvents = getRelatedEventCodes($eventCode, $user['team_number']);
    $eventPlaceholders = implode(',', array_fill(0, count($relatedEvents), '?'));

    // Get distinct team numbers that this scouting team has already scouted at this event (or related events)
    $params = array_merge($relatedEvents, [$seasonYear, $user['team_number']]);
    $stmt = $db->prepare("
        SELECT DISTINCT team_number
        FROM scouting_data
        WHERE event_code IN ($eventPlaceholders) AND season_year = ? AND scouting_team = ?
    ");
    $stmt->execute($params);
    $results = $stmt->fetchAll();

    $scoutedTeams = array_column($results, 'team_number');

    jsonResponse(['scouted_teams' => $scoutedTeams]);

} catch (Exception $e) {
    error_log("Scouted teams error: " . $e->getMessage());
    errorResponse('Server error', 500);
}
?>
