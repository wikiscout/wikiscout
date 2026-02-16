<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

try {
    $user = requireTeam();
    $teamNumber = $user['team_number'];

    global $mobileRefreshInterval, $desktopRefreshInterval;

    $seasonYear = getSeasonYear();
    $data = fetchFirstApi("events?teamNumber=$teamNumber", $seasonYear);

    $currentDate = date('Y-m-d');
    $currentTime = time();

    // Build full list of team events with status
    $allEvents = [];
    foreach ($data['events'] ?? [] as $event) {
        if (!isset($event['dateStart']) || !isset($event['dateEnd'])) continue;

        $startDate = substr($event['dateStart'], 0, 10);
        $endDate = substr($event['dateEnd'], 0, 10);
        $startTime = strtotime($event['dateStart']);
        $endTime = strtotime($event['dateEnd']);

        $isActive = ($startDate === $endDate)
            ? ($currentDate === $startDate)
            : ($currentTime >= $startTime && $currentTime <= $endTime + 86400);

        $status = 'upcoming';
        if ($currentTime > $endTime + 86400) {
            $status = 'past';
        } elseif ($isActive) {
            $status = 'live';
        }

        $allEvents[] = [
            'code' => $event['code'] ?? '',
            'name' => $event['name'] ?? '',
            'startDate' => $event['dateStart'],
            'endDate' => $event['dateEnd'],
            'status' => $status,
        ];
    }

    // Find active event(s)
    $activeEvents = array_values(array_filter($allEvents, fn($e) => $e['status'] === 'live'));

    $config = [
        'mobile_refresh_interval' => (int)($mobileRefreshInterval ?? 15000),
        'desktop_refresh_interval' => (int)($desktopRefreshInterval ?? 5000),
    ];

    if (count($activeEvents) > 0) {
        // Sort by code length descending — longer code = more specific division
        usort($activeEvents, fn($a, $b) => strlen($b['code']) - strlen($a['code']));

        jsonResponse([
            'found' => true,
            'event' => $activeEvents[0],
            'allEvents' => $allEvents,
            'teamNumber' => $teamNumber,
            'config' => $config,
        ]);
    }

    jsonResponse([
        'found' => false,
        'message' => 'Team not found at any current event',
        'allEvents' => $allEvents,
        'teamNumber' => $teamNumber,
        'currentDate' => $currentDate,
        'seasonYear' => $seasonYear,
        'config' => $config,
    ]);

} catch (FirstApiError $e) {
    errorResponse('Failed to fetch events', $e->statusCode);
} catch (Exception $e) {
    error_log("Me error: " . $e->getMessage());
    errorResponse('Server error', 500);
}
?>
