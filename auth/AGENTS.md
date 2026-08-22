# Identity Service Guidance

This module owns accounts, credentials, email verification, sign-in codes, and browser sessions.

## Where things are

- `src/index.ts`: Express startup and route registration.
- `src/routes/`: signup, verification, sign-in, sign-out, and current-user routes.
- `src/auth-repo.ts`: route-facing authentication and persistence functions.
- `src/database.ts`: SQLite connection and migration runner.
- `src/email.ts`: Nodemailer SMTP delivery.
- `migrations/`: numbered, forward-only SQL migrations.

## Current flow

1. `/signup` creates an unverified user and emails a verification code.
2. `/verify-email` verifies the code and creates a session.
3. `/signin` checks the password and emails a second sign-in code.
4. `/signin/code` verifies that code and creates a session.
5. `/signout` revokes the session; `/current-user` resolves it.

Passwords and email codes use `scrypt`. Session cookies contain random opaque tokens; SQLite stores only their SHA-256 hashes.

## SQLite rules

- Identity alone owns its SQLite database.
- Use one long-lived connection with WAL and a busy timeout; do not add a pool.
- Add schema changes as `NNN_name.sql`, for example `002_add_password_reset.sql`.
- Never edit or delete an applied migration. Add a new corrective migration.
- Applied versions and checksums are stored in `schema_migrations`.

## Local commands

```text
npm run build --workspace @stubhub/identity
npm run migrate --workspace @stubhub/identity
npm run dev:identity
```

Mailpit receives local email on SMTP port `1025`; its inbox is forwarded to `http://localhost:8025` by Skaffold.

## Guardrails

- Never log or return passwords, email codes, or raw session tokens.
- Keep generic invalid-credential responses.
- Do not share the Identity database with Tickets or Orders.
- Current gaps: durable email outbox, IP rate limiting, password reset, and TOTP.
- Do not add automated tests unless the user explicitly requests them; use focused builds and manual auth journeys.
