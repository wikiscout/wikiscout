<?php
/**
 * WikiScout PHP API — Shared helpers
 * Provides database connection, authentication, FIRST API access, and utility
 * functions that mirror the TypeScript API behaviour so the two backends are
 * interchangeable with the same UI.
 */

require_once __DIR__ . '/config.php';

// ──────────────────────────────────────────────────────────────────────
// CORS & Headers
// ──────────────────────────────────────────────────────────────────────

function setCorsHeaders() {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowedOrigins = [
        'http://localhost:8080',
        'http://localhost:3000',
        'http://127.0.0.1:8080',
        'http://127.0.0.1:3000',
        'https://wikiscout.pages.dev',
        'https://app.wikiscout.org',
    ];

    $isAllowed = in_array($origin, $allowedOrigins)
        || str_ends_with($origin, '.workers.dev')
        || str_ends_with($origin, '.wikiscout.pages.dev')
        || str_ends_with($origin, '.pages.dev');

    if ($isAllowed || $origin) {
        header("Access-Control-Allow-Origin: $origin");
    }
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, Cookie, Cache-Control, Pragma');
    header('Access-Control-Allow-Credentials: true');

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function jsonResponse($data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Pragma: no-cache');
    header('Expires: 0');
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

function errorResponse(string $message, int $status = 500, ?string $details = null): never {
    $body = ['error' => $message];
    if ($details !== null) {
        $body['details'] = $details;
    }
    jsonResponse($body, $status);
}

// ──────────────────────────────────────────────────────────────────────
// Database
// ──────────────────────────────────────────────────────────────────────

function getDb(): PDO {
    global $mysql;
    static $db = null;
    if ($db !== null) return $db;

    $db = new PDO(
        "mysql:host={$mysql['host']};dbname={$mysql['database']};port={$mysql['port']}",
        $mysql['username'],
        $mysql['password'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,    // Use native prepared statements
            PDO::ATTR_STRINGIFY_FETCHES => false,    // Return native types (int, float) not strings
        ]
    );
    return $db;
}

/**
 * Run once per request (or lazily) to ensure all tables exist.
 */
function ensureSchema(): void {
    $db = getDb();

    // Users
    $db->exec("CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        team_number VARCHAR(50) DEFAULT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_team_number (team_number),
        INDEX idx_email (email)
    )");

    // Sub accounts
    $db->exec("CREATE TABLE IF NOT EXISTS sub_accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        parent_user_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        assigned_teams TEXT DEFAULT '[]',
        is_active TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_parent (parent_user_id),
        INDEX idx_active (is_active)
    )");

    // Auth tokens (supports both main and sub accounts)
    $db->exec("CREATE TABLE IF NOT EXISTS auth_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT DEFAULT NULL,
        sub_account_id INT DEFAULT NULL,
        token VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        is_revoked TINYINT DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (sub_account_id) REFERENCES sub_accounts(id) ON DELETE CASCADE,
        INDEX idx_token (token),
        INDEX idx_user_id (user_id),
        INDEX idx_sub_account_id (sub_account_id)
    )");

    // Migrate: add sub_account_id to auth_tokens if missing
    try {
        $cols = $db->query("SHOW COLUMNS FROM auth_tokens LIKE 'sub_account_id'")->fetchAll();
        if (empty($cols)) {
            $db->exec("ALTER TABLE auth_tokens ADD COLUMN sub_account_id INT DEFAULT NULL AFTER user_id");
            $db->exec("ALTER TABLE auth_tokens ADD INDEX idx_sub_account_id (sub_account_id)");
        }
    } catch (Exception $e) {
        // ignore if already exists
    }

    // Migrate: make user_id nullable in auth_tokens
    try {
        $col = $db->query("SHOW COLUMNS FROM auth_tokens WHERE Field='user_id'")->fetch();
        if ($col && $col['Null'] === 'NO') {
            $db->exec("ALTER TABLE auth_tokens MODIFY user_id INT DEFAULT NULL");
        }
    } catch (Exception $e) {}

    // One-time tokens (sub-account QR login)
    $db->exec("CREATE TABLE IF NOT EXISTS one_time_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sub_account_id INT NOT NULL,
        token VARCHAR(255) NOT NULL UNIQUE,
        otp_code VARCHAR(8),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        is_used TINYINT DEFAULT 0,
        FOREIGN KEY (sub_account_id) REFERENCES sub_accounts(id) ON DELETE CASCADE,
        INDEX idx_token (token),
        INDEX idx_otp (otp_code),
        INDEX idx_sub_account (sub_account_id),
        INDEX idx_expires (expires_at)
    )");

    // Scouting data
    $db->exec("CREATE TABLE IF NOT EXISTS scouting_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        team_number VARCHAR(50) NOT NULL,
        event_code VARCHAR(50) NOT NULL,
        season_year INT NOT NULL,
        scouting_team VARCHAR(50) NOT NULL,
        scouter_sub_account_id INT DEFAULT NULL,
        data TEXT NOT NULL,
        is_private TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_team_event (team_number, event_code),
        INDEX idx_season (season_year),
        INDEX idx_scouter (scouter_sub_account_id)
    )");

    // Team profiles (Trading Card)
    $db->exec("CREATE TABLE IF NOT EXISTS team_profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        team_number VARCHAR(50) NOT NULL UNIQUE,
        user_id INT NOT NULL,
        season_year INT NOT NULL,
        auto_points_low INT DEFAULT 0,
        auto_points_high INT DEFAULT 0,
        teleop_points_low INT DEFAULT 0,
        teleop_points_high INT DEFAULT 0,
        endgame_points INT DEFAULT 0,
        can_climb TINYINT DEFAULT 0,
        climb_level VARCHAR(50),
        can_shoot_near TINYINT DEFAULT 0,
        can_shoot_far TINYINT DEFAULT 0,
        can_intake_ground TINYINT DEFAULT 0,
        can_intake_source TINYINT DEFAULT 0,
        drivetrain_type VARCHAR(50),
        auto_description TEXT,
        robot_description TEXT,
        strategy_notes TEXT,
        custom_notes TEXT,
        original_image_path VARCHAR(500),
        rendered_image_path VARCHAR(500),
        final_image_path VARCHAR(500),
        profile_slug VARCHAR(100) UNIQUE,
        is_public TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_team (team_number),
        INDEX idx_slug (profile_slug),
        INDEX idx_season (season_year)
    )");

    // Match notes
    $db->exec("CREATE TABLE IF NOT EXISTS match_notes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT DEFAULT NULL,
        sub_account_id INT DEFAULT NULL,
        event_code VARCHAR(50) NOT NULL,
        match_number VARCHAR(50) NOT NULL,
        team_number VARCHAR(50) NOT NULL,
        notes TEXT DEFAULT '',
        is_private TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (sub_account_id) REFERENCES sub_accounts(id) ON DELETE SET NULL,
        INDEX idx_event (event_code),
        INDEX idx_match (match_number, event_code),
        INDEX idx_team (team_number, event_code),
        INDEX idx_user (user_id)
    )");

    // Custom scouting questions (per team, private)
    $db->exec("CREATE TABLE IF NOT EXISTS custom_questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        team_number VARCHAR(50) NOT NULL,
        label VARCHAR(255) NOT NULL,
        field_type VARCHAR(50) NOT NULL,
        config TEXT DEFAULT '{}',
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_team (team_number)
    )");

    // Custom question responses (private to scouting team)
    $db->exec("CREATE TABLE IF NOT EXISTS custom_question_responses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        question_id INT NOT NULL,
        scouted_team VARCHAR(50) NOT NULL,
        event_code VARCHAR(50) NOT NULL,
        season_year INT NOT NULL,
        scouting_team VARCHAR(50) NOT NULL,
        scouter_user_id INT DEFAULT NULL,
        value TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (question_id) REFERENCES custom_questions(id) ON DELETE CASCADE,
        FOREIGN KEY (scouter_user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_question (question_id),
        INDEX idx_scouted (scouted_team, event_code),
        INDEX idx_scouting (scouting_team)
    )");

    // Photo upload sessions
    $db->exec("CREATE TABLE IF NOT EXISTS photo_upload_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        team_number VARCHAR(50) NOT NULL,
        user_id INT NOT NULL,
        session_token VARCHAR(255) NOT NULL UNIQUE,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_token (session_token),
        INDEX idx_team (team_number)
    )");
}

// ──────────────────────────────────────────────────────────────────────
// Authentication helpers
// ──────────────────────────────────────────────────────────────────────

function getAuthCookie(): ?string {
    return $_COOKIE['auth'] ?? null;
}

/**
 * Validate the auth token and return user info.
 * Supports both main accounts and sub-accounts.
 * Returns null if invalid.
 */
function validateToken(?string $token = null): ?array {
    $token = $token ?? getAuthCookie();
    if (!$token) return null;

    $db = getDb();

    // Try main account
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
        return [
            'id' => (int)$main['id'],
            'team_number' => $main['team_number'],
            'first_name' => $main['first_name'],
            'last_name' => $main['last_name'],
            'is_sub_account' => false,
        ];
    }

    // Try sub account
    $stmt = $db->prepare("
        SELECT sa.id, sa.parent_user_id, sa.name, sa.assigned_teams, u.team_number
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
        $assignedTeams = json_decode($sub['assigned_teams'] ?: '[]', true) ?: [];
        return [
            'id' => (int)$sub['id'],
            'team_number' => $sub['team_number'],
            'is_sub_account' => true,
            'parent_user_id' => (int)$sub['parent_user_id'],
            'name' => $sub['name'],
            'assigned_teams' => $assignedTeams,
        ];
    }

    return null;
}

/**
 * Require authentication. Returns user array or sends 401.
 */
function requireAuth(): array {
    $user = validateToken();
    if (!$user) {
        errorResponse('Invalid or expired token', 401);
    }
    return $user;
}

/**
 * Require authentication + team number.
 */
function requireTeam(): array {
    $user = requireAuth();
    if (empty($user['team_number'])) {
        errorResponse('No team number assigned', 501);
    }
    return $user;
}

/**
 * Require a main account (not sub-account) with team number.
 */
function requireMainAccount(): array {
    $user = requireTeam();
    if ($user['is_sub_account']) {
        errorResponse('This action requires a main account', 403);
    }
    return $user;
}

/**
 * Get the user's display name.
 */
function getUserName(array $user): string {
    if ($user['is_sub_account']) {
        return $user['name'] ?? 'Team Member';
    }
    $name = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? ''));
    return $name ?: 'Team Member';
}

