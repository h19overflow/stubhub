CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email_verified_at INTEGER,
  failed_signin_attempts INTEGER NOT NULL DEFAULT 0,
  signin_locked_until INTEGER,
  created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX sessions_active_user
  ON sessions(user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX sessions_expiry
  ON sessions(expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE email_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'signin')),
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
) STRICT;

CREATE UNIQUE INDEX email_challenges_one_active
  ON email_challenges(user_id, purpose)
  WHERE used_at IS NULL;

CREATE INDEX email_challenges_active_lookup
  ON email_challenges(user_id, purpose, created_at DESC)
  WHERE used_at IS NULL;

CREATE INDEX email_challenges_expiry
  ON email_challenges(expires_at)
  WHERE used_at IS NULL;
