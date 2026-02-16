<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

try {
    $user = requireMainAccount();
    $db = getDb();
    $seasonYear = getSeasonYear();
    $data = json_decode(file_get_contents('php://input'), true) ?? [];

    // Check if profile exists
    $stmt = $db->prepare("
        SELECT id, profile_slug FROM team_profiles
        WHERE team_number = ? AND season_year = ?
    ");
    $stmt->execute([$user['team_number'], $seasonYear]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);

    $profileSlug = $existing ? $existing['profile_slug'] : generateProfileSlug($user['team_number']);

    $autoPointsLow = $data['auto_points_low'] ?? 0;
    $autoPointsHigh = $data['auto_points_high'] ?? 0;
    $teleopPointsLow = $data['teleop_points_low'] ?? 0;
    $teleopPointsHigh = $data['teleop_points_high'] ?? 0;
    $endgamePoints = $data['endgame_points'] ?? 0;
    $canClimb = !empty($data['can_climb']) ? 1 : 0;
    $climbLevel = $data['climb_level'] ?? null;
    $canShootNear = !empty($data['can_shoot_near']) ? 1 : 0;
    $canShootFar = !empty($data['can_shoot_far']) ? 1 : 0;
    $canIntakeGround = !empty($data['can_intake_ground']) ? 1 : 0;
    $canIntakeSource = !empty($data['can_intake_source']) ? 1 : 0;
    $drivetrainType = $data['drivetrain_type'] ?? null;
    $autoDescription = $data['auto_description'] ?? null;
    $robotDescription = $data['robot_description'] ?? null;
    $strategyNotes = $data['strategy_notes'] ?? null;
    $customNotes = $data['custom_notes'] ?? null;
    $isPublic = ($data['is_public'] ?? true) !== false ? 1 : 0;

    if ($existing) {
        $stmt = $db->prepare("
            UPDATE team_profiles SET
                auto_points_low = ?,
                auto_points_high = ?,
                teleop_points_low = ?,
                teleop_points_high = ?,
                endgame_points = ?,
                can_climb = ?,
                climb_level = ?,
                can_shoot_near = ?,
                can_shoot_far = ?,
                can_intake_ground = ?,
                can_intake_source = ?,
                drivetrain_type = ?,
                auto_description = ?,
                robot_description = ?,
                strategy_notes = ?,
                custom_notes = ?,
                is_public = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ");
        $stmt->execute([
            $autoPointsLow, $autoPointsHigh, $teleopPointsLow, $teleopPointsHigh,
            $endgamePoints, $canClimb, $climbLevel, $canShootNear, $canShootFar,
            $canIntakeGround, $canIntakeSource, $drivetrainType,
            $autoDescription, $robotDescription, $strategyNotes, $customNotes,
            $isPublic, $existing['id']
        ]);
    } else {
        $stmt = $db->prepare("
            INSERT INTO team_profiles (
                team_number, user_id, season_year, profile_slug,
                auto_points_low, auto_points_high, teleop_points_low, teleop_points_high, endgame_points,
                can_climb, climb_level, can_shoot_near, can_shoot_far, can_intake_ground, can_intake_source,
                drivetrain_type, auto_description, robot_description, strategy_notes, custom_notes, is_public
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $user['team_number'], $user['id'], $seasonYear, $profileSlug,
            $autoPointsLow, $autoPointsHigh, $teleopPointsLow, $teleopPointsHigh,
            $endgamePoints, $canClimb, $climbLevel, $canShootNear, $canShootFar,
            $canIntakeGround, $canIntakeSource, $drivetrainType,
            $autoDescription, $robotDescription, $strategyNotes, $customNotes,
            $isPublic
        ]);
    }

    jsonResponse([
        'success' => true,
        'profile_slug' => $profileSlug,
        'profile_url' => getPublicUrl() . "/card.html?slug=$profileSlug",
    ]);

} catch (Exception $e) {
    if ($e->getCode() === 401 || $e->getCode() === 501) {
        errorResponse($e->getMessage(), $e->getCode());
    }
    error_log("Profile save error: " . $e->getMessage());
    errorResponse('Failed to save profile', 500);
}
?>