// ──────────────────────────────────────────────────────────────────────
// Token & OTP generation
// ──────────────────────────────────────────────────────────────────────

function generateToken(): string {
    return bin2hex(random_bytes(32));
}

function generateOtp(): string {
    return sprintf('%06d', random_int(0, 999999));
}

function generateOneTimeToken(): string {
    return bin2hex(random_bytes(48));
}

// ──────────────────────────────────────────────────────────────────────
// Season / Date helpers
// ──────────────────────────────────────────────────────────────────────

function getSeasonYear(): int {
    $month = (int)date('n');
    $year = (int)date('Y');
    return $month >= 9 ? $year : $year - 1;
}

// ──────────────────────────────────────────────────────────────────────
// FIRST API helpers
// ──────────────────────────────────────────────────────────────────────

class FirstApiError extends Exception {
    public int $statusCode;
    public function __construct(string $message, int $statusCode) {
        parent::__construct($message, 0);
        $this->statusCode = $statusCode;
    }
}

function fetchFirstApi(string $endpoint, ?int $seasonYear = null): array {
    global $username, $password;
    $seasonYear = $seasonYear ?? getSeasonYear();
    $auth = base64_encode("$username:$password");
    $url = "https://ftc-api.firstinspires.org/v2.0/$seasonYear/$endpoint";

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            "Authorization: Basic $auth",
        ],
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        throw new FirstApiError("FIRST API error: $httpCode", $httpCode);
    }

    return json_decode($response, true);
}

