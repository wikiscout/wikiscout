<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
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

    // Verify ownership and delete
    $stmt = $db->prepare("DELETE FROM sub_accounts WHERE id = ? AND parent_user_id = ?");
    $stmt->execute([$subAccountId, $user['id']]);

    if ($stmt->rowCount() === 0) {
        errorResponse('Sub account not found', 404);
    }

    jsonResponse(['success' => true]);

} catch (Exception $e) {
    error_log("Delete sub account error: " . $e->getMessage());
    errorResponse('Failed to delete sub account', 500);
}
?>
