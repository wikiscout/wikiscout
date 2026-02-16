<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

try {
    $user = requireTeam();
    $db = getDb();

    $teamNumber = $_GET['team'] ?? null;
    $eventCode = $_GET['event'] ?? null;

    if (!$teamNumber || !$eventCode) {
        errorResponse('Team number and event code are required', 400);
    }

    // DEVDATA events — return demo scouting data
    if (isDevDataEvent($eventCode)) {
        jsonResponse(getDemoScoutingData($teamNumber));
    }

    $seasonYear = getSeasonYear();
    $formConfig = getDefaultFormConfig();
    $formFields = getFormFields($formConfig);

    // Get related event codes for cross-division data sharing
    $relatedEvents = getRelatedEventCodes($eventCode, $user['team_number']);
    $eventPlaceholders = implode(',', array_fill(0, count($relatedEvents), '?'));

    // Get private data (only the requesting team's) across related events
    $params = array_merge([$teamNumber], $relatedEvents, [$seasonYear, $user['team_number']]);
    $stmt = $db->prepare("
        SELECT data, scouting_team, event_code
        FROM scouting_data 
        WHERE team_number = ? AND event_code IN ($eventPlaceholders)
        AND season_year = ? AND is_private = 1
        AND scouting_team = ?
        ORDER BY created_at DESC LIMIT 1
    ");
    $stmt->execute($params);
    $privateData = $stmt->fetch();

    // Get public data (excluding the requesting team's) across related events
    $params = array_merge([$teamNumber], $relatedEvents, [$seasonYear, $user['team_number']]);
    $stmt = $db->prepare("
        SELECT data, scouting_team, event_code
        FROM scouting_data 
        WHERE team_number = ? AND event_code IN ($eventPlaceholders)
        AND season_year = ? AND is_private = 0
        AND scouting_team != ?
        ORDER BY created_at DESC
    ");
    $stmt->execute($params);
    $publicDataResults = $stmt->fetchAll();

    // Parse private data
    $privateDataArray = [];
    if (!empty($privateData['data'])) {
        $decoded = json_decode($privateData['data'], true);
        if ($decoded !== null && is_array($decoded)) {
            $privateDataArray = $decoded;
        } else {
            $privateDataArray = explode('|', $privateData['data']);
        }
    }

    // Parse public data
    $publicDataArray = array_map(function($entry) {
        $decoded = json_decode($entry['data'], true);
        if ($decoded !== null && is_array($decoded)) {
            $dataArray = $decoded;
        } else {
            $dataArray = explode('|', $entry['data']);
        }
        return [
            'data' => $dataArray,
            'scouting_team' => $entry['scouting_team']
        ];
    }, $publicDataResults);

    $response = [
        'fields' => $formFields,
        'private_data' => [
            'data' => $privateDataArray,
            'scouting_team' => $privateData['scouting_team'] ?? null
        ],
        'public_data' => $publicDataArray,
        'debug' => [
            'team' => $teamNumber,
            'event' => $eventCode,
            'season' => $seasonYear,
            'requesting_team' => $user['team_number'],
            'has_private' => !empty($privateData),
            'has_public' => count($publicDataArray) > 0,
            'related_events' => $relatedEvents,
        ],
    ];

    if (count($relatedEvents) > 1) {
        $response['related_events'] = $relatedEvents;
    }

    jsonResponse($response);

} catch (Exception $e) {
    error_log("View error: " . $e->getMessage());
    errorResponse('Database error', 500);
}
?>