// ──────────────────────────────────────────────────────────────────────
// Config helpers
// ──────────────────────────────────────────────────────────────────────

function getPublicUrl(): string {
    global $publicUrl;
    return $publicUrl ?? ('https://' . ($_SERVER['SERVER_NAME'] ?? 'localhost'));
}

function getApiBaseUrl(): string {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return "$scheme://$host";
}

function isApiRequest(): bool {
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin) return true;
    if (str_contains($accept, 'application/json')) return true;
    return false;
}

function getDataMode(): string {
    global $dataMode;
    return strtolower($dataMode ?? 'first_api');
}

function isDemoMode(): bool {
    return getDataMode() === 'demo';
}

// DEVDATA events (demo data that works alongside real data)
define('DEVDATA_EVENTS', ['DEVDATA0', 'DEVDATA1']);

function isDevDataEvent(?string $eventCode): bool {
    return $eventCode !== null && in_array(strtoupper($eventCode), DEVDATA_EVENTS);
}

function isDevDataReadOnly(?string $eventCode): bool {
    return $eventCode !== null && strtoupper($eventCode) === 'DEVDATA0';
}

/**
 * @deprecated Use isDevDataEvent() instead
 */
function isDevTestEvent(?string $eventCode): bool {
    return isDevDataEvent($eventCode);
}

// ──────────────────────────────────────────────────────────────────────
// Event helpers (match TS event-utils.ts)
// ──────────────────────────────────────────────────────────────────────

/**
 * Check whether an event has ended by looking up its dates from the FIRST API.
 */
