<?php

declare(strict_types=1);

$database = require_once __DIR__ . '/db.php';

session_name('sam_hub_session');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => IS_PRODUCTION,
    'httponly' => true,
    'samesite' => 'Strict',
]);
ini_set('session.gc_maxlifetime', (string) (30 * 24 * 60 * 60));
session_start();

function jsonResponse(int $code, array $payload): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

function readJsonBody(): array {
    $rawInput = file_get_contents('php://input');
    if ($rawInput === false || trim($rawInput) === '') {
        return [];
    }

    $decoded = json_decode($rawInput, true);
    return is_array($decoded) ? $decoded : [];
}

function validEmail(string $email): bool {
    return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

function validPassword(string $password): bool {
    return strlen($password) >= 8 && strlen($password) <= 128;
}

function hashToken(string $token): string {
    return hash('sha256', $token);
}

function publicUser(array $user): array {
    return [
        'id' => $user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
        'role' => $user['role'],
        'status' => $user['status'],
        'emailVerified' => !empty($user['email_verified_at']),
        'createdAt' => $user['created_at'],
    ];
}

function publicRecord(array $record): array {
    return [
        'id' => $record['id'],
        'service' => $record['service'],
        'amount' => (float) $record['amount'],
        'type' => $record['type'],
        'userId' => $record['user_id'],
        'user' => $record['user'] ?? '',
        'createdAt' => $record['created_at'],
        'reaction' => $record['reaction'] ?? null,
        'reactedAt' => $record['reacted_at'] ?? null,
    ];
}

function findUser(mysqli $database, string $id): ?array {
    $statement = $database->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    $statement->bind_param('s', $id);
    $statement->execute();
    $result = $statement->get_result();
    $user = $result->fetch_assoc();
    return $user ?: null;
}

function currentUser(mysqli $database): ?array {
    if (empty($_SESSION['user_id'])) {
        return null;
    }

    return findUser($database, (string) $_SESSION['user_id']);
}

function deviceNameFor(string $userAgent): string {
    $browser = str_contains($userAgent, 'Edg/') ? 'Edge'
        : (str_contains($userAgent, 'Firefox/') ? 'Firefox'
            : (str_contains($userAgent, 'OPR/') ? 'Opera'
                : (str_contains($userAgent, 'Chrome/') ? 'Chrome'
                    : (str_contains($userAgent, 'Safari/') ? 'Safari' : 'Browser'))));
    $device = preg_match('/iPad|Tablet/i', $userAgent) ? 'Tablet'
        : (preg_match('/Mobile|Android|iPhone/i', $userAgent) ? 'Mobile' : 'Computer');
    return $browser . ' on ' . $device;
}

function saveUserSession(mysqli $database, string $sessionId, string $userId, string $userAgent): void {
    $now = gmdate('Y-m-d H:i:s');
    $deviceName = deviceNameFor($userAgent);
    $statement = $database->prepare(
        'INSERT INTO user_sessions (sid, user_id, device_name, user_agent, created_at, last_seen)
        VALUES (?, ?, ?, ?, ?, ?)'
    );
    $statement->bind_param('ssssss', $sessionId, $userId, $deviceName, $userAgent, $now, $now);
    $statement->execute();
}

function trackCurrentSession(mysqli $database): void {
    if (empty($_SESSION['user_id'])) {
        return;
    }

    $sessionId = session_id();
    $lookup = $database->prepare('SELECT revoked_at FROM user_sessions WHERE sid = ? LIMIT 1');
    $lookup->bind_param('s', $sessionId);
    $lookup->execute();
    $tracked = $lookup->get_result()->fetch_assoc();
    if ($tracked && $tracked['revoked_at'] !== null) {
        session_destroy();
        $_SESSION = [];
        return;
    }

    $now = gmdate('Y-m-d H:i:s');
    if (!$tracked) {
        $userAgent = substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 500);
        saveUserSession($database, $sessionId, (string) $_SESSION['user_id'], $userAgent);
        return;
    }

    $update = $database->prepare('UPDATE user_sessions SET last_seen = ? WHERE sid = ?');
    $update->bind_param('ss', $now, $sessionId);
    $update->execute();
}

