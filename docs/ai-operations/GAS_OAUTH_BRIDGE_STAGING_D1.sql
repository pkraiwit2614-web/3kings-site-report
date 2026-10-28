-- 3 Kings OAuth Bridge: isolated STAGING D1 only. Do not run against Supabase or Production.
CREATE TABLE IF NOT EXISTS oauth_state (
 state TEXT PRIMARY KEY NOT NULL,
 owner TEXT NOT NULL,
 verifier TEXT NOT NULL,
 expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_state_expiry ON oauth_state(expires);
CREATE TABLE IF NOT EXISTS oauth_token (
 owner TEXT PRIMARY KEY NOT NULL,
 iv TEXT NOT NULL,
 ciphertext TEXT NOT NULL,
 updated INTEGER NOT NULL
);
-- Tokens are encrypted using AES-256-GCM by Worker with an independent secret key.
-- DB contents are sensitive despite encryption; keep D1 and encryption key access restricted.
