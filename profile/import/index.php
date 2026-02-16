<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

try {
    $user = requireTeam();
    $db = getDb();

    $body = json_decode(file_get_contents('php://input'), true);
    $profileSlug = $body['profile_slug'] ?? null;
    $eventCode = $body['event_code'] ?? null;

    if (!$profileSlug || !$eventCode) {
        errorResponse('Missing profile_slug or event_code', 400);
    }

    // Get the profile
    $stmt = $db->prepare("
        SELECT * FROM team_profiles
        WHERE profile_slug = ? AND is_public = 1
    ");
    $stmt->execute([$profileSlug]);
    $profile = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$profile) {
        errorResponse('Profile not found', 404);
    }

    // Convert profile to scouting data format
    $canShootFar = (bool)$profile['can_shoot_far'];
    $canShootNear = (bool)$profile['can_shoot_near'];
    $shootingDistance = ($canShootFar && $canShootNear) ? 'Both' : ($canShootFar ? 'Far' : 'Near');

    $scoutingData = [
        $profile['drivetrain_type'] === 'mecanum' ? 'true' : 'false', // Mecanum Drive Train
        '0', // Driver Practice (not in profile)
        (string)$profile['teleop_points_high'], // Tele-OP Balls (using high score estimate)
        $shootingDistance, // Shooting Distance
        (string)$profile['auto_points_high'], // Auto Balls (using high score estimate)
        $shootingDistance, // Auto Shooting
        (string)$profile['auto_points_high'], // Auto Points
        'true', // Leave (assume they leave)
        $profile['auto_description'] ?: 'Auto-imported from team profile', // Auto Details
        "Imported from Team {$profile['team_number']}'s trading card profile. " . ($profile['robot_description'] ?? ''), // Private Notes
    ];

    $seasonYear = getSeasonYear();

    // Save to scouting data
    $stmt = $db->prepare("
        INSERT INTO scouting_data
        (team_number, event_code, season_year, scouting_team, data, is_private)
        VALUES (?, ?, ?, ?, ?, 1)
    ");
    $stmt->execute([
        $profile['team_number'],
        $eventCode,
        $seasonYear,
        $user['team_number'],
        json_encode($scoutingData),
    ]);

    jsonResponse([
        'success' => true,
        'message' => "Imported profile for Team {$profile['team_number']}",
    ]);

} catch (Exception $e) {
    if ($e->getCode() === 401 || $e->getCode() === 501) {
        errorResponse($e->getMessage(), $e->getCode());
    }
    error_log("Profile import error: " . $e->getMessage());
    errorResponse('Failed to import profile', 500);
}
?>
