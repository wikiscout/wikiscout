<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

try {
    requireTeam();

    $seasonYear = getSeasonYear();
    $data = fetchFirstApi('events/', $seasonYear);

    $currentDate = date('Y-m-d');
    $currentTime = time();
    $currentEvents = [];

    foreach ($data['events'] ?? [] as $event) {
        if (!isset($event['dateStart']) || !isset($event['dateEnd'])) continue;

        $startDate = substr($event['dateStart'], 0, 10);
        $endDate = substr($event['dateEnd'], 0, 10);
        $startTime = strtotime($event['dateStart']);
        $endTime = strtotime($event['dateEnd']);

        if ($startDate === $endDate) {
            if ($currentDate === $startDate) {
                $currentEvents[] = ['code' => $event['code'], 'name' => $event['name']];
            }
        } else {
            $endTimeWithBuffer = $endTime + 86400;
            if ($currentTime >= $startTime && $currentTime <= $endTimeWithBuffer) {
                $currentEvents[] = ['code' => $event['code'], 'name' => $event['name']];
            }
        }
    }

    jsonResponse([
        'events' => $currentEvents,
        'count' => count($currentEvents),
    ]);

} catch (FirstApiError $e) {
    errorResponse('Failed to fetch events', $e->statusCode);
} catch (Exception $e) {
    error_log("Today error: " . $e->getMessage());
    errorResponse('Server error', 500);
}
?>
