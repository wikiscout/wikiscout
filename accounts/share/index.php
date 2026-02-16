<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

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
    $stmt = $db->prepare("SELECT id, name FROM sub_accounts WHERE id = ? AND parent_user_id = ? AND is_active = 1");
    $stmt->execute([$subAccountId, $user['id']]);
    $existing = $stmt->fetch();

    if (!$existing) {
        errorResponse('Sub account not found or inactive', 404);
    }

    // Check for existing valid token
    $stmt = $db->prepare("
        SELECT token, otp_code, expires_at FROM one_time_tokens
        WHERE sub_account_id = ?
        AND expires_at > CURRENT_TIMESTAMP
        AND is_used = 0
        ORDER BY created_at DESC
        LIMIT 1
    ");
    $stmt->execute([$subAccountId]);
    $existingToken = $stmt->fetch();

    if ($existingToken && $_SERVER['REQUEST_METHOD'] === 'GET') {
        // Return existing valid credentials
        jsonResponse([
            'sub_account_id' => $subAccountId,
            'sub_account_name' => $existing['name'],
            'otp_code' => $existingToken['otp_code'],
            'token' => $existingToken['token'],
            'expires_at' => $existingToken['expires_at'],
        ]);
    }

    // Generate new credentials (POST to force regenerate, or GET when none exist)
    $oneTimeToken = generateOneTimeToken();
    $otpCode = generateOtp();
    $expiresAt = date('Y-m-d H:i:s', strtotime('+24 hours'));

    // Invalidate existing tokens for this sub account
    $stmt = $db->prepare("
        UPDATE one_time_tokens
        SET is_used = 1
        WHERE sub_account_id = ?
        AND is_used = 0
    ");
    $stmt->execute([$subAccountId]);

    // Create new token
    $stmt = $db->prepare("
        INSERT INTO one_time_tokens (sub_account_id, token, otp_code, expires_at)
        VALUES (?, ?, ?, ?)
    ");
    $stmt->execute([$subAccountId, $oneTimeToken, $otpCode, $expiresAt]);

    jsonResponse([
        'sub_account_id' => $subAccountId,
        'sub_account_name' => $existing['name'],
        'otp_code' => $otpCode,
        'token' => $oneTimeToken,
        'expires_at' => $expiresAt,
    ]);

} catch (Exception $e) {
    error_log("Share sub account error: " . $e->getMessage());
    errorResponse('Failed to generate login credentials', 500);
}
?>