function enforceRateLimit(mysqli $database, string $route, int $limit = 20, int $windowSeconds = 900): void {
    $ipAddress = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $rateKey = hash_hmac('sha256', $ipAddress, DB_PASS);
    $now = time();
    $update = $database->prepare(
        'INSERT INTO request_rate_limits (rate_key, route, window_started, attempts)
        VALUES (?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE
          attempts = IF(window_started <= ?, 1, attempts + 1),
          window_started = IF(window_started <= ?, VALUES(window_started), window_started)'
    );
    $windowBoundary = $now - $windowSeconds;
    $update->bind_param('ssiii', $rateKey, $route, $now, $windowBoundary, $windowBoundary);
    $update->execute();

    $lookup = $database->prepare('SELECT attempts FROM request_rate_limits WHERE rate_key = ? AND route = ? LIMIT 1');
    $lookup->bind_param('ss', $rateKey, $route);
    $lookup->execute();
    $row = $lookup->get_result()->fetch_assoc();
    if ((int) ($row['attempts'] ?? 0) > $limit) {
        jsonResponse(429, ['message' => 'Too many attempts. Please wait 15 minutes and try again.']);
    }
}

function requireAuth(mysqli $database): ?array {
    $user = currentUser($database);
    if (!$user) {
        session_destroy();
        return null;
    }

    if (!empty($user['email_verified_at']) && $user['status'] !== 'disabled' && !($user['role'] === 'worker' && $user['status'] !== 'approved')) {
        return $user;
    }

    session_destroy();
    return null;
}

function requireAdmin(array $user): bool {
    return isset($user['role']) && $user['role'] === 'admin';
}

function createAuthToken(mysqli $database, string $userId, string $purpose, int $expiresInMs, ?string $suppliedToken = null): string {
    $token = $suppliedToken ?? rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    $tokenHash = hashToken($token);
    $expiresAt = (string) ((int) (microtime(true) * 1000) + $expiresInMs);

    $delete = $database->prepare('DELETE FROM auth_tokens WHERE user_id = ? AND purpose = ?');
    $delete->bind_param('ss', $userId, $purpose);
    $delete->execute();

    $insert = $database->prepare('INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, NOW())');
    $insert->bind_param('ssss', $tokenHash, $userId, $purpose, $expiresAt);
    $insert->execute();

    return $token;
}

function smtpWrite($socket, string $data): void {
    while ($data !== '') {
        $written = fwrite($socket, $data);
        if ($written === false || $written === 0) {
            throw new RuntimeException('Could not write to the SMTP server.');
        }
        $data = substr($data, $written);
    }
}

function smtpReadResponse($socket, array $expectedCodes): string {
    $response = '';
    do {
        $line = fgets($socket, 515);
        if ($line === false) {
            $metadata = stream_get_meta_data($socket);
            throw new RuntimeException(!empty($metadata['timed_out'])
                ? 'The SMTP server timed out.'
                : 'The SMTP server closed the connection unexpectedly.');
        }
        $response .= $line;
    } while (!preg_match('/^\d{3} /', $line));

    $code = (int) substr($line, 0, 3);
    if (!in_array($code, $expectedCodes, true)) {
        throw new RuntimeException('The SMTP server rejected a mail operation: ' . trim($response));
    }
    return $response;
}

function smtpCommand($socket, string $command, array $expectedCodes): string {
    smtpWrite($socket, $command . "\r\n");
    return smtpReadResponse($socket, $expectedCodes);
}

function smtpAddress(string $address): string {
    if (preg_match('/[\r\n<>]/', $address) || !filter_var($address, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('The configured SMTP sender or recipient address is invalid.');
    }
    return $address;
}

function sendSmtpEmail(string $to, string $subject, string $textBody, string $htmlBody): void {
    if (!preg_match('/^[a-z0-9.-]+$/i', SMTP_HOST) || SMTP_PORT < 1 || SMTP_PORT > 65535
        || !in_array(SMTP_ENCRYPTION, ['tls', 'ssl'], true)
        || SMTP_USER === '' || SMTP_PASS === '' || SMTP_TIMEOUT < 1
        || preg_match('/[\r\n]/', SMTP_FROM_NAME) || preg_match('/[\r\n]/', $subject)) {
        throw new RuntimeException('SMTP settings are incomplete or invalid.');
    }

    $from = smtpAddress(APP_EMAIL_FROM);
    $recipient = smtpAddress($to);
    $transport = SMTP_ENCRYPTION === 'ssl' ? 'ssl://' : 'tcp://';
    $context = stream_context_create([
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
            'peer_name' => SMTP_HOST,
        ],
    ]);
    $socket = @stream_socket_client(
        $transport . SMTP_HOST . ':' . SMTP_PORT,
        $errorCode,
        $errorMessage,
        SMTP_TIMEOUT,
        STREAM_CLIENT_CONNECT,
        $context
    );
    if ($socket === false) {
        throw new RuntimeException('Could not connect to the SMTP server: ' . $errorMessage, $errorCode);
    }

    try {
        stream_set_timeout($socket, SMTP_TIMEOUT);
        smtpReadResponse($socket, [220]);
        $helloName = preg_replace('/[^a-z0-9.-]/i', '', gethostname() ?: '') ?: 'localhost';
        smtpCommand($socket, 'EHLO ' . $helloName, [250]);

        if (SMTP_ENCRYPTION === 'tls') {
            smtpCommand($socket, 'STARTTLS', [220]);
            if (stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT) !== true) {
                throw new RuntimeException('Could not establish TLS encryption with the SMTP server.');
            }
            smtpCommand($socket, 'EHLO ' . $helloName, [250]);
        }

        smtpCommand($socket, 'AUTH LOGIN', [334]);
        smtpCommand($socket, base64_encode(SMTP_USER), [334]);
        smtpCommand($socket, base64_encode(SMTP_PASS), [235]);
        smtpCommand($socket, 'MAIL FROM:<' . $from . '>', [250]);
        smtpCommand($socket, 'RCPT TO:<' . $recipient . '>', [250, 251, 252]);
        smtpCommand($socket, 'DATA', [354]);

        $boundary = '=_sam_hub_' . bin2hex(random_bytes(16));
        $encodedFromName = '=?UTF-8?B?' . base64_encode(SMTP_FROM_NAME) . '?=';
        $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        $headers = [
            'From: ' . $encodedFromName . ' <' . $from . '>',
            'To: ' . $recipient,
            'Subject: ' . $encodedSubject,
            'Date: ' . date(DATE_RFC2822),
            'MIME-Version: 1.0',
            'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        ];
        $normalizeLines = static fn (string $body): string => str_replace(
            "\n",
            "\r\n",
            str_replace(["\r\n", "\r"], "\n", $body)
        );
        $message = implode("\r\n", $headers) . "\r\n\r\n"
            . '--' . $boundary . "\r\n"
            . "Content-Type: text/plain; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode($normalizeLines($textBody)), 76, "\r\n")
            . '--' . $boundary . "\r\n"
            . "Content-Type: text/html; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode($normalizeLines($htmlBody)), 76, "\r\n")
            . '--' . $boundary . "--\r\n";
        $message = preg_replace('/(^|\r\n)\./', '$1..', $message);
        smtpWrite($socket, $message . ".\r\n");
        smtpReadResponse($socket, [250]);
        smtpCommand($socket, 'QUIT', [221]);
    } finally {
        fclose($socket);
    }
}

function sendEmail(string $to, string $subject, string $textBody, string $htmlBody): void {
    if (APP_ENV !== 'production' && SMTP_HOST === '') {
        error_log("[local email] To: {$to}\nSubject: {$subject}\n{$textBody}");
        return;
    }

    try {
        sendSmtpEmail($to, $subject, $textBody, $htmlBody);
    } catch (Throwable $error) {
        error_log('SMTP delivery failed: ' . $error->getMessage());
        jsonResponse(502, ['message' => 'The email could not be sent. Check the SMTP settings and try again.']);
    }
}

function emailAction(mysqli $database, array $user, string $purpose, string $subject, string $heading, string $action, int $lifetimeMs, ?string $tokenOverride = null): string {
    $token = $tokenOverride ?? createAuthToken($database, $user['id'], $purpose, $lifetimeMs);
    $path = $purpose === 'verify-email' ? '/?verify=' : '/?reset=';
    if ($purpose === 'change-email') {
        $path = '/?change-email=';
    }
    $link = APP_BASE_URL . $path . urlencode($token);
    $text = $heading . "\n\nUse this link to " . $action . ': ' . $link . "\n\nThis link expires in " . (int) floor($lifetimeMs / 60_000) . " minutes.";
    $html = '<main style="font-family:Arial,sans-serif;color:#f4efdf;background:#171714;padding:32px"><div style="max-width:520px;margin:auto;border:1px solid #b8995d;padding:28px"><p style="color:#d3b66e;letter-spacing:2px">SAM BARBING HUB</p><h1 style="font-size:23px">' . htmlspecialchars($heading, ENT_QUOTES, 'UTF-8') . '</h1><p>Use the button below to ' . htmlspecialchars($action, ENT_QUOTES, 'UTF-8') . '.</p><p><a href="' . htmlspecialchars($link, ENT_QUOTES, 'UTF-8') . '" style="display:inline-block;background:#c5a25d;color:#171714;padding:12px 18px;text-decoration:none;font-weight:bold">' . htmlspecialchars($action, ENT_QUOTES, 'UTF-8') . '</a></p><p style="color:#c7c2b5;font-size:13px">This link expires in ' . (int) floor($lifetimeMs / 60_000) . ' minutes.</p></div></main>';
    sendEmail($user['email'], $subject, $text, $html);
    return $link;
}

function emailVerificationCode(mysqli $database, array $user): ?string {
    $code = str_pad((string) random_int(0, 99999999), 8, '0', STR_PAD_LEFT);
    createAuthToken($database, $user['id'], 'verify-email', 15 * 60 * 1000, $code);
    $subject = 'Your Sam Barbing Hub verification code';
    $text = "Your email verification code is {$code}.\n\nIt expires in 15 minutes. If you did not request this, you can ignore this email.";
    $safeCode = htmlspecialchars($code, ENT_QUOTES, 'UTF-8');
    $html = '<main style="font-family:Arial,sans-serif;color:#f4efdf;background:#171714;padding:32px"><div style="max-width:520px;margin:auto;border:1px solid #b8995d;padding:28px"><p style="color:#d3b66e;letter-spacing:2px">SAM BARBING HUB</p><h1 style="font-size:23px">Verify your email</h1><p>Enter this code to verify your email address:</p><p style="font-size:30px;font-weight:bold;letter-spacing:8px">' . $safeCode . '</p><p style="color:#c7c2b5;font-size:13px">This code expires in 15 minutes. If you did not request this, you can ignore this email.</p></div></main>';
    sendEmail($user['email'], $subject, $text, $html);
    return APP_ENV !== 'production' && SMTP_HOST === '' ? $code : null;
}

function emailActionPayload(string $message, string $link): array {
    $payload = ['message' => $message];
    if (APP_ENV !== 'production') {
        $payload['devLink'] = $link;
    }
    return $payload;
}

function beginSession(mysqli $database, array $user, bool $rememberMe = false): void {
    session_regenerate_id(true);
    $_SESSION['user_id'] = $user['id'];
    $cookieParams = session_get_cookie_params();
    setcookie(session_name(), session_id(), [
        'expires' => $rememberMe ? time() + 30 * 24 * 60 * 60 : 0,
        'path' => $cookieParams['path'],
        'domain' => $cookieParams['domain'],
        'secure' => $cookieParams['secure'],
        'httponly' => $cookieParams['httponly'],
        'samesite' => $cookieParams['samesite'],
    ]);
    saveUserSession($database, session_id(), $user['id'], substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 500));
}

