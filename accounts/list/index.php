<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

try {
    $user = requireMainAccount();
    $db = getDb();

    $stmt = $db->prepare("
        SELECT id, name, assigned_teams, is_active, created_at, last_login
        FROM sub_accounts
        WHERE parent_user_id = ?
        ORDER BY created_at DESC
    ");
    $stmt->execute([$user['id']]);
    $results = $stmt->fetchAll();

    $subAccounts = array_map(function ($sa) {
        return [
            'id' => (int)$sa['id'],
            'name' => $sa['name'],
            'assigned_teams' => json_decode($sa['assigned_teams'] ?: '[]', true) ?: [],
            'is_active' => (int)$sa['is_active'] === 1,
            'created_at' => $sa['created_at'],
            'last_login' => $sa['last_login'],
        ];
    }, $results);

    jsonResponse(['sub_accounts' => $subAccounts, 'count' => count($subAccounts)]);

} catch (Exception $e) {
    error_log("List sub accounts error: " . $e->getMessage());
    errorResponse('Database error', 500);
}
?>
