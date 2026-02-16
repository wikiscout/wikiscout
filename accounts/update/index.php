<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

if ($_SERVER['REQUEST_METHOD'] !== 'PUT' && $_SERVER['REQUEST_METHOD'] !== 'PATCH') {
    errorResponse('Method not allowed', 405);
}

try {
    $user = requireMainAccount();
    $db = getDb();

    $subAccountId = $_GET['id'] ?? null;
    if (!$subAccountId) {
        errorResponse('Sub account ID is required', 400);
    }

    $subAccountId = (int)$subAccountId;
    if ($subAccountId <= 0) {
        errorResponse('Invalid sub account ID', 400);
    }

    // Verify ownership
    $stmt = $db->prepare("SELECT id FROM sub_accounts WHERE id = ? AND parent_user_id = ?");
    $stmt->execute([$subAccountId, $user['id']]);
    if (!$stmt->fetch()) {
        errorResponse('Sub account not found', 404);
    }

    $body = json_decode(file_get_contents('php://input'), true);
    $updates = [];
    $values = [];

    if (isset($body['name'])) {
        $updates[] = 'name = ?';
        $values[] = trim($body['name']);
    }

    if (isset($body['assigned_teams'])) {
        $updates[] = 'assigned_teams = ?';
        $values[] = json_encode($body['assigned_teams']);
    }

    if (isset($body['is_active'])) {
        $updates[] = 'is_active = ?';
        $values[] = $body['is_active'] ? 1 : 0;
    }

    if (empty($updates)) {
        errorResponse('No updates provided', 400);
    }

    $values[] = $subAccountId;

    $sql = "UPDATE sub_accounts SET " . implode(', ', $updates) . " WHERE id = ?";
    $stmt = $db->prepare($sql);
    $stmt->execute($values);

    jsonResponse(['success' => true]);

} catch (Exception $e) {
    error_log("Update sub account error: " . $e->getMessage());
    errorResponse('Failed to update sub account', 500);
}
?>
