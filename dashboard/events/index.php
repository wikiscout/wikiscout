<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

try {
    requireTeam();

    $seasonParam = $_GET['season'] ?? null;
    $teamParam = $_GET['team'] ?? null;
    $searchParam = strtolower($_GET['q'] ?? '');

    $seasonYear = $seasonParam ? (int)$seasonParam : getSeasonYear();

    // Build the endpoint with optional team filter
    $endpoint = 'events/';
    if ($teamParam) {
        $endpoint .= "?teamNumber=$teamParam";
    }

    $data = fetchFirstApi($endpoint, $seasonYear);

    $currentDate = date('Y-m-d');
    $currentTime = time();

    // Map events with status and filter by search
    $events = array_map(function ($event) use ($currentTime) {
        $status = 'upcoming';
        if (isset($event['dateStart']) && isset($event['dateEnd'])) {
            $endTime = strtotime($event['dateEnd']) + 86400;
            $startTime = strtotime($event['dateStart']);
            if ($currentTime > $endTime) {
                $status = 'past';
            } elseif ($currentTime >= $startTime && $currentTime <= $endTime) {
                $status = 'live';
            }
        }

        return [
            'code' => $event['code'] ?? '',
            'name' => $event['name'] ?? '',
            'type' => $event['typeName'] ?? $event['type'] ?? '',
            'city' => $event['city'] ?? '',
            'stateprov' => $event['stateprov'] ?? '',
            'country' => $event['country'] ?? '',
            'venue' => $event['venue'] ?? '',
            'dateStart' => $event['dateStart'] ?? '',
            'dateEnd' => $event['dateEnd'] ?? '',
            'regionCode' => $event['regionCode'] ?? '',
            'districtCode' => $event['districtCode'] ?? '',
            'status' => $status,
        ];
    }, $data['events'] ?? []);

    // Apply search filter
    if ($searchParam) {
        $events = array_values(array_filter($events, function ($e) use ($searchParam) {
            return str_contains(strtolower($e['code']), $searchParam)
                || str_contains(strtolower($e['name']), $searchParam)
                || str_contains(strtolower($e['city']), $searchParam)
                || str_contains(strtolower($e['stateprov']), $searchParam)
                || str_contains(strtolower($e['country']), $searchParam)
                || str_contains(strtolower($e['venue']), $searchParam)
                || str_contains(strtolower($e['type']), $searchParam)
                || str_contains(strtolower($e['regionCode']), $searchParam)
                || str_contains(strtolower($e['districtCode']), $searchParam);
        }));
    }

    // Sort: live first, then upcoming (soonest first), then past (most recent first)
    $statusOrder = ['live' => 0, 'upcoming' => 1, 'past' => 2];
    usort($events, function ($a, $b) use ($statusOrder) {
        $orderA = $statusOrder[$a['status']] ?? 3;
        $orderB = $statusOrder[$b['status']] ?? 3;
        if ($orderA !== $orderB) return $orderA - $orderB;

        $dateA = strtotime($a['dateStart'] ?: '2000-01-01');
        $dateB = strtotime($b['dateStart'] ?: '2000-01-01');
        if ($a['status'] === 'past') return $dateB - $dateA;
        return $dateA - $dateB;
    });

    jsonResponse([
        'events' => $events,
        'count' => count($events),
        'season' => $seasonYear,
    ]);

} catch (FirstApiError $e) {
    errorResponse('Failed to fetch events', $e->statusCode);
} catch (Exception $e) {
    error_log("Events error: " . $e->getMessage());
    errorResponse('Server error', 500);
}
?>
