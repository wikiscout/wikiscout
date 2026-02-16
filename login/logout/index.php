<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

$token = getAuthCookie();

if ($token) {
    try {
        $db = getDb();
        // Works for both main and sub account tokens
        $stmt = $db->prepare("UPDATE auth_tokens SET is_revoked = 1 WHERE token = ?");
        $stmt->execute([$token]);
    } catch (Exception $e) {
        error_log("Logout error: " . $e->getMessage());
    }
}

$isApi = isApiRequest();

if ($isApi) {
    clearAuthCookie();
    jsonResponse(['success' => true]);
}

clearAuthCookie();
header('Location: ../');
exit();
?>
