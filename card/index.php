<?php
require_once __DIR__ . '/../helpers.php';
bootstrap();

// Get public profile (trading card view)
// URL pattern: /card/{slug}
$requestUri = $_SERVER['REQUEST_URI'] ?? '';
$pathMatch = null;
if (preg_match('#/card/([^/]+)#', $requestUri, $pathMatch)) {
    $slug = $pathMatch[1];
    // Remove query string if present
    $slug = strtok($slug, '?');
} else {
    errorResponse('Invalid path', 400);
}

try {
    $db = getDb();

    $stmt = $db->prepare("
        SELECT * FROM team_profiles
        WHERE profile_slug = ? AND is_public = 1
    ");
    $stmt->execute([$slug]);
    $profile = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$profile) {
        errorResponse('Profile not found', 404);
    }

    $workerOrigin = getApiBaseUrl();

    $profileWithUrls = [
        'team_number' => $profile['team_number'],
        'season_year' => $profile['season_year'],

        // Stats
        'auto_points_low' => $profile['auto_points_low'],
        'auto_points_high' => $profile['auto_points_high'],
        'teleop_points_low' => $profile['teleop_points_low'],
        'teleop_points_high' => $profile['teleop_points_high'],
        'endgame_points' => $profile['endgame_points'],

        // Capabilities
        'can_climb' => (bool)$profile['can_climb'],
        'climb_level' => $profile['climb_level'],
        'can_shoot_near' => (bool)$profile['can_shoot_near'],
        'can_shoot_far' => (bool)$profile['can_shoot_far'],
        'can_intake_ground' => (bool)$profile['can_intake_ground'],
        'can_intake_source' => (bool)$profile['can_intake_source'],
        'drivetrain_type' => $profile['drivetrain_type'],

        // Descriptions
        'auto_description' => $profile['auto_description'],
        'robot_description' => $profile['robot_description'],
        'strategy_notes' => $profile['strategy_notes'],

        // Images
        'original_image_url' => $profile['original_image_path']
            ? "$workerOrigin/profile/image/{$profile['original_image_path']}"
            : null,
        'rendered_image_url' => $profile['rendered_image_path']
            ? "$workerOrigin/profile/image/{$profile['rendered_image_path']}"
            : null,
        'final_image_url' => $profile['final_image_path']
            ? "$workerOrigin/profile/image/{$profile['final_image_path']}"
            : null,

        // Meta
        'profile_slug' => $profile['profile_slug'],
        'profile_url' => getPublicUrl() . "/card.html?slug={$profile['profile_slug']}",
    ];

    jsonResponse(['profile' => $profileWithUrls]);

} catch (Exception $e) {
    error_log("Public profile error: " . $e->getMessage());
    errorResponse('Failed to get profile', 500);
}
?>