function isEventEnded(string $eventCode): bool {
    if (in_array(strtoupper($eventCode), DEVDATA_EVENTS)) return false;

    try {
        $seasonYear = getSeasonYear();
        $data = fetchFirstApi('events/', $seasonYear);
        $events = $data['events'] ?? [];
        $event = null;
        foreach ($events as $e) {
            if (strtolower($e['code'] ?? '') === strtolower($eventCode)) {
                $event = $e;
                break;
            }
        }
        if (!$event || empty($event['dateEnd'])) return false;

        $endTime = strtotime($event['dateEnd']) + 86400; // + 24 hours buffer
        return time() > $endTime;
    } catch (Exception $e) {
        return false;
    }
}

/**
 * Get related event codes for data sharing across divisions.
 * E.g. USMNCMPGLXY is a division of USMNCMP, so data should be shared.
 */
function getRelatedEventCodes(string $eventCode, string $teamNumber): array {
    if (in_array(strtoupper($eventCode), DEVDATA_EVENTS)) return [$eventCode];

    try {
        $seasonYear = getSeasonYear();
        $data = fetchFirstApi("events?teamNumber=$teamNumber", $seasonYear);
        $teamEvents = array_map(fn($e) => $e['code'], $data['events'] ?? []);

        if (count($teamEvents) <= 1) return [$eventCode];

        // Find the shortest code that is a prefix of eventCode (the "parent")
        $parentCode = $eventCode;
        foreach ($teamEvents as $code) {
            if ($code !== $eventCode && str_starts_with($eventCode, $code) && strlen($code) < strlen($parentCode)) {
                $parentCode = $code;
            }
        }

        // Now find all events that start with the parent code
        $related = [];
        foreach ($teamEvents as $code) {
            if (str_starts_with($code, $parentCode)) {
                $related[$code] = true;
            }
        }

        // Only return related if there are actually multiple codes sharing this prefix
        if (count($related) > 1) {
            return array_keys($related);
        }
        return [$eventCode];
    } catch (Exception $e) {
        error_log('Failed to get related events: ' . $e->getMessage());
        return [$eventCode];
    }
}

// ──────────────────────────────────────────────────────────────────────
// Password hashing (matches TS auth.ts SHA-256 scheme)
// ──────────────────────────────────────────────────────────────────────

/**
 * Hash a password using the same SHA-256 scheme as the TS API.
 * Format: saltHex:finalHashHex
 */
function hashPasswordTs(string $password): string {
    // Step 1: SHA-256 hash the password
    $hashBytes = hash('sha256', $password, true);
    $hashHex = bin2hex($hashBytes);

    // Step 2: Generate 16-byte random salt
    $salt = random_bytes(16);
    $saltHex = bin2hex($salt);

    // Step 3: Hash again with salt prepended
    $saltedInput = $saltHex . $hashHex;
    $finalHash = hash('sha256', $saltedInput);

    return $saltHex . ':' . $finalHash;
}

/**
 * Verify a password against a stored hash (TS SHA-256 scheme).
 */
function verifyPasswordTs(string $password, string $storedHash): bool {
    $parts = explode(':', $storedHash, 2);
    if (count($parts) !== 2) return false;
    [$salt, $hash] = $parts;

    // Step 1: SHA-256 hash the password
    $hashBytes = hash('sha256', $password, true);
    $hashHex = bin2hex($hashBytes);

    // Step 2: Hash again with salt prepended
    $saltedInput = $salt . $hashHex;
    $computedHash = hash('sha256', $saltedInput);

    return hash_equals($computedHash, $hash);
}

/**
 * Verify a password — tries TS SHA-256 scheme first, then bcrypt fallback.
 */
function verifyPasswordCompat(string $password, string $storedHash): bool {
    // Try TS-compatible scheme first (salt:hash format)
    if (str_contains($storedHash, ':')) {
        return verifyPasswordTs($password, $storedHash);
    }
    // Fallback to bcrypt (password_verify) for legacy PHP hashes
    return password_verify($password, $storedHash);
}

// ──────────────────────────────────────────────────────────────────────
// Cookie helpers (match TS setCookie behaviour)
// ──────────────────────────────────────────────────────────────────────

function setAuthCookie(string $token, int $maxAge = 2592000): void {
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    $sameSite = $secure ? 'None' : 'Lax';
    setcookie('auth', $token, [
        'expires' => time() + $maxAge,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => $sameSite,
    ]);
    // Also set header for immediate availability
    $flags = $secure ? "Secure; HttpOnly; SameSite=None" : "HttpOnly; SameSite=Lax";
    header("Set-Cookie: auth=$token; Max-Age=$maxAge; Path=/; $flags", false);
}

