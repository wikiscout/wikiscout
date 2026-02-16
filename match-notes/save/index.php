<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method Not Allowed', 405);
}

try {
    $user = requireTeam();
    $db = getDb();

    $body = json_decode(file_get_contents('php://input'), true);
    $eventCode = $body['event_code'] ?? null;
    $matchNumber = $body['match_number'] ?? null;
    $teamNumber = $body['team_number'] ?? null;
    $notes = $body['notes'] ?? '';
    $isPrivate = !empty($body['is_private']) ? 1 : 0;

    if (!$eventCode || !$matchNumber || !$teamNumber) {
        errorResponse('Missing required fields: event_code, match_number, team_number', 400);
    }

    // DEVDATA0 is read-only — block all saves
    if (strtoupper($eventCode) === 'DEVDATA0') {
        errorResponse('Demo event DEVDATA0 is read-only', 403);
    }

    // Block writes to events that have ended
    if (isEventEnded($eventCode)) {
        errorResponse('This event has ended — match notes are read-only', 403);
    }

    // Check if note already exists for this user/match/team combo
    $stmt = $db->prepare("
        SELECT id FROM match_notes
        WHERE user_id = ? AND event_code = ? AND match_number = ? AND team_number = ? AND is_private = ?
    ");
    $stmt->execute([$user['id'], $eventCode, $matchNumber, $teamNumber, $isPrivate]);
    $existing = $stmt->fetch();

    if ($existing) {
        // Update existing note
        $stmt = $db->prepare("
            UPDATE match_notes SET notes = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ");
        $stmt->execute([$notes, $existing['id']]);
    } else {
        // Insert new note
        $stmt = $db->prepare("
            INSERT INTO match_notes (user_id, event_code, match_number, team_number, notes, is_private)
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([$user['id'], $eventCode, $matchNumber, $teamNumber, $notes, $isPrivate]);
    }

    jsonResponse(['success' => true]);

} catch (Exception $e) {
    error_log("Match note save error: " . $e->getMessage());
    errorResponse('Failed to save match note', 500);
}
?>
