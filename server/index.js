import "dotenv/config";
import express from "express";
import session from "express-session";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import db from "./db.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET;
const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);

if (isProduction && !sessionSecret) {
  throw new Error("SESSION_SECRET must be set in production.");
}
if (isProduction && !smtpConfigured) {
  throw new Error("SMTP_HOST and SMTP_FROM must be set in production.");
}
if (isProduction && Boolean(process.env.SMTP_USER) !== Boolean(process.env.SMTP_PASS)) {
  throw new Error("Set both SMTP_USER and SMTP_PASS, or leave both unset for unauthenticated SMTP.");
}

const mailTransport = smtpConfigured ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true" || process.env.SMTP_PORT === "465",
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
}) : null;
const appBaseUrl = (process.env.APP_BASE_URL || "http://localhost:5173").replace(/\/$/, "");

if (isProduction) app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
    },
  },
}));
app.use(express.json({ limit: "20kb" }));

class SQLiteSessionStore extends session.Store {
  constructor(database) {
    super();
    this.database = database;
    this.read = database.prepare("SELECT sess, expires FROM sessions WHERE sid = ?");
    this.write = database.prepare("INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires");
    this.remove = database.prepare("DELETE FROM sessions WHERE sid = ?");
    this.removeExpired = database.prepare("DELETE FROM sessions WHERE expires <= ?");
    this.updateExpiry = database.prepare("UPDATE sessions SET expires = ? WHERE sid = ?");
    this.removeExpired.run(Date.now());
  }