function clearAuthCookie(): void {
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    $sameSite = $secure ? 'None' : 'Lax';
    setcookie('auth', '', [
        'expires' => time() - 3600,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => $sameSite,
    ]);
    $flags = $secure ? "Secure; HttpOnly; SameSite=None" : "HttpOnly; SameSite=Lax";
    header("Set-Cookie: auth=; Max-Age=0; Path=/; $flags", false);
}

// ──────────────────────────────────────────────────────────────────────
// Form config helpers (match TS DEFAULT_FORM_CONFIG)
// ──────────────────────────────────────────────────────────────────────

function getDefaultFormConfig(): array {
    return [
        ['type' => 'header', 'label' => 'Tele-OP'],
        ['type' => 'checkbox', 'label' => 'Mecanum Drive Train'],
        ['type' => 'slider', 'label' => 'Driver Practice', 'min' => 0, 'max' => 3, 'step' => 1],
        ['type' => 'number', 'label' => 'Tele-OP Balls'],
        ['type' => 'options', 'label' => 'Shooting Distance', 'options' => ['Near', 'Far', 'Both']],
        ['type' => 'separator'],
        ['type' => 'header', 'label' => 'Autonomous'],
        ['type' => 'number', 'label' => 'Auto Balls'],
        ['type' => 'options', 'label' => 'Auto Shooting', 'options' => ['Near', 'Far', 'Both']],
        ['type' => 'number', 'label' => 'Auto Points'],
        ['type' => 'checkbox', 'label' => 'Leave'],
        ['type' => 'text', 'label' => 'What autos do they have (Near, far, how many balls)', 'big' => true, 'description' => 'Describe their autonomous routines in detail'],
        ['type' => 'separator', 'visible' => false],
        ['type' => 'text', 'label' => 'Private Notes', 'big' => true, 'private' => true, 'description' => 'Your private notes that only your team can see'],
    ];
}

function getFormFields(?array $formConfig = null): array {
    $formConfig = $formConfig ?? getDefaultFormConfig();
    $fields = [];
    foreach ($formConfig as $field) {
        if (($field['type'] ?? '') === 'separator' || ($field['type'] ?? '') === 'header') continue;
        $fields[] = $field['label'] ?? '';
    }
    return $fields;
}

function getPrivateFieldIndexes(?array $formConfig = null): array {
    $formConfig = $formConfig ?? getDefaultFormConfig();
    $indexes = [];
    $fieldIndex = 0;
    foreach ($formConfig as $field) {
        if (($field['type'] ?? '') === 'separator' || ($field['type'] ?? '') === 'header') continue;
        if (!empty($field['private'])) {
            $indexes[] = $fieldIndex;
        }
        $fieldIndex++;
    }
    return $indexes;
}

// ──────────────────────────────────────────────────────────────────────
// Profile slug helper
// ──────────────────────────────────────────────────────────────────────

function generateProfileSlug(string $teamNumber): string {
    $randomPart = substr(base_convert(bin2hex(random_bytes(4)), 16, 36), 0, 6);
    return "team-$teamNumber-$randomPart";
}

// ──────────────────────────────────────────────────────────────────────
// Image storage helpers (local filesystem alternative to R2)
// ──────────────────────────────────────────────────────────────────────

function getStoragePath(): string {
    global $storagePath;
    $path = $storagePath ?? __DIR__ . '/storage';
    if (!is_dir($path)) {
        mkdir($path, 0755, true);
    }
    return $path;
}

function storeFile(string $relativePath, string $content, string $contentType = 'image/jpeg'): bool {
    $fullPath = getStoragePath() . '/' . $relativePath;
    $dir = dirname($fullPath);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    return file_put_contents($fullPath, $content) !== false;
}

function getStoredFile(string $relativePath): ?string {
    $fullPath = getStoragePath() . '/' . $relativePath;
    if (!file_exists($fullPath)) return null;
    return file_get_contents($fullPath);
}

// ──────────────────────────────────────────────────────────────────────
// Demo data (matches TS demo-data.ts)
// ──────────────────────────────────────────────────────────────────────

define('DEMO_EVENT_CODE', 'USMNSAQ1');
define('DEMO_EVENT_NAME', 'MN FTC Prior Lake Sat. Nov. 23');

