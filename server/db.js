import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";

const configuredPath = process.env.DATABASE_PATH || "data/sam-hub.sqlite";
const databasePath = resolve(process.cwd(), configuredPath);
mkdirSync(dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'worker')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'disabled')),
    email_verified_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS one_admin_account
    ON users(role) WHERE role = 'admin';

  CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    service TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    reaction TEXT,
    reacted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS records_created_at ON records(created_at);
  CREATE INDEX IF NOT EXISTS records_user_id ON records(user_id);

  CREATE TABLE IF NOT EXISTS auth_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('verify-email', 'reset-password')),
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS auth_tokens_user_purpose ON auth_tokens(user_id, purpose);

  CREATE TABLE IF NOT EXISTS email_change_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at TEXT
  );

  CREATE INDEX IF NOT EXISTS notifications_user_created ON notifications(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expires INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires);

  CREATE TABLE IF NOT EXISTS user_sessions (
    sid TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name TEXT NOT NULL,
    user_agent TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    revoked_at TEXT
  );

  CREATE INDEX IF NOT EXISTS user_sessions_user_last_seen ON user_sessions(user_id, last_seen);
`);

const userColumns = db.pragma("table_info(users)");
if (!userColumns.some((column) => column.name === "email_verified_at")) {
  db.exec("ALTER TABLE users ADD COLUMN email_verified_at TEXT");
}

const recordColumns = db.pragma("table_info(records)");
if (!recordColumns.some((column) => column.name === "reaction")) {
  db.exec("ALTER TABLE records ADD COLUMN reaction TEXT");
}
if (!recordColumns.some((column) => column.name === "reacted_at")) {
  db.exec("ALTER TABLE records ADD COLUMN reacted_at TEXT");
}

export default db;
