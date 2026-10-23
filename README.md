# SAM Barbing Hub

An accounting dashboard for a salon, with manager and worker portals for shop records, staff approvals, and daily analytics.

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

New manager and worker accounts must verify their email before signing in. Verification uses an 8-digit code that expires after 15 minutes; local development prints the code in the API terminal and shows it in the signup UI when SMTP is not configured. Password reset and email changes continue to use secure links. Sign-in sessions are limited to the browser session unless **Remember me** is selected, which keeps the login active for up to 30 days.

In account settings, users can review their signup details and see devices with activity in the last five minutes. Device sessions refresh while the app is open and can be signed out individually.

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

The production server serves the built frontend and the API from the same origin. SMTP settings and the public site URL are required in production so verification codes and reset links can be sent. Deploy behind HTTPS and ensure the SQLite path is on persistent storage with regular backups. Do not commit `.env` files or the `data/` directory.

For Gmail, enable 2-Step Verification on the sending account and create an App Password. Put that App Password in `SMTP_PASS`; do not use the normal Gmail password. Copy `.env.example` to `.env`, set the Gmail account values and `APP_BASE_URL=http://localhost:5173` for local testing, then restart `npm run dev`. Never commit `.env` or share the app password.

## PHP + MySQL deployment (InfinityFree-friendly)

InfinityFree's free hosting supports PHP and MySQL but not a running Node.js/Express process. The project now includes a PHP version of the API in the `api/` folder, plus an Apache rewrite rule in `.htaccess` so `/api/...` requests can be routed to the PHP backend while the built frontend still serves from the same site.

1. Create a MySQL database in your hosting panel.
2. Import [api/schema.sql](api/schema.sql) into that database.
3. Set the database credentials and public URL in [api/config.php](api/config.php). The PHP API creates the device-session and rate-limit tables from [api/schema.sql](api/schema.sql).
4. Create an account with an SMTP email provider (for example, Brevo or Gmail), verify the sender address/domain, and get the provider's SMTP host, port, username, and password/key. SMTP is the authenticated connection the app uses to hand verification and password-reset emails to that provider for delivery.
5. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_ENCRYPTION`, `SMTP_USER`, `SMTP_PASS`, `APP_EMAIL_FROM`, and optionally `SMTP_FROM_NAME` in the PHP environment. Use the exact SMTP credentials from your provider, not your normal email password. If the host does not provide environment variables, set these values privately in `api/config.php` and do not commit or share that file.
6. For a typical STARTTLS provider, the values look like `SMTP_HOST=smtp.example.com`, `SMTP_PORT=587`, and `SMTP_ENCRYPTION=tls`; use the provider's own instructions if it specifies implicit TLS (usually port 465 with `SMTP_ENCRYPTION=ssl`). The sender in `APP_EMAIL_FROM` must be verified with the provider.
7. Upload the build folder contents or your frontend files to the root directory and keep the `api/` folder in place.
8. Make sure the PHP host allows URL rewriting so `/api/*` flows through `api/index.php`.

The PHP API sends verification, email-change, and password-reset messages over authenticated, TLS-encrypted SMTP; it does not rely on PHP's `mail()`. Test account registration and password reset after setup. Some shared-hosting plans restrict outgoing SMTP connections, so confirm that your plan can reach the provider's SMTP host and port; if the connection is blocked, ask the host or provider about an allowed relay/port before deploying. Keep SMTP credentials private, and never use your email account's normal password where the provider offers a dedicated SMTP key or app password.

For Gmail, use `smtp.gmail.com`, port `587`, encryption `tls`, your Gmail address as the SMTP username, and a Google App Password as the SMTP password. For any provider, follow its dashboard instructions for sender verification and DNS authentication (SPF/DKIM) when using a custom domain.

This keeps the manager/worker login flow, worker approval flow, record tracking, email verification, and password reset logic aligned with the same routes the React app uses.

## API overview

- `GET /api/health` reports API availability.
- `GET /api/auth/status` reports whether manager setup is complete.
- `POST /api/auth/setup-admin` creates the one manager account.
- `POST /api/auth/register` creates a pending worker account.
- `POST /api/auth/verify-email` verifies a one-time 8-digit email code.
- `POST /api/auth/resend-verification` resends a verification code.
- `POST /api/auth/forgot-password` requests a reset email.
- `POST /api/auth/reset-password` consumes a one-time password reset token.
- `PATCH /api/account/email` requests a new address; it is applied only after the new address is verified.
- `PATCH /api/account/password` changes the authenticated user's password.
- `POST /api/auth/login`, `GET /api/auth/session`, and `POST /api/auth/logout` manage sign-in.
- `GET /api/account/sessions`, `POST /api/account/session/heartbeat`, and `DELETE /api/account/sessions/:id` list, refresh, and revoke device sessions.
- `GET /api/records` returns all records to the manager and only the current worker's records to a worker.
- `POST /api/records` adds a service record without creating an expenditure.
- `POST /api/expenditures` records a separate expenditure entry in the shared history.
- `GET /api/admin/workers` and `PATCH /api/admin/workers/:id` manage worker approval and access.
- `PATCH /api/admin/records/:id/reaction` reacts to a worker service record.
- `GET /api/notifications` and `PATCH /api/notifications/:id/read` deliver and acknowledge worker notifications.

Passwords are hashed with bcrypt. Authentication uses HTTP-only, same-site cookies and SQLite-backed sessions. Email tokens and verification codes are stored as SHA-256 hashes, expire, and can be used once. Password reset, verification, and email-change delivery require valid SMTP configuration in production. Multi-factor authentication is not currently included.
