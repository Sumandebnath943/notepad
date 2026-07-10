# AEGIS VAULT — Zero-Knowledge Encrypted Notepad (Supabase)

A secure notepad where **all encryption and decryption happen in your browser**.
The backend (Supabase) only ever stores ciphertext — a full database breach
yields nothing usable without your master password.

Built with Next.js (App Router) + React, **Supabase (Auth + Postgres + RLS)**,
and the Web Crypto API.

---

## Security model

Envelope encryption — the same pattern Bitwarden and AWS KMS use:

```
Master Password
   │  Argon2id(password, unique salt)  →  256-bit Master Key (MK)   (never leaves the browser)
   ▼
Master Key encrypts  →  Data Encryption Key (DEK, random 256-bit)   (only the wrapped DEK is stored)
   ▼
DEK encrypts each note  →  AES-256-GCM, unique nonce per note        (Supabase sees only ciphertext)
```

- **Zero-knowledge:** the master password and derived keys never leave the
  browser and are never persisted — they live only in memory and are wiped on
  lock/logout/auto-lock. Supabase stores only ciphertext + wrapped key material.
- **Two-password model:** the *login* password (handled by **Supabase Auth**)
  is separate from the *master* password (which derives the encryption key and
  never touches the server).
- **Isolation by Row-Level Security:** every query runs as the logged-in user
  (`auth.uid()`); the RLS policies expose only that user's own rows.
- **Server-mediated auth:** the browser never talks to Supabase directly. It
  calls same-origin Next.js Route Handlers, which hold the Supabase session in
  an **httpOnly cookie** (unreadable by page scripts) and talk to Supabase
  server-side. Even a successful XSS cannot exfiltrate the session token.
- **Primitives only, no custom crypto:** Argon2id (64 MB / 3 iterations) for key
  derivation, AES-256-GCM for authenticated encryption, CSPRNG for randomness.
- **Password rotation** re-wraps the DEK only — notes are never re-encrypted.

> If you forget your master password, your notes are **unrecoverable by design**.

## Multi-device access

Works out of the box. Nothing is stored on the device: on any device you log in
(Supabase Auth) and enter your master password, which re-derives the Master Key
from your server-stored salt, unwraps the DEK, and decrypts your notes. Same
master password → same keys, on your laptop and phone alike.

## Setup

### 1. Create a Supabase project
At [supabase.com](https://supabase.com) → New project.

### 2. Run the database migration
Open **SQL Editor** in the Supabase dashboard and run the contents of
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). This
creates the `user_keys` and `notes` tables and their RLS policies.

### 3. Disable email confirmation (required for this flow)
**Authentication → Providers → Email → turn OFF "Confirm email".**
Sign-up needs an active session immediately so the browser can write your
wrapped key material under RLS; an email round-trip would break that. (You can
keep confirmation on if you also move key setup to first login — not implemented
here.)

### 4. Configure environment
```bash
cp .env.example .env.local
```
Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
**Project Settings → API**. Never add the `service_role` key — this app never
needs it.

### 5. Install & run
```bash
bun install      # installs @supabase/ssr + supabase-js, drops the old Prisma deps
bun run dev      # http://localhost:3000
```

### Production build
```bash
bun run build
bun run start
```
Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in your host's
environment. A `Caddyfile` is included for reverse-proxying the standalone server.

## Security hardening implemented

- Isolation enforced by Postgres **Row-Level Security** (`auth.uid() = user_id`).
- Server enforces a minimum Argon2id strength (64 MB / 3 iters) at the client;
  see `lib/crypto.ts`.
- Signup gates on estimated password **entropy**, not just length.
- Auth session kept in an **httpOnly cookie** via `@supabase/ssr`; all Supabase
  access is server-side, so page scripts never see the session token.
- Strict security headers: CSP (`connect-src 'self'`), HSTS,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and
  `X-Frame-Options: SAMEORIGIN` (clickjacking protection on by default).

### Known limitations / next steps

- CSP still allows `'unsafe-inline'` for scripts (Next.js needs it without a
  nonce setup). For maximum XSS hardening, migrate to a per-request nonce CSP.
- `typescript.ignoreBuildErrors` is `true` in `next.config.ts` — flip to `false`
  once type issues are resolved so type bugs can't reach crypto/auth paths.
- Supabase Auth provides rate limiting; enable MFA there if desired.

## Tech stack

- **Framework:** Next.js (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Backend:** Supabase — Auth + Postgres + Row-Level Security
- **Crypto:** Web Crypto API (AES-256-GCM) + `hash-wasm` (Argon2id)
- **State:** Zustand

## License

Provided as-is, without warranty. Review and audit before relying on it for
sensitive data.