function getDemoTeamsList(): array {
    return [
        ['teamNumber' => 5962, 'nameShort' => 'Nordic Storm', 'nameFull' => 'St. Peter Area Robotics Association & Family/Community'],
        ['teamNumber' => 6699, 'nameShort' => 'Tempest', 'nameFull' => 'Boston Scientific & Nova Classical Academy'],
        ['teamNumber' => 7896, 'nameShort' => 'Royal Screw-Ups', 'nameFull' => 'PRIOR LAKE HIGH SCHOOL'],
        ['teamNumber' => 7897, 'nameShort' => 'The Lost Robots', 'nameFull' => 'Prior Lake High School'],
        ['teamNumber' => 7898, 'nameShort' => 'Jormungandr', 'nameFull' => 'Prior Lake High School'],
        ['teamNumber' => 8101, 'nameShort' => 'Metalmorphosis', 'nameFull' => 'Chanhassen High School'],
        ['teamNumber' => 8962, 'nameShort' => 'TimeCrafters', 'nameFull' => 'Boston Scientific Corporation/Chisago County 4H&4-H'],
        ['teamNumber' => 9415, 'nameShort' => 'Wrench Dressing', 'nameFull' => 'Chanhassen High School'],
        ['teamNumber' => 11175, 'nameShort' => 'Providence Academy Lions', 'nameFull' => 'Providence Academy'],
        ['teamNumber' => 12591, 'nameShort' => 'Mechalodons', 'nameFull' => 'Lake Middle School'],
        ['teamNumber' => 13076, 'nameShort' => 'The Argonauts', 'nameFull' => 'Nova Classical Academy'],
        ['teamNumber' => 13247, 'nameShort' => 'Ouroboros', 'nameFull' => 'Math & Science Academy'],
        ['teamNumber' => 14091, 'nameShort' => 'Roseville Raiders Robotics', 'nameFull' => 'Roseville Area Schools Foundation/H.B. Fuller/Bell Bank&Roseville Area Middle School'],
        ['teamNumber' => 15295, 'nameShort' => 'WARP1', 'nameFull' => 'Willmar Middle School & Willmar Senior High School'],
        ['teamNumber' => 17017, 'nameShort' => 'Technically Falcons', 'nameFull' => 'Bloomington Public Schools & Valley View Middle School'],
        ['teamNumber' => 20032, 'nameShort' => 'Cyber Machina', 'nameFull' => 'Ideal Credit Union/City & County Credit Union/3M/Big Frog/Gene Haas Foundation&Math & Science Academy'],
        ['teamNumber' => 21475, 'nameShort' => 'Constellations', 'nameFull' => 'Falk Auto Body&Red Wing High School&Family/Community'],
        ['teamNumber' => 22181, 'nameShort' => 'WARP2', 'nameFull' => 'Willmar Middle School'],
        ['teamNumber' => 22292, 'nameShort' => 'RoboMania', 'nameFull' => 'Chanhassen High School'],
        ['teamNumber' => 22349, 'nameShort' => 'Nuclear Knights', 'nameFull' => 'Central Middle School'],
        ['teamNumber' => 22350, 'nameShort' => 'Robotic World', 'nameFull' => 'Central Middle School'],
        ['teamNumber' => 22351, 'nameShort' => 'Taped Together', 'nameFull' => 'Central Middle School'],
        ['teamNumber' => 23245, 'nameShort' => "Bots 'O' Gold", 'nameFull' => 'Collins Aersospace&Rosemount High School'],
        ['teamNumber' => 24367, 'nameShort' => 'Chaos Potatoes', 'nameFull' => 'Lakeville South High School'],
        ['teamNumber' => 26383, 'nameShort' => 'Mighty Morphing Banana Slugs', 'nameFull' => 'Family/Community'],
        ['teamNumber' => 27328, 'nameShort' => 'Cyber Lynx', 'nameFull' => 'Lakeville South High'],
        ['teamNumber' => 27634, 'nameShort' => 'WARP3', 'nameFull' => 'Willmar Middle School'],
    ];
}

function seededRandom(int &$seed): float {
    $seed = ($seed * 1103515245 + 12345) & 0x7fffffff;
    return $seed / 0x7fffffff;
}

function getDemoEventDates(): array {
    $start = date('Y-m-d') . 'T00:00:00.000Z';
    $end = date('Y-m-d') . 'T23:59:59.999Z';
    return ['start' => $start, 'end' => $end];
}

