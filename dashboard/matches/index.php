<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

try {
    requireTeam();

    $eventCode = $_GET['event'] ?? null;
    if (!$eventCode) {
        errorResponse('Event code is required', 400);
    }

    if (isDevDataEvent($eventCode)) {
        $data = getDemoMatches();
    } else {
        $seasonYear = getSeasonYear();
        $data = fetchFirstApi("matches/$eventCode", $seasonYear);
    }

    // Transform the matches data (same format as TS API)
    $simplifiedMatches = array_map(function($match) {
        $redTeams = array_filter($match['teams'], fn($t) => str_contains($t['station'], 'Red'));
        $blueTeams = array_filter($match['teams'], fn($t) => str_contains($t['station'], 'Blue'));

        return [
            'description' => $match['description'],
            'tournamentLevel' => $match['tournamentLevel'],
            'matchNumber' => $match['matchNumber'],
            'red' => [
                'total' => $match['scoreRedFinal'],
                'auto' => $match['scoreRedAuto'],
                'foul' => $match['scoreRedFoul'],
                'teams' => array_values(array_map(fn($t) => $t['teamNumber'], $redTeams)),
            ],
            'blue' => [
                'total' => $match['scoreBlueFinal'],
                'auto' => $match['scoreBlueAuto'],
                'foul' => $match['scoreBlueFoul'],
                'teams' => array_values(array_map(fn($t) => $t['teamNumber'], $blueTeams)),
            ],
        ];
    }, $data['matches'] ?? []);

    jsonResponse(['matches' => $simplifiedMatches]);

} catch (FirstApiError $e) {
    errorResponse('Failed to fetch matches', $e->statusCode);
} catch (Exception $e) {
    error_log("Matches error: " . $e->getMessage());
    errorResponse('Server error', 500);
}
?>
