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
        $data = getDemoRankings();
    } else {
        $seasonYear = getSeasonYear();
        $data = fetchFirstApi("rankings/$eventCode?teamNumber=0&top=0", $seasonYear);
    }

    $rankings = array_map(function($team) {
        return [
            'rank' => $team['rank'],
            'teamNumber' => $team['teamNumber'],
            'teamName' => $team['teamName'],
            'wins' => $team['wins'],
            'losses' => $team['losses'],
            'ties' => $team['ties'],
            'matchesPlayed' => $team['matchesPlayed'],
        ];
    }, $data['rankings'] ?? []);

    jsonResponse([
        'rankings' => $rankings,
        'count' => count($rankings),
    ]);

} catch (FirstApiError $e) {
    errorResponse('Failed to fetch rankings', $e->statusCode);
} catch (Exception $e) {
    error_log("Rankings error: " . $e->getMessage());
    errorResponse('Server error', 500);
}
?>