function generateDemoMatches(): array {
    $teams = getDemoTeamsList();
    $teamNumbers = array_column($teams, 'teamNumber');
    $seed = 42;
    $matches = [];

    for ($i = 1; $i <= 36; $i++) {
        // Shuffle using seeded random
        $shuffled = $teamNumbers;
        for ($j = count($shuffled) - 1; $j > 0; $j--) {
            $k = (int)(seededRandom($seed) * ($j + 1));
            [$shuffled[$j], $shuffled[$k]] = [$shuffled[$k], $shuffled[$j]];
        }

        $match = [
            'description' => "Qualifier $i",
            'tournamentLevel' => 'qual',
            'matchNumber' => $i,
            'teams' => [
                ['teamNumber' => $shuffled[0], 'station' => 'Red1'],
                ['teamNumber' => $shuffled[1], 'station' => 'Red2'],
                ['teamNumber' => $shuffled[2], 'station' => 'Blue1'],
                ['teamNumber' => $shuffled[3], 'station' => 'Blue2'],
            ],
        ];

        if ($i <= 30) {
            $redAuto = (int)(seededRandom($seed) * 40) + 10;
            $blueAuto = (int)(seededRandom($seed) * 40) + 10;
            $redTeleop = (int)(seededRandom($seed) * 80) + 30;
            $blueTeleop = (int)(seededRandom($seed) * 80) + 30;
            $redEndgame = (int)(seededRandom($seed) * 30);
            $blueEndgame = (int)(seededRandom($seed) * 30);
            $redFoul = (int)(seededRandom($seed) * 10);
            $blueFoul = (int)(seededRandom($seed) * 10);

            $match['scoreRedFinal'] = $redAuto + $redTeleop + $redEndgame + $redFoul;
            $match['scoreRedAuto'] = $redAuto;
            $match['scoreRedFoul'] = $redFoul;
            $match['scoreBlueFinal'] = $blueAuto + $blueTeleop + $blueEndgame + $blueFoul;
            $match['scoreBlueAuto'] = $blueAuto;
            $match['scoreBlueFoul'] = $blueFoul;
        } else {
            $match['scoreRedFinal'] = null;
            $match['scoreRedAuto'] = null;
            $match['scoreRedFoul'] = null;
            $match['scoreBlueFinal'] = null;
            $match['scoreBlueAuto'] = null;
            $match['scoreBlueFoul'] = null;
        }

        $matches[] = $match;
    }
    return $matches;
}

function generateDemoRankings(array $matches): array {
    $teams = getDemoTeamsList();
    $teamNumbers = array_column($teams, 'teamNumber');
    $stats = [];
    foreach ($teamNumbers as $tn) {
        $stats[$tn] = ['wins' => 0, 'losses' => 0, 'ties' => 0, 'matchesPlayed' => 0, 'totalScore' => 0];
    }

    foreach ($matches as $match) {
        if ($match['scoreRedFinal'] === null || $match['scoreBlueFinal'] === null) continue;

        $redTeams = array_filter($match['teams'], fn($t) => str_starts_with($t['station'], 'Red'));
        $blueTeams = array_filter($match['teams'], fn($t) => str_starts_with($t['station'], 'Blue'));

        $redWon = $match['scoreRedFinal'] > $match['scoreBlueFinal'];
        $blueWon = $match['scoreBlueFinal'] > $match['scoreRedFinal'];
        $tied = $match['scoreRedFinal'] === $match['scoreBlueFinal'];

        foreach ($redTeams as $t) {
            $s = &$stats[$t['teamNumber']];
            $s['matchesPlayed']++;
            $s['totalScore'] += $match['scoreRedFinal'];
            if ($redWon) $s['wins']++;
            elseif ($blueWon) $s['losses']++;
            elseif ($tied) $s['ties']++;
        }
        foreach ($blueTeams as $t) {
            $s = &$stats[$t['teamNumber']];
            $s['matchesPlayed']++;
            $s['totalScore'] += $match['scoreBlueFinal'];
            if ($blueWon) $s['wins']++;
            elseif ($redWon) $s['losses']++;
            elseif ($tied) $s['ties']++;
        }
    }

    // Sort by wins desc, then total score desc
    $sorted = [];
    foreach ($stats as $tn => $s) {
        $sorted[] = array_merge(['teamNumber' => $tn], $s);
    }
    usort($sorted, function ($a, $b) {
        if ($b['wins'] !== $a['wins']) return $b['wins'] - $a['wins'];
        return $b['totalScore'] - $a['totalScore'];
    });

    $teamsLookup = [];
    foreach ($teams as $t) $teamsLookup[$t['teamNumber']] = $t;

    return array_map(function ($team, $idx) use ($teamsLookup) {
        return [
            'rank' => $idx + 1,
            'teamNumber' => $team['teamNumber'],
            'teamName' => $teamsLookup[$team['teamNumber']]['nameShort'] ?? "Team {$team['teamNumber']}",
            'wins' => $team['wins'],
            'losses' => $team['losses'],
            'ties' => $team['ties'],
            'matchesPlayed' => $team['matchesPlayed'],
        ];
    }, $sorted, array_keys($sorted));
}

