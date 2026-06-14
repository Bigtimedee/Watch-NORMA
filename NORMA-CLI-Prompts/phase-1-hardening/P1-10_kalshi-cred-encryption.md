# P1-10 — Column-level encryption for Kalshi credentials (pgcrypto)

> Copy everything below the line into the Claude CLI as a single prompt.

---

You are working in the Watch-NORMA repository. Read `docs/watch-norma-context/README.md`, then
`07_SECURITY_PRIVACY_AND_RISK.md`, `04_DATA_AND_INTEGRATIONS.md` (Kalshi), and
`10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md` (rules #9, #16). Inspect `_shared/kalshi-crypto.ts`,
`kalshi-proxy/`, `poll-markets/`, and how `connections.metadata` stores the Kalshi API key ID + RSA
private key before editing.

## Objective
Kalshi RSA private keys live in `connections.metadata` protected only by RLS. Doc 09 and the CLAUDE.md
plan call for `pgcrypto` column-level encryption. Add encryption-at-rest for these high-sensitivity
secrets.

## Why it matters
An RSA private key is the highest-sensitivity user data in the system — it grants account access. RLS
protects against cross-user reads but not against a leaked service-role key or a DB-level exposure.
Defense-in-depth here is table stakes before NORMA handles any partner OAuth tokens (P2-08).

## Scope
- Enable `pgcrypto` and add an additive migration (prefix **067**) introducing encrypted storage for
  the Kalshi key material (e.g. a `connections_secrets` table or encrypted columns), with a documented
  key-management approach: encryption key sourced from a Supabase secret, NEVER stored in the DB or logs.
- Update `kalshi-proxy` and `poll-markets` to decrypt at use-time only, in-memory, never logging
  plaintext. Migrate existing rows in the same migration (read RLS-protected plaintext → write encrypted
  → null out plaintext) — but verify there is a tested rollback path.
- Add a test proving: stored ciphertext is not equal to plaintext; decrypt round-trips; no plaintext in
  any log line.

## Acceptance criteria
- New connections store encrypted key material; existing rows migrated.
- `kalshi-proxy` still authenticates successfully (RSA-PSS signing unchanged functionally).
- No plaintext secret in logs or API responses (test enforced).
- Docs 04 and 07 updated; security model section reflects encryption-at-rest.

## Commands to run before you finish
```
deno check supabase/functions/kalshi-proxy/index.ts
deno test --allow-env --allow-net=none supabase/functions/
```

## Non-negotiables to respect
Read doc 10 rules #9, #16. Never log secrets. Never return key material in responses. Additive
migration only (067); preserve a rollback path because this touches existing user secrets.

## Closing
Answer the doc-10 closing checklist; document the key-management approach and the migration/rollback plan.
