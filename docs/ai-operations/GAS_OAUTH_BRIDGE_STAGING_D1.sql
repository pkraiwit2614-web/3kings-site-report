-- 3 Kings Google OAuth staging bridge; isolated D1 only, NEVER production.
CREATE TABLE IF NOT EXISTS oauth_state (
 state TEXT PRIMARY KEY NOT NULL,
 owner TEXT NOT NULL,
 verifier TEXT NOT NULL,
 expires INTEGER NOT NULL,
 browser_hash TEXT NOT NULL,
 nonce TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_state_expiry ON oauth_state(expires);
CREATE TABLE IF NOT EXISTS oauth_token (
 owner TEXT PRIMARY KEY NOT NULL,
 iv TEXT NOT NULL,
 ciphertext TEXT NOT NULL,
 updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_session (
 session_hash TEXT PRIMARY KEY NOT NULL,
 owner TEXT NOT NULL,
 expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_session_expiry ON oauth_session(expires);
CREATE TABLE IF NOT EXISTS oauth_rate (
 key TEXT PRIMARY KEY NOT NULL,
 hits INTEGER NOT NULL,
 expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_rate_expiry ON oauth_rate(expires);
-- Existing D1 instance created under earlier Access design must run:
-- ALTER TABLE oauth_state ADD COLUMN browser_hash TEXT;
-- ALTER TABLE oauth_state ADD COLUMN nonce TEXT;
-- Then create the new oauth_session/oauth_rate tables above.
-- No OAuth credentials or sessions are stored before owner Google authorization.
