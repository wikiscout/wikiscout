<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

try {
    $token = getAuthCookie();
    if (!$token) {
        jsonResponse(['authenticated' => false]);
    }

    $db = getDb();

    // Try main account first
    $stmt = $db->prepare("
        SELECT u.id, u.team_number, u.first_name, u.last_name, u.email
        FROM auth_tokens at
        JOIN users u ON at.user_id = u.id
        WHERE at.token = ?
        AND at.user_id IS NOT NULL
        AND at.expires_at > CURRENT_TIMESTAMP
        AND at.is_revoked = 0
    ");
    $stmt->execute([$token]);
    $main = $stmt->fetch();

    if ($main) {
        $name = trim(($main['first_name'] ?? '') . ' ' . ($main['last_name'] ?? ''));
        jsonResponse([
            'authenticated' => true,
            'is_sub_account' => false,
            'id' => (int)$main['id'],
            'team_number' => $main['team_number'],
            'name' => $name ?: 'Team Member',
            'email' => $main['email'],
        ]);
    }

    // Try sub account
    $stmt = $db->prepare("
        SELECT sa.id, sa.name, sa.assigned_teams, u.team_number
        FROM auth_tokens at
        JOIN sub_accounts sa ON at.sub_account_id = sa.id
        JOIN users u ON sa.parent_user_id = u.id
        WHERE at.token = ?
        AND at.sub_account_id IS NOT NULL
        AND at.expires_at > CURRENT_TIMESTAMP
        AND at.is_revoked = 0
        AND sa.is_active = 1
    ");
    $stmt->execute([$token]);
    $sub = $stmt->fetch();

    if ($sub) {
        jsonResponse([
            'authenticated' => true,
            'is_sub_account' => true,
            'id' => (int)$sub['id'],
            'team_number' => $sub['team_number'],
            'name' => $sub['name'],
            'assigned_teams' => json_decode($sub['assigned_teams'] ?: '[]', true) ?: [],
        ]);
    }

    jsonResponse(['authenticated' => false]);

} catch (Exception $e) {
    error_log("Whoami error: " . $e->getMessage());
    jsonResponse(['authenticated' => false, 'error' => 'Server error']);
}
?>