if (!$database instanceof mysqli) {
    jsonResponse(500, ['message' => 'Database unavailable.']);
}

$requestUri = $_GET['path'] ?? ($_SERVER['PATH_INFO'] ?? ($_SERVER['REQUEST_URI'] ?? '/'));
$path = parse_url((string) $requestUri, PHP_URL_PATH) ?: '/';
$path = preg_replace('#^/api/?#', '/', $path);
$path = preg_replace('#^/api/index\.php/?#', '/', $path);
$path = trim($path, '/');
$route = $path === '' ? 'health' : $path;
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$body = readJsonBody();
trackCurrentSession($database);

if ($method === 'GET' && $route === 'health') {
    jsonResponse(200, ['ok' => true]);
}

if ($method === 'GET' && $route === 'auth/status') {
    $statement = $database->prepare('SELECT id FROM users WHERE role = "admin" LIMIT 1');
    $statement->execute();
    $adminExists = $statement->get_result()->fetch_assoc() !== null;
    $emailConfigured = SMTP_HOST !== '' && SMTP_USER !== '' && SMTP_PASS !== ''
        && filter_var(APP_EMAIL_FROM, FILTER_VALIDATE_EMAIL) !== false
        && in_array(SMTP_ENCRYPTION, ['tls', 'ssl'], true);
    jsonResponse(200, ['adminExists' => $adminExists, 'emailConfigured' => $emailConfigured]);
}