  get(sid, callback) {
    try {
      const row = this.read.get(sid);
      if (!row) return callback(null, null);
      if (row.expires <= Date.now()) {
        this.remove.run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.sess));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, value, callback = () => {}) {
    try {
      const expiration = value.cookie?.expires
        ? new Date(value.cookie.expires).getTime()
        : Date.now() + (value.cookie?.maxAge || 14 * 24 * 60 * 60 * 1000);
      this.write.run(sid, JSON.stringify(value), expiration);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(sid, value, callback = () => {}) {
    try {
      const expiration = value.cookie?.expires
        ? new Date(value.cookie.expires).getTime()
        : Date.now() + (value.cookie?.maxAge || 14 * 24 * 60 * 60 * 1000);
      this.updateExpiry.run(expiration, sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      this.remove.run(sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }
}

app.use(session({
  name: "sam_hub_session",
  secret: sessionSecret || "development-only-change-before-deployment",
  store: new SQLiteSessionStore(db),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: isProduction,
    maxAge: 14 * 24 * 60 * 60 * 1000,
  },
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." },
});

const findUser = db.prepare("SELECT * FROM users WHERE id = ?");
const toPublicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  emailVerified: Boolean(user.email_verified_at),
  createdAt: user.created_at,
});
const toPublicRecord = (row) => ({
  id: row.id, service: row.service, amount: row.amount, type: row.type,
  userId: row.user_id, user: row.user, createdAt: row.created_at,
  reaction: row.reaction, reactedAt: row.reacted_at,
});
const validEmail = (email) => typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validPassword = (password) => typeof password === "string" && password.length >= 8 && password.length <= 128;
const hashToken = (token) => createHash("sha256").update(token).digest("hex");

const createAuthToken = (userId, purpose, expiresInMs) => {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  db.prepare("DELETE FROM auth_tokens WHERE user_id = ? AND purpose = ?").run(userId, purpose);
  db.prepare("INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(tokenHash, userId, purpose, Date.now() + expiresInMs, new Date().toISOString());
  return token;
};

const createEmailChangeToken = (userId, targetEmail) => {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const timestamp = new Date().toISOString();
  const save = db.transaction(() => {
    db.prepare("DELETE FROM email_change_tokens WHERE user_id = ? OR expires_at <= ?").run(userId, Date.now());
    db.prepare("INSERT INTO email_change_tokens (token_hash, user_id, target_email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(tokenHash, userId, targetEmail, Date.now() + 30 * 60 * 1000, timestamp);
  });
  save();
  return token;
};

const emailAction = async ({ user, purpose, subject, heading, action, lifetime, token: suppliedToken }) => {
  const token = suppliedToken || createAuthToken(user.id, purpose, lifetime);
  const path = purpose === "verify-email" ? "/?verify=" : purpose === "change-email" ? "/?change-email=" : "/?reset=";
  const link = `${appBaseUrl}${path}${encodeURIComponent(token)}`;
  const text = `${heading}\n\nUse this link to ${action}: ${link}\n\nThis link expires in ${Math.floor(lifetime / 60_000)} minutes. If you did not request this, you can ignore this email.`;
  const html = `<main style="font-family:Arial,sans-serif;color:#f4efdf;background:#171714;padding:32px"><div style="max-width:520px;margin:auto;border:1px solid #b8995d;padding:28px"><p style="color:#d3b66e;letter-spacing:2px">SAM BARBING HUB</p><h1 style="font-size:23px">${heading}</h1><p>Use the button below to ${action}.</p><p><a href="${link}" style="display:inline-block;background:#c5a25d;color:#171714;padding:12px 18px;text-decoration:none;font-weight:bold">${action}</a></p><p style="color:#c7c2b5;font-size:13px">This link expires in ${Math.floor(lifetime / 60_000)} minutes. If you did not request this, you can ignore this email.</p></div></main>`;

  if (mailTransport) {
    await mailTransport.sendMail({ from: process.env.SMTP_FROM, to: user.email, subject, text, html });
    return null;
  }

  if (isProduction) throw new Error("Email delivery is not configured.");
  console.info(`[local email] ${subject} for ${user.email}: ${link}`);
  return link;
};

const requireAuth = (request, response, next) => {
  const user = request.session.userId ? findUser.get(request.session.userId) : null;
  if (!user || !user.email_verified_at || user.status === "disabled" || (user.role === "worker" && user.status !== "approved")) {
    if (request.session.userId) request.session.destroy(() => {});
    return response.status(401).json({ message: "Please sign in to continue." });
  }
  request.user = user;
  return next();
};

const requireAdmin = (request, response, next) => {
  if (request.user?.role !== "admin") {
    return response.status(403).json({ message: "Manager access is required." });
  }
  return next();
};

const beginSession = (request, user) => new Promise((resolveSession, reject) => {
  request.session.regenerate((error) => {
    if (error) return reject(error);
    request.session.userId = user.id;
    request.session.save((saveError) => saveError ? reject(saveError) : resolveSession());
  });
});

const deleteSessionsForUser = (userId, exceptSid = "") => {
  const rows = db.prepare("SELECT sid, sess FROM sessions").all();
  const remove = db.prepare("DELETE FROM sessions WHERE sid = ?");
  for (const row of rows) {
    try {
      if (row.sid !== exceptSid && JSON.parse(row.sess).userId === userId) remove.run(row.sid);
    } catch {
      remove.run(row.sid);
    }
  }
};

app.get("/api/health", (_request, response) => response.json({ ok: true }));
app.get("/api/auth/status", (_request, response) => {
  const adminExists = Boolean(db.prepare("SELECT id FROM users WHERE role = 'admin'").get());
  response.set("Cache-Control", "no-store").json({ adminExists, emailConfigured: smtpConfigured });
});

app.post("/api/auth/setup-admin", authLimiter, async (request, response, next) => {
  const { name, email, password } = request.body || {};
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 80 || !validEmail(email) || !validPassword(password)) {
    return response.status(400).json({ message: "Enter a name, valid email, and password of at least 8 characters." });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const createAdmin = db.transaction(() => {
      if (db.prepare("SELECT id FROM users WHERE role = 'admin'").get()) return null;
      const admin = {
        id: randomUUID(), name: name.trim(), email: email.trim().toLowerCase(),
        passwordHash, createdAt: new Date().toISOString(),
      };
      db.prepare("INSERT INTO users (id, name, email, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, 'admin', 'approved', ?)")
        .run(admin.id, admin.name, admin.email, admin.passwordHash, admin.createdAt);
      return findUser.get(admin.id);
    });
    const user = createAdmin();
    if (!user) return response.status(409).json({ code: "ADMIN_EXISTS", message: "A manager account already exists. Sign in or return to worker access." });
    const devLink = await emailAction({
      user, purpose: "verify-email", subject: "Verify your Sam Barbing Hub manager email",
      heading: "Verify your manager email", action: "verify your email", lifetime: 24 * 60 * 60 * 1000,
    });
    return response.status(201).json({ message: "Manager account created. Verify your email before signing in.", devLink });
  } catch (error) {
    if (error.code?.startsWith("SQLITE_CONSTRAINT")) {
      return response.status(409).json({ message: "That email is already registered, or manager setup has already been completed." });
    }
    return next(error);
  }
});

app.post("/api/auth/register", authLimiter, async (request, response, next) => {
  const { name, email, password } = request.body || {};
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 80 || !validEmail(email) || !validPassword(password)) {
    return response.status(400).json({ message: "Enter a name, valid email, and password of at least 8 characters." });
  }

  try {
    const worker = {
      id: randomUUID(), name: name.trim(), email: email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(password, 12), createdAt: new Date().toISOString(),
    };
    db.prepare("INSERT INTO users (id, name, email, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, 'worker', 'pending', ?)")
      .run(worker.id, worker.name, worker.email, worker.passwordHash, worker.createdAt);
    const devLink = await emailAction({
      user: worker, purpose: "verify-email", subject: "Verify your Sam Barbing Hub email",
      heading: "Verify your email", action: "verify your email", lifetime: 24 * 60 * 60 * 1000,
    });
    return response.status(201).json({ message: "Account created. Verify your email, then wait for manager approval.", devLink });
  } catch (error) {
    if (error.code?.startsWith("SQLITE_CONSTRAINT")) {
      return response.status(409).json({ message: "An account with this email already exists." });
    }
    return next(error);
  }
});

app.post("/api/auth/verify-email", authLimiter, (request, response) => {
  const { token } = request.body || {};
  if (typeof token !== "string" || token.length > 200) return response.status(400).json({ message: "This verification link is invalid or expired." });
  const verify = db.transaction(() => {
    const authToken = db.prepare("SELECT user_id FROM auth_tokens WHERE token_hash = ? AND purpose = 'verify-email' AND expires_at > ?")
      .get(hashToken(token), Date.now());
    if (!authToken) return null;
    db.prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?")
      .run(new Date().toISOString(), authToken.user_id);
    db.prepare("DELETE FROM auth_tokens WHERE token_hash = ?").run(hashToken(token));
    return findUser.get(authToken.user_id);
  });
  const user = verify();
  if (!user) return response.status(400).json({ message: "This verification link is invalid or expired." });
  return response.json({ message: user.role === "worker"
    ? "Email verified. Your manager must approve the account before you can sign in."
    : "Email verified. You can now sign in as manager." });
});

app.post("/api/auth/resend-verification", authLimiter, async (request, response, next) => {
  const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
  const genericMessage = "If the account needs verification, a new link has been sent.";
  const user = validEmail(email) ? db.prepare("SELECT * FROM users WHERE email = ? AND email_verified_at IS NULL").get(email) : null;
  if (!user) return response.json({ message: genericMessage });
  try {
    const devLink = await emailAction({
      user, purpose: "verify-email", subject: "Your Sam Barbing Hub verification link",
      heading: "Verify your email", action: "verify your email", lifetime: 24 * 60 * 60 * 1000,
    });
    return response.json({ message: genericMessage, devLink });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/auth/forgot-password", authLimiter, async (request, response, next) => {
  const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
  const genericMessage = "If an account exists for that email, a password reset link has been sent.";
  const user = validEmail(email) ? db.prepare("SELECT * FROM users WHERE email = ?").get(email) : null;
  if (!user) return response.json({ message: genericMessage });
  try {
    const devLink = await emailAction({
      user, purpose: "reset-password", subject: "Reset your Sam Barbing Hub password",
      heading: "Reset your password", action: "reset your password", lifetime: 60 * 60 * 1000,
    });
    return response.json({ message: genericMessage, devLink });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/auth/reset-password", authLimiter, async (request, response, next) => {
  const { token, password } = request.body || {};
  if (typeof token !== "string" || token.length > 200 || !validPassword(password)) {
    return response.status(400).json({ message: "Use a valid reset link and a password of at least 8 characters." });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const reset = db.transaction(() => {
      const authToken = db.prepare("SELECT user_id FROM auth_tokens WHERE token_hash = ? AND purpose = 'reset-password' AND expires_at > ?")
        .get(hashToken(token), Date.now());
      if (!authToken) return null;
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, authToken.user_id);
      db.prepare("DELETE FROM auth_tokens WHERE user_id = ?").run(authToken.user_id);
      return authToken.user_id;
    });
    const userId = reset();
    if (!userId) return response.status(400).json({ message: "This password-reset link is invalid or expired." });
    deleteSessionsForUser(userId);
    return response.json({ message: "Password reset successfully. Sign in with your new password." });
  } catch (error) {
    return next(error);
  }
});

app.patch("/api/account/email", authLimiter, requireAuth, async (request, response, next) => {
  const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
  const { password } = request.body || {};
  if (!validEmail(email) || typeof password !== "string") {
    return response.status(400).json({ message: "Enter a valid email and your current password." });
  }
  if (email === request.user.email.toLowerCase()) return response.status(400).json({ message: "That is already your current email address." });

  try {
    const passwordMatches = await bcrypt.compare(password, request.user.password_hash);
    if (!passwordMatches) return response.status(400).json({ message: "Current password is incorrect." });
    if (db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, request.user.id)) {
      return response.status(409).json({ message: "An account with that email already exists." });
    }
    const token = createEmailChangeToken(request.user.id, email);
    const devLink = await emailAction({
      user: { ...request.user, email }, token, purpose: "change-email",
      subject: "Confirm your new Sam Barbing Hub email",
      heading: "Confirm your new email", action: "confirm this email address", lifetime: 30 * 60 * 1000,
    });
    return response.json({ message: "We sent a confirmation link to your new email address. Your current email remains active until you confirm it.", devLink });
  } catch (error) {
    if (error.code?.startsWith("SQLITE_CONSTRAINT")) {
      return response.status(409).json({ message: "That email address is already pending for another account." });
    }
    return next(error);
  }
});

app.post("/api/auth/confirm-email-change", authLimiter, (request, response) => {
  const { token } = request.body || {};
  if (typeof token !== "string" || token.length > 200) return response.status(400).json({ message: "This email-change link is invalid or expired." });
  const confirm = db.transaction(() => {
    const pending = db.prepare("SELECT user_id, target_email FROM email_change_tokens WHERE token_hash = ? AND expires_at > ?")
      .get(hashToken(token), Date.now());
    if (!pending) return null;
    db.prepare("UPDATE users SET email = ?, email_verified_at = ? WHERE id = ?")
      .run(pending.target_email, new Date().toISOString(), pending.user_id);
    db.prepare("DELETE FROM email_change_tokens WHERE user_id = ?").run(pending.user_id);
    db.prepare("DELETE FROM auth_tokens WHERE user_id = ?").run(pending.user_id);
    return pending.user_id;
  });
  try {
    const userId = confirm();
    if (!userId) return response.status(400).json({ message: "This email-change link is invalid or expired." });
    deleteSessionsForUser(userId);
    return response.json({ message: "Email updated and verified. Sign in with your new address." });
  } catch (error) {
    if (error.code?.startsWith("SQLITE_CONSTRAINT")) {
      return response.status(409).json({ message: "That email address is already registered." });
    }
    throw error;
  }
});

app.post("/api/auth/login", authLimiter, async (request, response, next) => {
  const { email, password, role } = request.body || {};
  if (!validEmail(email) || typeof password !== "string" || !["admin", "worker"].includes(role)) {
    return response.status(400).json({ message: "Enter a valid email, password, and account type." });
  }

  try {
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase());
    const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!user || user.role !== role || !passwordMatches) {
      return response.status(401).json({ message: "The email or password is incorrect." });
    }
    if (!user.email_verified_at) return response.status(403).json({ code: "EMAIL_NOT_VERIFIED", message: "Verify your email before signing in." });
    if (user.status === "pending") return response.status(403).json({ code: "PENDING", message: "Your account is waiting for manager approval." });
    if (user.status === "disabled") return response.status(403).json({ code: "DISABLED", message: "This account is disabled. Contact the manager." });
    await beginSession(request, user);
    return response.json({ user: toPublicUser(user) });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/auth/session", (request, response) => {
  if (!request.session.userId) return response.json({ user: null });
  return requireAuth(request, response, () => response.json({ user: toPublicUser(request.user) }));
});

app.post("/api/auth/logout", (request, response, next) => {
  request.session.destroy((error) => {
    if (error) return next(error);
    response.clearCookie("sam_hub_session", { httpOnly: true, sameSite: "strict", secure: isProduction });
    return response.status(204).end();
  });
});

app.get("/api/notifications", requireAuth, (request, response) => {
  if (request.user.role !== "worker") return response.status(403).json({ message: "Worker access is required." });
  const notifications = db.prepare("SELECT id, record_id, kind, message, created_at, read_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50")
    .all(request.user.id).map((item) => ({
      id: item.id, recordId: item.record_id, kind: item.kind, message: item.message,
      createdAt: item.created_at, readAt: item.read_at,
    }));
  return response.json({ notifications });
});

app.patch("/api/notifications/:id/read", requireAuth, (request, response) => {
  if (request.user.role !== "worker") return response.status(403).json({ message: "Worker access is required." });
  db.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?")
    .run(new Date().toISOString(), request.params.id, request.user.id);
  return response.json({ ok: true });
});

app.get("/api/records", requireAuth, (request, response) => {
  const rows = request.user.role === "admin"
    ? db.prepare("SELECT records.*, users.name AS user FROM records JOIN users ON users.id = records.user_id ORDER BY records.created_at DESC").all()
    : db.prepare("SELECT records.*, users.name AS user FROM records JOIN users ON users.id = records.user_id WHERE records.user_id = ? ORDER BY records.created_at DESC").all(request.user.id);
  response.json({ records: rows.map(toPublicRecord) });
});

app.post("/api/records", requireAuth, (request, response, next) => {
  const { service, amount, type, expenditureDescription = "" } = request.body || {};
  const expenditureAmount = Number(request.body?.expenditureAmount || 0);
  const allowedType = request.user.role === "worker" ? type === "income" : type === "expense";
  if (typeof service !== "string" || service.trim().length < 2 || service.trim().length > 120 || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || Number(amount) > 1_000_000_000 || !Number.isFinite(expenditureAmount) || expenditureAmount < 0 || expenditureAmount > 1_000_000_000 || typeof expenditureDescription !== "string" || expenditureDescription.length > 120 || (type === "expense" && expenditureAmount > 0) || !allowedType) {
    return response.status(400).json({ message: "Enter a valid description and amount." });
  }

  try {
    const insert = db.prepare("INSERT INTO records (id, service, amount, type, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)");
    const createdAt = new Date().toISOString();
    const records = db.transaction(() => {
      const added = [];
      const record = {
        id: randomUUID(), service: service.trim(), amount: Number(amount), type,
        userId: request.user.id, user: request.user.name, createdAt,
      };
      insert.run(record.id, record.service, record.amount, record.type, record.userId, record.createdAt);
      added.push(record);
      if (request.user.role === "worker" && expenditureAmount > 0) {
        const expense = {
          id: randomUUID(),
          service: expenditureDescription.trim() || `Expenses for ${record.service}`,
          amount: expenditureAmount,
          type: "expense",
          userId: request.user.id,
          user: request.user.name,
          createdAt,
        };
        insert.run(expense.id, expense.service, expense.amount, expense.type, expense.userId, expense.createdAt);
        added.push(expense);
      }
      return added;
    })();
    return response.status(201).json({ record: records[0], records });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/admin/workers", requireAuth, requireAdmin, (_request, response) => {
  const workers = db.prepare("SELECT id, name, email, status, created_at FROM users WHERE role = 'worker' ORDER BY created_at DESC")
    .all().map((worker) => ({ id: worker.id, name: worker.name, email: worker.email, status: worker.status, createdAt: worker.created_at }));
  response.json({ workers });
});

app.patch("/api/admin/records/:id/reaction", requireAuth, requireAdmin, (request, response) => {
  const { reaction } = request.body || {};
  if (reaction !== null && reaction !== "like") return response.status(400).json({ message: "Choose a supported reaction." });
  const record = db.prepare("SELECT id, user_id, service, type FROM records WHERE id = ?").get(request.params.id);
  if (!record || record.type !== "income") return response.status(404).json({ message: "Service record not found." });
  const reactedAt = reaction ? new Date().toISOString() : null;
  const saveReaction = db.transaction(() => {
    db.prepare("UPDATE records SET reaction = ?, reacted_at = ? WHERE id = ?").run(reaction, reactedAt, record.id);
    if (reaction) {
      db.prepare("INSERT INTO notifications (id, user_id, record_id, kind, message, created_at) VALUES (?, ?, ?, 'record-reaction', ?, ?)")
        .run(randomUUID(), record.user_id, record.id, `Manager reacted to your service: ${record.service}`, reactedAt);
    }
  });
  saveReaction();
  return response.json({ reaction, reactedAt });
});

app.patch("/api/admin/workers/:id", requireAuth, requireAdmin, (request, response) => {
  const { status } = request.body || {};
  if (!["approved", "disabled"].includes(status)) return response.status(400).json({ message: "Choose approved or disabled." });
  const result = db.prepare("UPDATE users SET status = ? WHERE id = ? AND role = 'worker'").run(status, request.params.id);
  if (!result.changes) return response.status(404).json({ message: "Worker account not found." });
  if (status === "disabled") deleteSessionsForUser(request.params.id);
  const worker = db.prepare("SELECT id, name, email, status, created_at FROM users WHERE id = ?").get(request.params.id);
  return response.json({ worker: { id: worker.id, name: worker.name, email: worker.email, status: worker.status, createdAt: worker.created_at } });
});

app.patch("/api/account/password", requireAuth, async (request, response, next) => {
  const { currentPassword, nextPassword } = request.body || {};
  if (typeof currentPassword !== "string" || !validPassword(nextPassword)) {
    return response.status(400).json({ message: "Enter your current password and a new password of at least 8 characters." });
  }
  try {
    const matches = await bcrypt.compare(currentPassword, request.user.password_hash);
    if (!matches) return response.status(400).json({ message: "Current password is incorrect." });
    const passwordHash = await bcrypt.hash(nextPassword, 12);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, request.user.id);
    deleteSessionsForUser(request.user.id, request.sessionID);
    return response.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const distDirectory = resolve(currentDirectory, "../dist");
if (isProduction && existsSync(resolve(distDirectory, "index.html"))) {
  app.use(express.static(distDirectory));
  app.use((request, response, next) => {
    if (request.method === "GET" && request.accepts("html") && !request.path.startsWith("/api/")) {
      return response.sendFile(resolve(distDirectory, "index.html"));
    }
    return next();
  });
}

app.use((error, _request, response, next) => {
  console.error(error);
  if (response.headersSent) return next(error);
  response.status(500).json({ message: "An unexpected server error occurred." });
});

app.listen(port, () => {
  console.log(`SAM Barbing Hub API listening on http://localhost:${port}`);
});
