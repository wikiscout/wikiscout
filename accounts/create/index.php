<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

try {
    $user = requireMainAccount();
    $db = getDb();

    $body = json_decode(file_get_contents('php://input'), true);
    $name = $body['name'] ?? null;
    $assignedTeams = $body['assigned_teams'] ?? [];

    if (!$name || trim($name) === '') {
        errorResponse('Name is required', 400);
    }

    $stmt = $db->prepare("
        INSERT INTO sub_accounts (parent_user_id, name, assigned_teams)
        VALUES (?, ?, ?)
    ");
    $stmt->execute([$user['id'], trim($name), json_encode($assignedTeams)]);

    $subAccountId = $db->lastInsertId();

    jsonResponse([
        'success' => true,
        'sub_account' => [
            'id' => (int)$subAccountId,
            'name' => trim($name),
            'assigned_teams' => $assignedTeams,
            'is_active' => true,
        ],
    ]);

} catch (Exception $e) {
    error_log("Create sub account error: " . $e->getMessage());
    errorResponse('Failed to create sub account', 500);
}
?>