if ($method === 'POST' && $route === 'auth/setup-admin') {
    enforceRateLimit($database, $route);
    $name = trim((string) ($body['name'] ?? ''));
    $email = strtolower(trim((string) ($body['email'] ?? '')));
    $password = (string) ($body['password'] ?? '');

    if (strlen($name) < 2 || strlen($name) > 80 || !validEmail($email) || !validPassword($password)) {
        jsonResponse(400, ['message' => 'Enter a name, valid email, and password of at least 8 characters.']);
    }

    $existing = $database->prepare('SELECT id FROM users WHERE role = "admin" LIMIT 1');
    $existing->execute();
    if ($existing->get_result()->fetch_assoc()) {
        jsonResponse(409, ['code' => 'ADMIN_EXISTS', 'message' => 'A manager account already exists. Sign in or return to worker access.']);
    }

    $passwordHash = password_hash($password, PASSWORD_BCRYPT);
    $userId = bin2hex(random_bytes(16));
    $createdAt = gmdate('Y-m-d H:i:s');

    $insert = $database->prepare('INSERT INTO users (id, name, email, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, "admin", "approved", ?)');
    $insert->bind_param('sssss', $userId, $name, $email, $passwordHash, $createdAt);
    $insert->execute();

    $createdUser = findUser($database, $userId);
    $devCode = emailVerificationCode($database, $createdUser);
    $payload = ['message' => 'Manager account created. Enter the verification code sent to your email within 15 minutes.'];
    if ($devCode !== null) {
        $payload['devCode'] = $devCode;
    }
    jsonResponse(201, $payload);
}

if ($method === 'POST' && $route === 'auth/register') {
    enforceRateLimit($database, $route);
    $name = trim((string) ($body['name'] ?? ''));
    $email = strtolower(trim((string) ($body['email'] ?? '')));
    $password = (string) ($body['password'] ?? '');

    if (strlen($name) < 2 || strlen($name) > 80 || !validEmail($email) || !validPassword($password)) {
        jsonResponse(400, ['message' => 'Enter a name, valid email, and password of at least 8 characters.']);
    }

    $passwordHash = password_hash($password, PASSWORD_BCRYPT);
    $userId = bin2hex(random_bytes(16));
    $createdAt = gmdate('Y-m-d H:i:s');

    try {
        $insert = $database->prepare('INSERT INTO users (id, name, email, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, "worker", "pending", ?)');
        $insert->bind_param('sssss', $userId, $name, $email, $passwordHash, $createdAt);
        $insert->execute();
    } catch (Throwable $exception) {
        jsonResponse(409, ['message' => 'An account with this email already exists.']);
    }

    $createdUser = findUser($database, $userId);
    $devCode = emailVerificationCode($database, $createdUser);
    $payload = ['message' => 'Account created. Enter the verification code sent to your email within 15 minutes.'];
    if ($devCode !== null) {
        $payload['devCode'] = $devCode;
    }
    jsonResponse(201, $payload);
}

if ($method === 'POST' && $route === 'auth/verify-email') {
    enforceRateLimit($database, $route);
    $code = trim((string) ($body['code'] ?? ''));
    $token = (string) ($body['token'] ?? '');
    $verificationValue = $code !== '' ? $code : $token;
    if (!preg_match('/^\d{8}$/', $code) && (strlen($token) < 1 || strlen($token) > 200)) {
        jsonResponse(400, ['message' => 'Enter the 8-digit verification code from your email.']);
    }

    $hash = hashToken($verificationValue);
    $statement = $database->prepare(
        'SELECT user_id
        FROM auth_tokens
        WHERE token_hash = ?
        AND purpose = "verify-email"
        AND expires_at > ?
        LIMIT 1'
    );
    $now = (int) floor(microtime(true) * 1000);
    $statement->bind_param('si', $hash, $now);
    $statement->execute();
    $tokenRow = $statement->get_result()->fetch_assoc();

    if (!$tokenRow) {
        jsonResponse(400, ['message' => 'This verification code is invalid or expired. Request a new code and try again.']);
    }

    $user = findUser($database, $tokenRow['user_id']);
    if (!$user) {
        jsonResponse(400, ['message' => 'This verification code is invalid or expired. Request a new code and try again.']);
    }

    $verifiedAt = gmdate('Y-m-d H:i:s');
    $update = $database->prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?');
    $update->bind_param('ss', $verifiedAt, $user['id']);
    $update->execute();

    $deleteToken = $database->prepare('DELETE FROM auth_tokens WHERE token_hash = ?');
    $deleteToken->bind_param('s', $hash);
    $deleteToken->execute();

    $roleText = $user['role'] === 'worker'
        ? 'Email verified. Your manager must approve the account before you can sign in.'
        : 'Email verified. You can now sign in as manager.';

    jsonResponse(200, ['message' => $roleText]);
}

