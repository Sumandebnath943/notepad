# AEGIS VAULT — Project Bible

The canonical, single-source-of-truth reference for the project: the vision, the
architecture, the security model, every major decision and why it was made, and
the roadmap. If two documents disagree, this one wins.

- **Repo:** https://github.com/Sumandebnath943/notepad
- **Status:** deployed (Vercel + Supabase)
- **Related docs:** [`HANDOFF.md`](./HANDOFF.md) (dev onboarding) ·
  [`PORTFOLIO_HANDOFF.md`](./PORTFOLIO_HANDOFF.md) (portfolio page content)

---

## 1. Vision & principles

AEGIS VAULT is a **zero-knowledge encrypted notepad**: a place to keep notes
where the operator of the service — and anyone who breaches it — can never read
your content. The guiding principles (inherited from the original build spec):

1. **All encryption/decryption happens in the browser.** The server only ever
   stores ciphertext.
2. **The master password never leaves the client and is never stored anywhere.**
3. **A full database breach yields nothing usable** without the user's password.
4. **No custom crypto** — only audited, standard primitives.
5. **Defense in depth on the implementation layer** (sessions, XSS, isolation) —
   because that's where real-world breaches happen, not in the cipher itself.

## 2. System architecture

```
┌───────────────────────────── Browser (client) ─────────────────────────────┐
│  React / Next.js UI                                                         │
│  ├─ lib/crypto.ts   Argon2id + AES-256-GCM (Web Crypto / hash-wasm)         │
│  ├─ lib/store.ts    Zustand: DEK held IN MEMORY only, auto-lock lifecycle   │
│  └─ lib/api.ts      fetch() → same-origin /api/*   (never calls Supabase)   │
└───────────────┬─────────────────────────────────────────────────────────────┘
                │  httpOnly session cookie (JS cannot read it)
                ▼
┌───────────────────────── Next.js server (Vercel) ──────────────────────────┐
│  middleware.ts            refreshes the Supabase session cookie             │
│  app/api/**/route.ts      Route Handlers → Supabase server client          │
│  lib/supabase/server.ts   createServerClient (@supabase/ssr), httpOnly      │
└───────────────┬─────────────────────────────────────────────────────────────┘
                │  Supabase JS (server-side), carries the user's JWT
                ▼
┌───────────────────────────────── Supabase ─────────────────────────────────┐
│  Auth (auth.users)        login password, sessions, rate limiting          │
│  Postgres                 user_keys (wrapped DEK) · notes (ciphertext)      │
│  Row-Level Security       auth.uid() = user_id  → DB-enforced isolation     │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key property:** the browser never talks to Supabase directly and never holds
the session token in readable storage. Every data path is
`browser → same-origin Route Handler → Supabase`, with RLS as the final
authorization gate.

## 3. Security model (in depth)

### 3.1 Envelope encryption

```
Master Password ──Argon2id(salt)──▶ Master Key (MK)   [memory only, never stored]
MK ──AES-256-GCM──▶ encrypts/decrypts ──▶ Data Encryption Key (DEK, random 256-bit)
DEK ──AES-256-GCM(unique nonce)──▶ encrypts/decrypts ──▶ each note
```

Only the **wrapped DEK** (DEK encrypted under MK), the **salt**, and the KDF
parameters are stored server-side. The MK and the unwrapped DEK exist only in
browser memory during an unlocked session.

**Why envelope encryption (not "double AES"):**
- Rotating the master password only re-wraps the DEK (one small blob) — notes
  never need re-encryption.
- Notes are protected by a full-entropy random key (the DEK) regardless of how
  strong the user's password is.
- It's the honest, standard way to have "multiple keys" (same as Bitwarden/KMS).

### 3.2 Primitives

| Purpose | Algorithm | Library |
|---|---|---|
| Key derivation | Argon2id — 64 MB memory, 3 iterations, unique 16-byte salt | `hash-wasm` |
| Symmetric encryption | AES-256-GCM (authenticated, tamper-evident) | Web Crypto (`crypto.subtle`) |
| Randomness (salt, nonce, DEK) | CSPRNG | `crypto.getRandomValues` |

- Keys are imported as **non-extractable** `CryptoKey`s.
- Each note is a single AEAD operation over `JSON.stringify({ title, body })`
  with a **unique 12-byte nonce**, binding title+body and avoiding nonce reuse.
- Raw key bytes are zeroed (`.fill(0)`) immediately after use.

### 3.3 Two-password model

- **Login password** — handled by **Supabase Auth**; establishes the session.
  This is what rate limiting, (optional) MFA, and password reset act on.
- **Master password** — never sent to the server; derives the Master Key that
  unwraps the DEK. This is what actually decrypts notes.

Keeping them separate means standard account features never touch the encryption
key. The UI enforces that the two passwords are different.

### 3.4 Session security

- Supabase Auth session tokens are stored in an **httpOnly, SameSite=Lax,
  Secure** cookie via `@supabase/ssr`. Page scripts cannot read the token, so an
  XSS cannot exfiltrate it.
- All Supabase access is **server-mediated** (Route Handlers + middleware); the
  browser only calls same-origin `/api/*`.
- `middleware.ts` refreshes the session on each request so short-lived access
  tokens don't log users out.

### 3.5 Isolation (Row-Level Security)

Postgres RLS policies (`auth.uid() = user_id`, `USING` + `WITH CHECK`) on both
tables mean the database itself refuses any cross-user read or write — even a
buggy query cannot leak another user's rows. This is stronger than
application-level `where userId` filtering.

### 3.6 Threat model — what is and isn't protected

**Protected against:**
- Full database breach → only ciphertext + wrapped keys; unreadable.
- Malicious/curious server operator → never sees plaintext, MK, or DEK.
- Cross-user access → blocked by RLS.
- Session token theft via XSS → blocked by httpOnly cookie.
- Note tampering → detected by AES-GCM authentication.
- Clickjacking → `X-Frame-Options` / `frame-ancestors`.

**NOT protected against (by design / inherent):**
- A compromised device (keylogger, malware) — no client-side crypto can fix this.
- A forgotten master password — notes are **unrecoverable** (that's zero-
  knowledge; there is no recovery backdoor).
- A weak master password — mitigated by Argon2id cost + the enforced policy, but
  the user's password remains the ultimate strength ceiling.

## 4. Data model

**`user_keys`** — one row per user (envelope key material):

| Column | Type | Meaning |
|---|---|---|
| `user_id` | uuid PK → `auth.users` | owner |
| `kdf_salt` | text | base64 Argon2id salt |
| `encrypted_dek` | text | base64 DEK wrapped with the Master Key |
| `dek_nonce` | text | base64 nonce for the DEK wrapping |
| `kdf_ops_limit` | int | Argon2id iterations at creation |
| `kdf_mem_limit` | int | Argon2id memory (KiB) at creation |
| `created_at` / `updated_at` | timestamptz | timestamps (trigger-maintained) |

**`notes`** — ciphertext only:

| Column | Type | Meaning |
|---|---|---|
| `id` | uuid PK | note id |
| `user_id` | uuid → `auth.users` | owner |
| `ciphertext` | text | base64 AES-256-GCM ciphertext of `{title, body}` |
| `nonce` | text | base64 unique 12-byte nonce |
| `created_at` / `updated_at` | timestamptz | timestamps (trigger-maintained) |

Both tables: RLS enabled, `"own keys only"` / `"own notes only"` policies,
`updated_at` maintained by a `set_updated_at()` trigger. Full DDL:
`supabase/migrations/0001_init.sql`.

## 5. Application flows

**Sign-up** (`/api/auth/signup`): browser derives MK from master password +
random salt → generates random DEK → wraps DEK with MK → `supabase.auth.signUp`
(login password) → inserts `user_keys` row (ciphertext/salt only). Requires an
active session, so **email confirmation must be off**.

**Login + unlock:** `supabase.auth.signInWithPassword` establishes the session →
browser fetches `user_keys` → re-derives MK from master password + stored salt →
unwraps DEK (a wrong password fails the AES-GCM auth tag) → DEK held in memory.

**Save a note:** encrypt `{title, body}` with the DEK + fresh nonce → POST/PUT
ciphertext to `/api/notes`. Plaintext never sent.

**Auto-lock:** the DEK is dropped from memory after N minutes idle, ~30s of the
tab being hidden, on `beforeunload`, or on explicit lock/logout. Re-entry of the
master password is required to resume.

**Password rotation:** re-derive MK (old), unwrap DEK, re-wrap the **same** DEK
under a new MK (new salt), PUT to `/api/keys`. Notes are untouched.

## 6. Frontend architecture

- **`lib/store.ts` (Zustand):** the single owner of session/crypto state. Holds
  `status` (`loading` → `unauthenticated` → `authenticated-locked` → `unlocked`),
  the `user`, key material, the in-memory `dek`, decrypted `notes`, and the
  auto-lock timer. Security invariant: the DEK lives *only* here, in memory.
- **`components/secure-notepad/`:** `secure-notepad.tsx` (router by status),
  `auth-screen.tsx` (login / create-vault + password policy checklist),
  `unlock-screen.tsx`, `notes-app.tsx` (editor + sidebar + settings),
  `lock-gate.tsx` (activity/visibility listeners driving auto-lock).
- **`lib/api.ts`:** thin same-origin fetch client; the only thing the store talks
  to. Swapping this out is how the backend was migrated without touching UI.
- **`lib/crypto.ts`:** all cryptography + the master-password policy
  (`checkMasterPassword`, `masterPasswordMeetsPolicy`) and entropy estimate.

## 7. Security hardening checklist (implemented)

- Zero-knowledge client-side crypto; server stores only ciphertext.
- httpOnly / SameSite / Secure session cookies; server-mediated auth.
- Postgres RLS for per-user isolation.
- Master-password policy: **≥16 chars + lower + upper + number + symbol**,
  enforced via a live checklist that gates vault creation.
- Server-enforced Argon2id floor (64 MB / 3 iters) on signup and rotation.
- Security headers (`next.config.ts`): CSP, HSTS (2 yr, preload),
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`,
  `X-Frame-Options: SAMEORIGIN`, `connect-src 'self'`.
- Login-password ≠ master-password enforced.
- Undecryptable/tampered notes degrade gracefully instead of crashing.

## 8. Design decisions & trade-offs (ADR-style)

| # | Decision | Why | Trade-off accepted |
|---|---|---|---|
| 1 | Envelope encryption (MK→DEK→notes) | Password rotation without re-encrypting notes; full-entropy note key | Slightly more moving parts than single-key |
| 2 | Argon2id 64 MB / 3 iters | Strong, memory-hard KDF; expensive brute force | Slower unlock on weak devices |
| 3 | Two separate passwords | Account features never touch the encryption key | Users must remember two secrets |
| 4 | SQLite/Prisma → **Supabase** | SQLite can't run on serverless; managed Postgres + backups + RLS | Third-party dependency / vendor coupling |
| 5 | **Server-mediated** auth (not browser Supabase client) | httpOnly session cookie → XSS can't steal the token | More server code (Route Handlers + middleware) |
| 6 | RLS for isolation | DB-enforced, not app-enforced | Requires the migration to be run correctly |
| 7 | Enforce email-confirmation OFF | Signup needs an immediate session to write key material under RLS | Loses email verification (documented) |
| 8 | Hard master-password policy | Password strength is the real weak point; no recovery exists | Stricter than NIST's "length-first" guidance |
| 9 | Plain textarea editor | Simple, no XSS surface from note rendering | No rich text / syntax highlighting (yet) |

## 9. Evolution / history

1. **Spec** — a zero-knowledge notepad targeting Supabase + Vercel.
2. **Base build** — implemented the crypto correctly but on **SQLite + Prisma**
   with hand-rolled JWT/bcrypt auth.
3. **Hardening pass** — production `SESSION_SECRET` guard, server-side KDF floor,
   entropy gate, env-aware CSP framing, README, secrets hygiene.
4. **Supabase migration** — moved to Supabase Auth + Postgres + RLS.
5. **httpOnly hardening** — re-architected to server-mediated `@supabase/ssr`
   with httpOnly session cookies (removed the last XSS session-theft gap).
6. **UX/polish** — auth-screen scroll + hero fixes, strong master-password
   policy with live checklist, wider editor, opaque dialogs, Windows-friendly
   `dev` script.
7. **Deploy** — Vercel (app) + Supabase (data).

## 10. Limitations & roadmap

**Current limitations**
- `typescript.ignoreBuildErrors: true` — should be flipped to `false`.
- CSP allows `'unsafe-inline'` for scripts (no nonce yet).
- `middleware.ts` uses the deprecated convention (rename to `proxy.ts` for Next 16).
- No MFA / password reset (Supabase supports both).
- No rich-text or code editor.

**Possible roadmap**
- Nonce-based CSP; flip `ignoreBuildErrors`.
- MFA via Supabase Auth.
- Markdown editor or CodeMirror (syntax highlighting) for the note body.
- Optional recovery mechanism (with an explicit zero-knowledge trade-off).
- Secure note sharing (per-note key wrapping to a recipient).
- Export / import of an encrypted vault backup.

## 11. Configuration reference

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | anon/public key (safe to expose; RLS protects data) |
| `ALLOW_IFRAME_EMBED` | no | `1` permits cross-origin iframe embedding; unset = clickjacking protection on |

The Supabase **service_role** key is never used and must never be exposed client-side.

## 12. Glossary

- **Zero-knowledge:** the server has no knowledge of your plaintext or keys.
- **Master Key (MK):** derived from the master password via Argon2id; wraps the DEK.
- **DEK (Data Encryption Key):** random 256-bit key that encrypts notes; stored
  only in wrapped (encrypted) form.
- **Envelope encryption:** encrypting a data key with a key-encryption key.
- **KDF:** key derivation function (Argon2id here) — turns a password into a key,
  slowly and memory-hard, to resist brute force.
- **AEAD / AES-GCM:** authenticated encryption — provides confidentiality *and*
  tamper detection.
- **Nonce:** a number used once per encryption; must be unique per key.
- **RLS (Row-Level Security):** Postgres feature that filters rows per user at the
  database level.
- **httpOnly cookie:** a cookie JavaScript cannot read, mitigating token theft
  via XSS.
