DROP INDEX sessions_active_user;
DROP INDEX sessions_expiry;
DROP TABLE sessions;

CREATE TABLE refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  replaced_by_token_hash TEXT,
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX refresh_tokens_active_user
  ON refresh_tokens(user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX refresh_tokens_family
  ON refresh_tokens(family_id, created_at DESC);

CREATE INDEX refresh_tokens_expiry
  ON refresh_tokens(expires_at)
  WHERE revoked_at IS NULL;