if ($method === 'POST' && $route === 'auth/resend-verification') {
    enforceRateLimit($database, $route);
    $email = strtolower(trim((string) ($body['email'] ?? '')));
    $genericMessage = 'If the account needs verification, a new code has been sent.';
    if (!validEmail($email)) {
        jsonResponse(200, ['message' => $genericMessage]);
    }

    $statement = $database->prepare('SELECT * FROM users WHERE email = ? AND email_verified_at IS NULL LIMIT 1');
    $statement->bind_param('s', $email);
    $statement->execute();
    $user = $statement->get_result()->fetch_assoc();
    if (!$user) {
        jsonResponse(200, ['message' => $genericMessage]);
    }

    $devCode = emailVerificationCode($database, $user);
    $payload = ['message' => $genericMessage];
    if ($devCode !== null) {
        $payload['devCode'] = $devCode;
    }
    jsonResponse(200, $payload);
}

if ($method === 'POST' && $route === 'auth/forgot-password') {
    enforceRateLimit($database, $route);
    $email = strtolower(trim((string) ($body['email'] ?? '')));
    $genericMessage = 'If an account exists for that email, a password reset link has been sent.';
    if (APP_ENV !== 'production') {
        jsonResponse(503, ['message' => 'Password-reset email delivery is not enabled on this server.']);
    }
    if (!validEmail($email)) {
        jsonResponse(200, ['message' => $genericMessage]);
    }

    $statement = $database->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
    $statement->bind_param('s', $email);
    $statement->execute();
    $user = $statement->get_result()->fetch_assoc();
    if (!$user) {
        jsonResponse(200, ['message' => $genericMessage]);
    }

    emailAction($database, $user, 'reset-password', 'Reset your Sam Barbing Hub password', 'Reset your password', 'reset your password', 60 * 60 * 1000);
    jsonResponse(200, ['message' => $genericMessage]);
}

if ($method === 'POST' && $route === 'auth/validate-reset-token') {
    $token = (string) ($body['token'] ?? '');
    if (strlen($token) < 1 || strlen($token) > 200) {
        jsonResponse(400, ['message' => 'This password-reset link is invalid or expired.']);
    }

    $hash = hashToken($token);
    $statement = $database->prepare('SELECT user_id FROM auth_tokens WHERE token_hash = ? AND purpose = "reset-password" AND expires_at > ? LIMIT 1');
    $now = (string) (time() * 1000);
    $statement->bind_param('ss', $hash, $now);
    $statement->execute();
    if (!$statement->get_result()->fetch_assoc()) {
        jsonResponse(400, ['message' => 'This password-reset link is invalid or expired.']);
    }

    jsonResponse(200, ['message' => 'Reset link verified.']);
}

if ($method === 'POST' && $route === 'auth/reset-password') {
    $token = (string) ($body['token'] ?? '');
    $password = (string) ($body['password'] ?? '');

    if (strlen($token) < 1 || strlen($token) > 200 || !validPassword($password)) {
        jsonResponse(400, ['message' => 'Use a valid reset link and a password of at least 8 characters.']);
    }

    $hash = hashToken($token);
    $statement = $database->prepare('SELECT user_id FROM auth_tokens WHERE token_hash = ? AND purpose = "reset-password" AND expires_at > ? LIMIT 1');
    $now = (string) (time() * 1000);
    $statement->bind_param('ss', $hash, $now);
    $statement->execute();
    $tokenRow = $statement->get_result()->fetch_assoc();

    if (!$tokenRow) {
        jsonResponse(400, ['message' => 'This password-reset link is invalid or expired.']);
    }

    $passwordHash = password_hash($password, PASSWORD_BCRYPT);
    $update = $database->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    $update->bind_param('ss', $passwordHash, $tokenRow['user_id']);
    $update->execute();

    $deleteTokens = $database->prepare('DELETE FROM auth_tokens WHERE user_id = ?');
    $deleteTokens->bind_param('s', $tokenRow['user_id']);
    $deleteTokens->execute();

    jsonResponse(200, ['message' => 'Password reset successfully. Sign in with your new password.']);
}

if ($method === 'PATCH' && $route === 'account/email') {
    enforceRateLimit($database, $route);
    $user = requireAuth($database);
    if (!$user) {
        jsonResponse(401, ['message' => 'Please sign in to continue.']);
    }

    $email = strtolower(trim((string) ($body['email'] ?? '')));
    $password = (string) ($body['password'] ?? '');
    if (!validEmail($email) || $email === strtolower($user['email']) || $password === '') {
        jsonResponse(400, ['message' => 'Enter a valid email and your current password.']);
    }

    if (!password_verify($password, $user['password_hash'])) {
        jsonResponse(400, ['message' => 'Current password is incorrect.']);
    }

    $check = $database->prepare('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1');
    $check->bind_param('ss', $email, $user['id']);
    $check->execute();
    if ($check->get_result()->fetch_assoc()) {
        jsonResponse(409, ['message' => 'An account with that email already exists.']);
    }

    $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    $hash = hashToken($token);
    $now = (string) (time() * 1000);
    $delete = $database->prepare('DELETE FROM email_change_tokens WHERE user_id = ? OR expires_at <= ?');
    $delete->bind_param('ss', $user['id'], $now);
    $delete->execute();

    $expires = (string) ((int) (microtime(true) * 1000) + 30 * 60 * 1000);
    $insert = $database->prepare('INSERT INTO email_change_tokens (token_hash, user_id, target_email, expires_at, created_at) VALUES (?, ?, ?, ?, NOW())');
    $insert->bind_param('ssss', $hash, $user['id'], $email, $expires);
    $insert->execute();

    $devLink = emailAction($database, ['id' => $user['id'], 'email' => $email], 'change-email', 'Confirm your new Sam Barbing Hub email', 'Confirm your new email', 'confirm this email address', 30 * 60 * 1000, $token);
    jsonResponse(200, emailActionPayload('We sent a confirmation link to your new email address. Your current email remains active until you confirm it.', $devLink));
}

