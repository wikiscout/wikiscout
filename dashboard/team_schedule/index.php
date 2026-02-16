<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

try {
    $user = requireTeam();

    $eventCode = $_GET['event'] ?? null;
    if (!$eventCode) {
        errorResponse('Event code is required', 400);
    }

    if (isDevDataEvent($eventCode)) {
        // In devdata mode, filter the full schedule for the user's team
        $fullSchedule = getDemoSchedule();
        $teamNum = (int)($user['team_number'] ?? 0);
        $filtered = array_values(array_filter($fullSchedule['schedule'], function ($match) use ($teamNum) {
            foreach ($match['teams'] as $t) {
                if ($t['teamNumber'] === $teamNum) return true;
            }
            return false;
        }));
        jsonResponse(['schedule' => $filtered]);
    }

    $teamNumber = $user['team_number'];
    $seasonYear = getSeasonYear();
    $data = fetchFirstApi("schedule/$eventCode?teamNumber=$teamNumber", $seasonYear);

    jsonResponse($data);

} catch (FirstApiError $e) {
    errorResponse('Failed to fetch schedule', $e->statusCode);
} catch (Exception $e) {
    error_log("Team schedule error: " . $e->getMessage());
    errorResponse('Server error', 500);
}
?>
