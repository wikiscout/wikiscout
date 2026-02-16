<?php
require_once __DIR__ . '/../../../helpers.php';
bootstrap();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

try {
    $db = getDb();
    $body = json_decode(file_get_contents('php://input'), true);
    $token = $body['token'] ?? null;

    if (!$token) {
        errorResponse('Token is required', 400);
    }

    // First check if the token exists at all (for better error messages)
    $stmt = $db->prepare("
        SELECT ott.id, ott.is_used, ott.expires_at, sa.is_active
        FROM one_time_tokens ott
        JOIN sub_accounts sa ON ott.sub_account_id = sa.id
        WHERE ott.token = ?
    ");
    $stmt->execute([$token]);
    $tokenExists = $stmt->fetch();

    if (!$tokenExists) {
        errorResponse('Invalid login link. Please ask your team lead for a new QR code.', 401);
    }

    if ((int)$tokenExists['is_used']) {
        errorResponse('This login link has already been used. Please ask for a new QR code.', 401);
    }

    if (strtotime($tokenExists['expires_at']) <= time()) {
        errorResponse('This login link has expired. Please ask for a new QR code.', 401);
    }

    if (!(int)$tokenExists['is_active']) {
        errorResponse('Your account has been deactivated. Contact your team lead.', 401);
    }

    // Find valid one-time token with all the joins
    $stmt = $db->prepare("
        SELECT ott.id, ott.sub_account_id, sa.name, sa.parent_user_id, u.team_number
        FROM one_time_tokens ott
        JOIN sub_accounts sa ON ott.sub_account_id = sa.id
        JOIN users u ON sa.parent_user_id = u.id
        WHERE ott.token = ?
        AND ott.expires_at > CURRENT_TIMESTAMP
        AND ott.is_used = 0
        AND sa.is_active = 1
    ");
    $stmt->execute([$token]);
    $oneTimeToken = $stmt->fetch();

    if (!$oneTimeToken) {
        errorResponse('Login failed due to a data issue. Please ask for a new QR code.', 401);
    }

    // Mark one-time token as used
    $stmt = $db->prepare("UPDATE one_time_tokens SET is_used = 1 WHERE id = ?");
    $stmt->execute([$oneTimeToken['id']]);

    // Generate session token
    $sessionToken = generateToken();
    $sessionExpires = date('Y-m-d H:i:s', strtotime('+7 days'));

    $stmt = $db->prepare("
        INSERT INTO auth_tokens (sub_account_id, token, expires_at)
        VALUES (?, ?, ?)
    ");
    $stmt->execute([$oneTimeToken['sub_account_id'], $sessionToken, $sessionExpires]);

    // Update last login
    $stmt = $db->prepare("UPDATE sub_accounts SET last_login = CURRENT_TIMESTAMP WHERE id = ?");
    $stmt->execute([$oneTimeToken['sub_account_id']]);

    setAuthCookie($sessionToken, 7 * 24 * 60 * 60);
    jsonResponse([
        'success' => true,
        'name' => $oneTimeToken['name'],
        'team_number' => $oneTimeToken['team_number'],
        'is_sub_account' => true,
    ]);

} catch (Exception $e) {
    error_log("Sub account token login error: " . $e->getMessage());
    errorResponse('Login failed: ' . $e->getMessage(), 500);
}
?>