if ($method === 'POST' && $route === 'auth/confirm-email-change') {
    $token = (string) ($body['token'] ?? '');
    if (strlen($token) < 1 || strlen($token) > 200) {
        jsonResponse(400, ['message' => 'This email-change link is invalid or expired.']);
    }

    $hash = hashToken($token);
    $statement = $database->prepare('SELECT user_id, target_email FROM email_change_tokens WHERE token_hash = ? AND expires_at > ? LIMIT 1');
    $now = (string) (time() * 1000);
    $statement->bind_param('ss', $hash, $now);
    $statement->execute();
    $pending = $statement->get_result()->fetch_assoc();

    if (!$pending) {
        jsonResponse(400, ['message' => 'This email-change link is invalid or expired.']);
    }

    $verifiedAt = gmdate('Y-m-d H:i:s');
    $update = $database->prepare('UPDATE users SET email = ?, email_verified_at = ? WHERE id = ?');
    $update->bind_param('sss', $pending['target_email'], $verifiedAt, $pending['user_id']);
    $update->execute();

    $deleteEmailChange = $database->prepare('DELETE FROM email_change_tokens WHERE user_id = ?');
    $deleteEmailChange->bind_param('s', $pending['user_id']);
    $deleteEmailChange->execute();

    $deleteTokens = $database->prepare('DELETE FROM auth_tokens WHERE user_id = ?');
    $deleteTokens->bind_param('s', $pending['user_id']);
    $deleteTokens->execute();

    jsonResponse(200, ['message' => 'Email updated and verified. Sign in with your new address.']);
}

if ($method === 'POST' && $route === 'auth/login') {
    enforceRateLimit($database, $route);
    $email = strtolower(trim((string) ($body['email'] ?? '')));
    $password = (string) ($body['password'] ?? '');
    $role = (string) ($body['role'] ?? '');
    $rememberMe = ($body['rememberMe'] ?? false) === true;

    if (!validEmail($email) || !validPassword($password) || !in_array($role, ['admin', 'worker'], true)) {
        jsonResponse(400, ['message' => 'Enter a valid email, password, and account type.']);
    }

    $statement = $database->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
    $statement->bind_param('s', $email);
    $statement->execute();
    $user = $statement->get_result()->fetch_assoc();

    if (!$user || $user['role'] !== $role || !password_verify($password, $user['password_hash'])) {
        jsonResponse(401, ['message' => 'The email or password is incorrect.']);
    }

    if (empty($user['email_verified_at'])) {
        jsonResponse(403, ['code' => 'EMAIL_NOT_VERIFIED', 'message' => 'Verify your email before signing in.']);
    }

    if ($user['status'] === 'pending') {
        jsonResponse(403, ['code' => 'PENDING', 'message' => 'Your account is waiting for manager approval.']);
    }

    if ($user['status'] === 'disabled') {
        jsonResponse(403, ['code' => 'DISABLED', 'message' => 'This account is disabled. Contact the manager.']);
    }

    beginSession($database, $user, $rememberMe);
    jsonResponse(200, ['user' => publicUser($user)]);
}

if ($method === 'GET' && $route === 'auth/session') {
    $user = currentUser($database);
    if (!$user) {
        jsonResponse(200, ['user' => null]);
    }

    $authedUser = requireAuth($database);
    if (!$authedUser) {
        jsonResponse(200, ['user' => null]);
    }

    jsonResponse(200, ['user' => publicUser($authedUser)]);
}

if ($method === 'GET' && $route === 'account/sessions') {
    $user = requireAuth($database);
    if (!$user) {
        jsonResponse(401, ['message' => 'Please sign in to continue.']);
    }

    $cutoff = gmdate('Y-m-d H:i:s', time() - 5 * 60);
    $statement = $database->prepare(
        'SELECT sid, device_name, created_at, last_seen
        FROM user_sessions
        WHERE user_id = ? AND revoked_at IS NULL AND last_seen >= ?
        ORDER BY last_seen DESC'
    );
    $statement->bind_param('ss', $user['id'], $cutoff);
    $statement->execute();
    $sessions = array_map(static fn($row) => [
        'id' => $row['sid'],
        'device' => $row['device_name'],
        'createdAt' => $row['created_at'],
        'lastSeen' => $row['last_seen'],
        'isCurrent' => $row['sid'] === session_id(),
    ], $statement->get_result()->fetch_all(MYSQLI_ASSOC));
    jsonResponse(200, ['sessions' => $sessions]);
}

if ($method === 'POST' && $route === 'account/session/heartbeat') {
    $user = requireAuth($database);
    if (!$user) {
        jsonResponse(401, ['message' => 'Please sign in to continue.']);
    }
    jsonResponse(200, ['ok' => true]);
}

