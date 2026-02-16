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
        $data = getDemoSchedule();
    } else {
        $seasonYear = getSeasonYear();
        $data = fetchFirstApi("schedule/$eventCode/qual/hybrid", $seasonYear);
    }

    jsonResponse($data);

} catch (FirstApiError $e) {
    errorResponse('Failed to fetch schedule', $e->statusCode);
} catch (Exception $e) {
    error_log("Event schedule error: " . $e->getMessage());
    errorResponse('Server error', 500);
}
?>
