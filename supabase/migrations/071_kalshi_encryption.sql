-- Migration 071: Encrypted storage for Kalshi private keys
--
-- Adds a dedicated encrypted column for the RSA private key rather than
-- storing it in the opaque JSONB `metadata` field. AES-GCM encryption is
-- performed in the Edge Function using the KALSHI_ENCRYPTION_KEY Supabase
-- secret. The key is NEVER stored in the database.
--
-- pgcrypto is enabled here for potential future server-side use; the
-- current encryption path is Edge Function → WebCrypto → store ciphertext.
--
-- Rollback path:
--   1. Read private_key_enc from the column.
--   2. Decrypt using KALSHI_ENCRYPTION_KEY in the Edge Function.
--   3. Write plaintext back to connections.metadata.private_key.
--   4. Null out private_key_enc.
--   The schema change is additive (nullable column), so the migration
--   itself is always safe to apply.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS private_key_enc TEXT;

COMMENT ON COLUMN public.connections.private_key_enc IS
  'AES-GCM encrypted RSA private key (IV prepended, base64-encoded). '
  'Encryption key stored as KALSHI_ENCRYPTION_KEY Supabase secret — '
  'never in the database. Decrypt in Edge Functions only, never log plaintext.';