if ($method === 'DELETE' && preg_match('/^account\/sessions\/([a-zA-Z0-9,-]+)$/', $route, $match)) {
    $user = requireAuth($database);
    if (!$user) {
        jsonResponse(401, ['message' => 'Please sign in to continue.']);
    }
    if ($match[1] === session_id()) {
        jsonResponse(400, ['message' => 'Use sign out to end the current device session.']);
    }

    $now = gmdate('Y-m-d H:i:s');
    $statement = $database->prepare(
        'UPDATE user_sessions SET revoked_at = ? WHERE sid = ? AND user_id = ? AND revoked_at IS NULL'
    );
    $statement->bind_param('sss', $now, $match[1], $user['id']);
    $statement->execute();
    if ($statement->affected_rows === 0) {
        jsonResponse(404, ['message' => 'That active session was not found.']);
    }
    jsonResponse(200, ['ok' => true]);
}

if ($method === 'POST' && $route === 'auth/logout') {
    if (!empty($_SESSION['user_id'])) {
        $now = gmdate('Y-m-d H:i:s');
        $statement = $database->prepare('UPDATE user_sessions SET revoked_at = ? WHERE sid = ? AND revoked_at IS NULL');
        $currentSessionId = session_id();
        $statement->bind_param('ss', $now, $currentSessionId);
        $statement->execute();
    }
    session_destroy();
    jsonResponse(204, []);
}

if ($method === 'GET' && $route === 'notifications') {
    $user = requireAuth($database);
    if (!$user || $user['role'] !== 'worker') {
        jsonResponse(403, ['message' => 'Worker access is required.']);
    }

    $statement = $database->prepare('SELECT id, record_id, kind, message, created_at, read_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50');
    $statement->bind_param('s', $user['id']);
    $statement->execute();
    $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
    $notifications = array_map(static fn($row) => [
        'id' => $row['id'],
        'recordId' => $row['record_id'],
        'kind' => $row['kind'],
        'message' => $row['message'],
        'createdAt' => $row['created_at'],
        'readAt' => $row['read_at'],
    ], $rows);

    jsonResponse(200, ['notifications' => $notifications]);
}

if ($method === 'PATCH' && preg_match('/^notifications\/(.+)\/read$/', $route, $match)) {
    $user = requireAuth($database);
    if (!$user || $user['role'] !== 'worker') {
        jsonResponse(403, ['message' => 'Worker access is required.']);
    }

    $notificationId = $match[1];
    $update = $database->prepare('UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = ? AND user_id = ?');
    $update->bind_param('ss', $notificationId, $user['id']);
    $update->execute();
    jsonResponse(200, ['ok' => true]);
}

if ($method === 'GET' && $route === 'records') {
    $user = requireAuth($database);
    if (!$user) {
        jsonResponse(401, ['message' => 'Please sign in to continue.']);
    }

    if ($user['role'] === 'admin') {
        $statement = $database->prepare('SELECT records.*, users.name AS user FROM records JOIN users ON users.id = records.user_id ORDER BY records.created_at DESC');
    } else {
        $statement = $database->prepare('SELECT records.*, users.name AS user FROM records JOIN users ON users.id = records.user_id WHERE records.user_id = ? ORDER BY records.created_at DESC');
        $statement->bind_param('s', $user['id']);
    }

    $statement->execute();
    $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
    jsonResponse(200, ['records' => array_map('publicRecord', $rows)]);
}

