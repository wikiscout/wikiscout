<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

try {
    $user = requireTeam();
    $db = getDb();

    $eventCode = $_GET['event'] ?? null;
    $matchNumber = $_GET['match'] ?? null;
    $teamNumber = $_GET['team'] ?? null;

    if (!$eventCode) {
        errorResponse('event is required', 400);
    }

    if ($matchNumber && $teamNumber) {
        // Get notes for a specific match + team combo
        // Private notes: only from this user
        $stmt = $db->prepare("
            SELECT id, match_number, team_number, notes, is_private, created_at, updated_at
            FROM match_notes
            WHERE event_code = ? AND match_number = ? AND team_number = ? AND user_id = ? AND is_private = 1
            ORDER BY updated_at DESC
        ");
        $stmt->execute([$eventCode, $matchNumber, $teamNumber, $user['id']]);
        $privateNotes = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Public notes: from all users
        $stmt = $db->prepare("
            SELECT mn.id, mn.match_number, mn.team_number, mn.notes, mn.is_private, mn.created_at, mn.updated_at,
                   u.team_number as scouting_team
            FROM match_notes mn
            LEFT JOIN users u ON mn.user_id = u.id
            WHERE mn.event_code = ? AND mn.match_number = ? AND mn.team_number = ? AND mn.is_private = 0
            ORDER BY mn.updated_at DESC
        ");
        $stmt->execute([$eventCode, $matchNumber, $teamNumber]);
        $publicNotes = $stmt->fetchAll(PDO::FETCH_ASSOC);

        jsonResponse([
            'private_notes' => $privateNotes,
            'public_notes' => $publicNotes,
        ]);

    } elseif ($teamNumber) {
        // Get all match notes for a specific team across all matches
        $stmt = $db->prepare("
            SELECT id, match_number, team_number, notes, is_private, created_at, updated_at
            FROM match_notes
            WHERE event_code = ? AND team_number = ? AND user_id = ? AND is_private = 1
            ORDER BY match_number ASC
        ");
        $stmt->execute([$eventCode, $teamNumber, $user['id']]);
        $privateNotes = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $stmt = $db->prepare("
            SELECT mn.id, mn.match_number, mn.team_number, mn.notes, mn.is_private, mn.created_at, mn.updated_at,
                   u.team_number as scouting_team
            FROM match_notes mn
            LEFT JOIN users u ON mn.user_id = u.id
            WHERE mn.event_code = ? AND mn.team_number = ? AND mn.is_private = 0
            ORDER BY mn.match_number ASC
        ");
        $stmt->execute([$eventCode, $teamNumber]);
        $publicNotes = $stmt->fetchAll(PDO::FETCH_ASSOC);

        jsonResponse([
            'private_notes' => $privateNotes,
            'public_notes' => $publicNotes,
        ]);

    } elseif ($matchNumber) {
        // Get all notes for a specific match (all teams)
        $stmt = $db->prepare("
            SELECT id, match_number, team_number, notes, is_private, created_at, updated_at
            FROM match_notes
            WHERE event_code = ? AND match_number = ? AND user_id = ? AND is_private = 1
            ORDER BY team_number ASC
        ");
        $stmt->execute([$eventCode, $matchNumber, $user['id']]);
        $privateNotes = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $stmt = $db->prepare("
            SELECT mn.id, mn.match_number, mn.team_number, mn.notes, mn.is_private, mn.created_at, mn.updated_at,
                   u.team_number as scouting_team
            FROM match_notes mn
            LEFT JOIN users u ON mn.user_id = u.id
            WHERE mn.event_code = ? AND mn.match_number = ? AND mn.is_private = 0
            ORDER BY mn.team_number ASC
        ");
        $stmt->execute([$eventCode, $matchNumber]);
        $publicNotes = $stmt->fetchAll(PDO::FETCH_ASSOC);

        jsonResponse([
            'private_notes' => $privateNotes,
            'public_notes' => $publicNotes,
        ]);

    } else {
        // Get all notes for this event by this user (summary)
        $stmt = $db->prepare("
            SELECT id, match_number, team_number, notes, is_private, created_at, updated_at
            FROM match_notes
            WHERE event_code = ? AND user_id = ?
            ORDER BY match_number ASC, team_number ASC
        ");
        $stmt->execute([$eventCode, $user['id']]);
        $allNotes = $stmt->fetchAll(PDO::FETCH_ASSOC);

        jsonResponse([
            'notes' => $allNotes,
        ]);
    }

} catch (Exception $e) {
    if ($e->getCode() === 401) {
        errorResponse('Unauthorized', 401);
    }
    error_log("Match notes get error: " . $e->getMessage());
    errorResponse('Failed to get match notes', 500);
}
?>
