CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'worker') NOT NULL,
    status ENUM('pending', 'approved', 'disabled') NOT NULL,
    email_verified_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS records (
    id CHAR(36) PRIMARY KEY,
    service VARCHAR(120) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    type ENUM('income', 'expense') NOT NULL,
    user_id CHAR(36) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reaction VARCHAR(20) NULL,
    reacted_at DATETIME NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX records_created_at ON records(created_at);
CREATE INDEX records_user_id ON records(user_id);

CREATE TABLE IF NOT EXISTS auth_tokens (
    token_hash CHAR(64) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    purpose ENUM('verify-email', 'reset-password') NOT NULL,
    expires_at BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX auth_tokens_user_purpose ON auth_tokens(user_id, purpose);

CREATE TABLE IF NOT EXISTS email_change_tokens (
    token_hash CHAR(64) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    target_email VARCHAR(255) NOT NULL,
    expires_at BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_target_email (target_email),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    record_id CHAR(36) NOT NULL,
    kind VARCHAR(50) NOT NULL,
    message VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (record_id) REFERENCES records(id) ON DELETE CASCADE
);

CREATE INDEX notifications_user_created ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_sessions (
    sid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    device_name VARCHAR(120) NOT NULL,
    user_agent VARCHAR(500) NOT NULL,
    created_at DATETIME NOT NULL,
    last_seen DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS request_rate_limits (
    rate_key CHAR(64) NOT NULL,
    route VARCHAR(50) NOT NULL,
    window_started BIGINT NOT NULL,
    attempts INT NOT NULL,
    PRIMARY KEY (rate_key, route)
);