function generateDemoSchedule(array $matches): array {
    $now = time();
    return array_map(function ($match, $idx) use ($now) {
        $hour = 9 + intdiv($idx, 4);
        $minute = ($idx % 4) * 15;
        $time = mktime($hour, $minute, 0, (int)date('n', $now), (int)date('j', $now), (int)date('Y', $now));
        return [
            'description' => $match['description'],
            'matchNumber' => $match['matchNumber'],
            'startTime' => gmdate('Y-m-d\TH:i:s.000\Z', $time),
            'teams' => $match['teams'],
        ];
    }, $matches, array_keys($matches));
}

function getDemoEvents(): array {
    $dates = getDemoEventDates();
    return [
        'events' => [[
            'code' => DEMO_EVENT_CODE,
            'name' => DEMO_EVENT_NAME,
            'type' => '2',
            'typeName' => 'Qualifier',
            'dateStart' => $dates['start'],
            'dateEnd' => $dates['end'],
        ]]
    ];
}

function getDemoTeams(): array {
    return ['teams' => getDemoTeamsList()];
}

function getDemoRankings(): array {
    return ['rankings' => generateDemoRankings(generateDemoMatches())];
}

function getDemoMatches(): array {
    return ['matches' => generateDemoMatches()];
}

function getDemoSchedule(): array {
    return ['schedule' => generateDemoSchedule(generateDemoMatches())];
}

function getDemoScoutingData(string $teamNumber): array {
    $teams = getDemoTeamsList();
    $team = null;
    foreach ($teams as $t) {
        if ((string)$t['teamNumber'] === $teamNumber) { $team = $t; break; }
    }
    if (!$team) {
        return ['fields' => [], 'private_data' => ['data' => [], 'scouting_team' => null], 'public_data' => []];
    }

    $formFields = ['TEAM NUMBER', 'AUTONOMOUS', 'Auto Balls', 'Leave', 'TELEOP', 'Tele Balls', 'Distance', 'NOTES'];

    $rankings = generateDemoRankings(generateDemoMatches());
    $rankIdx = 0;
    foreach ($rankings as $idx => $r) {
        if ($r['teamNumber'] === $team['teamNumber']) { $rankIdx = $idx; break; }
    }
    $isTopTeam = $rankIdx < 8;

    $privateData = [
        (string)$team['teamNumber'],
        'AUTONOMOUS',
        $isTopTeam ? (string)(rand(3, 4)) : (string)(rand(1, 3)),
        rand(0, 9) > 3 ? 'Yes' : 'No',
        'TELEOP',
        $isTopTeam ? (string)(rand(7, 10)) : (string)(rand(3, 7)),
        $isTopTeam ? 'Far' : (rand(0, 1) ? 'Mid' : 'Near'),
        $isTopTeam ? 'Strong auto, fast cycles. Reliable scorer from all distances. Excellent driver control.'
                   : 'Decent scorer, struggles with consistency. Needs work on autonomous.',
    ];

    $publicData = [];
    $numEntries = rand(2, 4);
    for ($i = 0; $i < $numEntries; $i++) {
        $scoutingTeam = (string)$teams[array_rand($teams)]['teamNumber'];
        $topNotes = ['Solid performer', 'Good defense', 'Quick cycles'];
        $otherNotes = ['Average performance', 'Inconsistent', 'Needs improvement'];
        $publicData[] = [
            'data' => [
                (string)$team['teamNumber'], 'AUTONOMOUS',
                (string)rand(2, 4), rand(0, 9) > 4 ? 'Yes' : 'No',
                'TELEOP', (string)rand(4, 8), rand(0, 1) ? 'Far' : 'Mid',
                $isTopTeam ? $topNotes[array_rand($topNotes)] : $otherNotes[array_rand($otherNotes)],
            ],
            'scouting_team' => $scoutingTeam,
        ];
    }

    return [
        'fields' => $formFields,
        'private_data' => ['data' => $privateData, 'scouting_team' => '16072'],
        'public_data' => $publicData,
    ];
}

// ──────────────────────────────────────────────────────────────────────
// Bootstrap — call at top of each endpoint
// ──────────────────────────────────────────────────────────────────────

function bootstrap(): void {
    setCorsHeaders();
    ensureSchema();
}
