<?php
require_once __DIR__ . '/../../helpers.php';
bootstrap();

if ($_SERVER['REQUEST_METHOD'] === 'GET' || empty($_POST)) {
    header('Location: ../../');
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

$isApi = isApiRequest();

$email = $_POST['email'] ?? null;
$password = $_POST['password'] ?? null;
$firstName = $_POST['first'] ?? null;
$lastName = $_POST['last'] ?? null;
$teamNumber = $_POST['team'] ?? null;

if (!$email || !$password) {
    if ($isApi) {
        errorResponse('Email and password are required', 400);
    }
    header('Location: ../?auth=failed');
    exit();
}

$db = getDb();

// Registration flow
if ($firstName && $lastName) {
    try {
        // Check if email exists
        $stmt = $db->prepare("SELECT id FROM users WHERE email = ?");
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            if ($isApi) {
                errorResponse('An account with this email already exists', 409);
            }
            header('Location: ../?auth=exists');
            exit();
        }

        // Create new user with team number (use TS-compatible password hashing)
        $passwordHash = hashPasswordTs($password);
        $stmt = $db->prepare("
            INSERT INTO users (email, password_hash, first_name, last_name, team_number)
            VALUES (?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $email,
            $passwordHash,
            $firstName,
            $lastName,
            $teamNumber
        ]);

        $userId = $db->lastInsertId();

        // Create auth token
        $token = generateToken();
        $expires = date('Y-m-d H:i:s', strtotime('+30 days'));

        $stmt = $db->prepare("
            INSERT INTO auth_tokens (user_id, token, expires_at)
            VALUES (?, ?, ?)
        ");
        $stmt->execute([$userId, $token, $expires]);

        if ($isApi) {
            setAuthCookie($token, 30 * 24 * 60 * 60);
            jsonResponse(['success' => true, 'message' => 'Account created']);
        }

        setAuthCookie($token, 30 * 24 * 60 * 60);
        header('Location: callback');
        exit();

    } catch (Exception $e) {
        error_log("Registration error: " . $e->getMessage());
        if ($isApi) {
            errorResponse('Registration failed: ' . $e->getMessage(), 500);
        }
        header('Location: ../?auth=failed');
        exit();
    }
}

// Login flow
try {
    $stmt = $db->prepare("
        SELECT id, email, password_hash, team_number, first_name, last_name
        FROM users 
        WHERE email = ?
    ");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user) {
        if ($isApi) {
            errorResponse('Invalid email or password', 401);
        }
        header('Location: ../?auth=failed');
        exit();
    }

    // Use compat verify that supports both TS SHA-256 and legacy bcrypt
    if (!verifyPasswordCompat($password, $user['password_hash'])) {
        if ($isApi) {
            errorResponse('Invalid email or password', 401);
        }
        header('Location: ../?auth=failed');
        exit();
    }

    // Generate new token
    $token = generateToken();
    $expires = date('Y-m-d H:i:s', strtotime('+30 days'));

    $stmt = $db->prepare("
        INSERT INTO auth_tokens (user_id, token, expires_at)
        VALUES (?, ?, ?)
    ");
    $stmt->execute([$user['id'], $token, $expires]);

    $db->prepare("
        UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?
    ")->execute([$user['id']]);

    if ($isApi) {
        setAuthCookie($token, 30 * 24 * 60 * 60);
        jsonResponse([
            'success' => true,
            'message' => 'Login successful',
            'team_number' => $user['team_number'],
            'name' => trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? ''))
        ]);
    }

    setAuthCookie($token, 30 * 24 * 60 * 60);
    header('Location: callback');
    exit();

} catch (Exception $e) {
    error_log("Login error: " . $e->getMessage());
    if ($isApi) {
        errorResponse('Login failed: ' . $e->getMessage(), 500);
    }
    header('Location: ../?auth=failed');
    exit();
}
?>
