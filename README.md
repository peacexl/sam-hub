# SAM Barbing Hub

Manager and worker portal for shop records, staff approvals, and daily analytics.

## Requirements

- Node.js 22 or newer
- npm

## Local development

```bash
npm install
npm run dev
```

This starts the Vite frontend at `http://localhost:5173` and the API at `http://localhost:3001`. The Vite server proxies `/api` requests to the API. SQLite creates `data/sam-hub.sqlite` automatically on first startup.

The first manager account is created with **Switch to admin**. The database allows only one admin account. Workers can sign up from the first screen; the manager must approve each account before its owner can sign in.

New manager and worker accounts must verify their email before signing in. In local development, when SMTP is not configured, the API prints verification, email-change, and password-reset links in the server terminal and shows a local link in the UI. Password reset is available from **Forgot password?** on the sign-in page.

## Production

Set a private session secret and a persistent database path in the deployment environment before starting the server:

```text
NODE_ENV=production
SESSION_SECRET=<long-random-secret>
DATABASE_PATH=/path/to/persistent-storage/sam-hub.sqlite
PORT=3001
APP_BASE_URL=https://your-site.example
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<your-gmail-address>
SMTP_PASS=<google-app-password>
SMTP_FROM="SAM Barbing Hub <your-gmail-address>"
```

Create a strong secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Then build and start the combined app:

```bash
npm run build
npm start
```

The production server serves the built frontend and the API from the same origin. SMTP settings and the public site URL are required in production so verification and reset links can be sent. Deploy behind HTTPS and ensure the SQLite path is on persistent storage with regular backups. Do not commit `.env` files or the `data/` directory.

For Gmail, enable 2-Step Verification on the sending account and create an App Password. Put that App Password in `SMTP_PASS`; do not use the normal Gmail password. Copy `.env.example` to `.env`, set the Gmail account values and `APP_BASE_URL=http://localhost:5173` for local testing, then restart `npm run dev`. Never commit `.env` or share the app password.

## API overview

- `GET /api/health` reports API availability.
- `GET /api/auth/status` reports whether manager setup is complete.
- `POST /api/auth/setup-admin` creates the one manager account.
- `POST /api/auth/register` creates a pending worker account.
- `POST /api/auth/verify-email` verifies a one-time email token.
- `POST /api/auth/resend-verification` resends a verification link.
- `POST /api/auth/forgot-password` requests a reset email.
- `POST /api/auth/reset-password` consumes a one-time password reset token.
- `PATCH /api/account/email` requests a new address; it is applied only after the new address is verified.
- `PATCH /api/account/password` changes the authenticated user's password.
- `POST /api/auth/login`, `GET /api/auth/session`, and `POST /api/auth/logout` manage sign-in.
- `GET /api/records` returns all records to the manager and only the current worker's records to a worker.
- `POST /api/records` adds a service or manager-only expense.
- `GET /api/admin/workers` and `PATCH /api/admin/workers/:id` manage worker approval and access.
- `PATCH /api/admin/records/:id/reaction` reacts to a worker service record.
- `GET /api/notifications` and `PATCH /api/notifications/:id/read` deliver and acknowledge worker notifications.

Passwords are hashed with bcrypt. Authentication uses HTTP-only, same-site cookies and SQLite-backed sessions. Email tokens are stored as SHA-256 hashes, expire, and can be used once. Password reset, verification, and email-change delivery require valid Gmail SMTP configuration in production. Multi-factor authentication is not currently included.
