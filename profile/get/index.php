<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

try {
    $user = requireTeam();
    $db = getDb();
    $seasonYear = getSeasonYear();

    $stmt = $db->prepare("
        SELECT * FROM team_profiles
        WHERE team_number = ? AND season_year = ?
    ");
    $stmt->execute([$user['team_number'], $seasonYear]);
    $profile = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$profile) {
        jsonResponse(['profile' => null]);
    }

    // Image URLs must point to the API origin (not PUBLIC_URL which is the UI)
    $workerOrigin = getApiBaseUrl();

    $profile['original_image_url'] = $profile['original_image_path']
        ? "$workerOrigin/profile/image/{$profile['original_image_path']}"
        : null;
    $profile['rendered_image_url'] = $profile['rendered_image_path']
        ? "$workerOrigin/profile/image/{$profile['rendered_image_path']}"
        : null;
    $profile['final_image_url'] = $profile['final_image_path']
        ? "$workerOrigin/profile/image/{$profile['final_image_path']}"
        : null;
    $profile['profile_url'] = $profile['profile_slug']
        ? getPublicUrl() . "/card.html?slug={$profile['profile_slug']}"
        : null;

    jsonResponse(['profile' => $profile]);

} catch (Exception $e) {
    if ($e->getCode() === 401 || $e->getCode() === 501) {
        errorResponse($e->getMessage(), $e->getCode());
    }
    error_log("Profile get error: " . $e->getMessage());
    errorResponse('Failed to get profile', 500);
}
?>
