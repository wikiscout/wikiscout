<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

$token = getAuthCookie();
if (!$token) {
    errorResponse('No auth cookie found', 401);
}

$db = getDb();

// Try main account first
$stmt = $db->prepare("
    SELECT u.id, u.team_number, u.first_name, u.last_name
    FROM auth_tokens at
    JOIN users u ON at.user_id = u.id
    WHERE at.token = ?
    AND at.user_id IS NOT NULL
    AND at.created_at <= CURRENT_TIMESTAMP
    AND at.expires_at >= CURRENT_TIMESTAMP
    AND at.is_revoked = 0
");
$stmt->execute([$token]);
$main = $stmt->fetch();

if ($main) {
    if ($main['team_number'] === null) {
        errorResponse('No team number assigned', 501);
    }
    $name = trim(($main['first_name'] ?? '') . ' ' . ($main['last_name'] ?? ''));
    jsonResponse([
        'valid' => true,
        'team_number' => $main['team_number'],
        'name' => $name ?: 'Team Member',
        'is_sub_account' => false,
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
    AND at.created_at <= CURRENT_TIMESTAMP
    AND at.expires_at >= CURRENT_TIMESTAMP
    AND at.is_revoked = 0
    AND sa.is_active = 1
");
$stmt->execute([$token]);
$sub = $stmt->fetch();

if ($sub) {
    if ($sub['team_number'] === null) {
        errorResponse('No team number assigned', 501);
    }
    jsonResponse([
        'valid' => true,
        'team_number' => $sub['team_number'],
        'name' => $sub['name'],
        'is_sub_account' => true,
        'assigned_teams' => json_decode($sub['assigned_teams'] ?: '[]', true) ?: [],
    ]);
}

errorResponse('Invalid or expired token', 401);
?>