if ($method === 'POST' && $route === 'records') {
    $user = requireAuth($database);
    if (!$user) {
        jsonResponse(401, ['message' => 'Please sign in to continue.']);
    }

    $service = trim((string) ($body['service'] ?? ''));
    $amount = (float) ($body['amount'] ?? 0);
    $type = (string) ($body['type'] ?? '');
    if ($user['role'] !== 'worker' || $type !== 'income' || strlen($service) < 2 || strlen($service) > 120 || !is_numeric($body['amount'] ?? null) || $amount <= 0 || $amount > 1000000000) {
        jsonResponse(400, ['message' => 'Enter a valid description and amount.']);
    }

    $createdAt = gmdate('Y-m-d H:i:s');
    $recordId = bin2hex(random_bytes(16));
    $insert = $database->prepare('INSERT INTO records (id, service, amount, type, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    $insert->bind_param('ssdsss', $recordId, $service, $amount, $type, $user['id'], $createdAt);
    $insert->execute();
    jsonResponse(201, ['record' => publicRecord(['id' => $recordId, 'service' => $service, 'amount' => $amount, 'type' => $type, 'user_id' => $user['id'], 'user' => $user['name'], 'created_at' => $createdAt, 'reaction' => null, 'reacted_at' => null])]);
}

if ($method === 'POST' && $route === 'expenditures') {
    $user = requireAuth($database);
    if (!$user) {
        jsonResponse(401, ['message' => 'Please sign in to continue.']);
    }

    $description = trim((string) ($body['description'] ?? ''));
    $amount = (float) ($body['amount'] ?? 0);
    if (strlen($description) < 2 || strlen($description) > 120 || !is_numeric($body['amount'] ?? null) || $amount <= 0 || $amount > 1000000000) {
        jsonResponse(400, ['message' => 'Enter an expenditure description and a valid amount.']);
    }

    $createdAt = gmdate('Y-m-d H:i:s');
    $recordId = bin2hex(random_bytes(16));
    $type = 'expense';
    $insert = $database->prepare('INSERT INTO records (id, service, amount, type, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    $insert->bind_param('ssdsss', $recordId, $description, $amount, $type, $user['id'], $createdAt);
    $insert->execute();

    jsonResponse(201, ['record' => publicRecord(['id' => $recordId, 'service' => $description, 'amount' => $amount, 'type' => $type, 'user_id' => $user['id'], 'user' => $user['name'], 'created_at' => $createdAt, 'reaction' => null, 'reacted_at' => null])]);
}

if ($method === 'GET' && $route === 'admin/workers') {
    $user = requireAuth($database);
    if (!$user || !requireAdmin($user)) {
        jsonResponse(403, ['message' => 'Manager access is required.']);
    }

    $statement = $database->prepare('SELECT id, name, email, status, created_at FROM users WHERE role = "worker" ORDER BY created_at DESC');
    $statement->execute();
    $workers = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
    jsonResponse(200, ['workers' => array_map(static fn($worker) => [
        'id' => $worker['id'],
        'name' => $worker['name'],
        'email' => $worker['email'],
        'status' => $worker['status'],
        'createdAt' => $worker['created_at'],
    ], $workers)]);
}

if ($method === 'PATCH' && preg_match('/^admin\/records\/(.+)\/reaction$/', $route, $match)) {
    $user = requireAuth($database);
    if (!$user || !requireAdmin($user)) {
        jsonResponse(403, ['message' => 'Manager access is required.']);
    }

    $reaction = $body['reaction'] ?? null;
    if ($reaction !== null && $reaction !== 'like') {
        jsonResponse(400, ['message' => 'Choose a supported reaction.']);
    }

    $recordId = $match[1];
    $statement = $database->prepare('SELECT id, user_id, service, type FROM records WHERE id = ? LIMIT 1');
    $statement->bind_param('s', $recordId);
    $statement->execute();
    $record = $statement->get_result()->fetch_assoc();

    if (!$record || $record['type'] !== 'income') {
        jsonResponse(404, ['message' => 'Service record not found.']);
    }

    $reactedAt = $reaction ? gmdate('Y-m-d H:i:s') : null;
    $update = $database->prepare('UPDATE records SET reaction = ?, reacted_at = ? WHERE id = ?');
    $update->bind_param('sss', $reaction, $reactedAt, $record['id']);
    $update->execute();

    if ($reaction) {
        $notificationId = bin2hex(random_bytes(16));
        $message = 'Manager reacted to your service: ' . $record['service'];
        $insert = $database->prepare('INSERT INTO notifications (id, user_id, record_id, kind, message, created_at) VALUES (?, ?, ?, "record-reaction", ?, ?)');
        $insert->bind_param('sssss', $notificationId, $record['user_id'], $record['id'], $message, $reactedAt);
        $insert->execute();
    }

    jsonResponse(200, ['reaction' => $reaction, 'reactedAt' => $reactedAt]);
}

if ($method === 'PATCH' && preg_match('/^admin\/workers\/(.+)$/', $route, $match)) {
    $user = requireAuth($database);
    if (!$user || !requireAdmin($user)) {
        jsonResponse(403, ['message' => 'Manager access is required.']);
    }

    $status = (string) ($body['status'] ?? '');
    if (!in_array($status, ['approved', 'disabled'], true)) {
        jsonResponse(400, ['message' => 'Choose approved or disabled.']);
    }

    $workerId = $match[1];
    $update = $database->prepare('UPDATE users SET status = ? WHERE id = ? AND role = "worker"');
    $update->bind_param('ss', $status, $workerId);
    $update->execute();

    if ($update->affected_rows === 0) {
        jsonResponse(404, ['message' => 'Worker account not found.']);
    }

    $statement = $database->prepare('SELECT id, name, email, status, created_at FROM users WHERE id = ? LIMIT 1');
    $statement->bind_param('s', $workerId);
    $statement->execute();
    $worker = $statement->get_result()->fetch_assoc();
    jsonResponse(200, ['worker' => [
        'id' => $worker['id'],
        'name' => $worker['name'],
        'email' => $worker['email'],
        'status' => $worker['status'],
        'createdAt' => $worker['created_at'],
    ]]);
}

if ($method === 'PATCH' && $route === 'account/password') {
    $user = requireAuth($database);
    if (!$user) {
        jsonResponse(401, ['message' => 'Please sign in to continue.']);
    }

    $currentPassword = (string) ($body['currentPassword'] ?? '');
    $nextPassword = (string) ($body['nextPassword'] ?? '');

    if (strlen($currentPassword) === 0 || !validPassword($nextPassword)) {
        jsonResponse(400, ['message' => 'Enter your current password and a new password of at least 8 characters.']);
    }

    if (!password_verify($currentPassword, $user['password_hash'])) {
        jsonResponse(400, ['message' => 'Current password is incorrect.']);
    }

    $passwordHash = password_hash($nextPassword, PASSWORD_BCRYPT);
    $update = $database->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    $update->bind_param('ss', $passwordHash, $user['id']);
    $update->execute();

    $oldSessionId = session_id();
    $revokedAt = gmdate('Y-m-d H:i:s');
    $revokeOthers = $database->prepare(
        'UPDATE user_sessions SET revoked_at = ? WHERE user_id = ? AND sid != ? AND revoked_at IS NULL'
    );
    $revokeOthers->bind_param('sss', $revokedAt, $user['id'], $oldSessionId);
    $revokeOthers->execute();
    $revoke = $database->prepare('UPDATE user_sessions SET revoked_at = ? WHERE sid = ? AND revoked_at IS NULL');
    $revoke->bind_param('ss', $revokedAt, $oldSessionId);
    $revoke->execute();
    session_regenerate_id(true);
    saveUserSession($database, session_id(), $user['id'], substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 500));
    jsonResponse(200, ['ok' => true]);
}

jsonResponse(404, ['message' => 'Route not found.']);
