<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

try {
    requireTeam();

    $eventId = $_GET['event'] ?? null;
    if (!$eventId) {
        errorResponse('Missing event ID', 400);
    }

    $eventId = preg_replace('/[^a-zA-Z0-9]/', '', $eventId);

    if (isDevDataEvent($eventId)) {
        $data = getDemoTeams();
    } else {
        $data = fetchFirstApi("teams?eventCode=$eventId");
    }

    $teams = array_map(fn($t) => [
        'teamNumber' => $t['teamNumber'],
        'nameShort' => $t['nameShort'] ?? '',
        'nameFull' => $t['nameFull'] ?? '',
    ], $data['teams'] ?? []);
    jsonResponse(['teams' => $teams]);

} catch (FirstApiError $e) {
    errorResponse('Failed to fetch teams', $e->statusCode);
} catch (Exception $e) {
    error_log("Teams error: " . $e->getMessage());
    errorResponse('Server error', 500);
}
?>
