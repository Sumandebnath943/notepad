# AEGIS VAULT — Zero-Knowledge Encrypted Notepad

A secure notepad where **all encryption and decryption happen in your browser**.
The server only ever stores ciphertext — a full database breach yields nothing
usable without your master password.

Built with Next.js (App Router) + React, Prisma + SQLite, and the Web Crypto API.

---

## Security model

Envelope encryption — the same pattern Bitwarden and AWS KMS use:

```
Master Password
   │  Argon2id(password, unique salt)  →  256-bit Master Key (MK)   (never leaves the browser)
   ▼
Master Key encrypts  →  Data Encryption Key (DEK, random 256-bit)   (only the wrapped DEK is stored)
   ▼
DEK encrypts each note  →  AES-256-GCM, unique nonce per note        (server sees only ciphertext)
```

- **Zero-knowledge:** the master password and derived keys never leave the
  browser and are never persisted — they live only in memory and are wiped on
  lock/logout/auto-lock.
- **Two-password model:** the *login* password (bcrypt-hashed, server-side,
  handles sessions/rate-limiting) is separate from the *master* password (which
  derives the encryption key and never touches the server).
- **Primitives only, no custom crypto:** Argon2id (64 MB / 3 iterations) for key
  derivation, AES-256-GCM for authenticated encryption, CSPRNG for all random
  values.
- **Password rotation** re-wraps the DEK only — notes are never re-encrypted.

> If you forget your master password, your notes are **unrecoverable by design**.
> That is what zero-knowledge means.

## Security hardening implemented

- Session JWTs in `httpOnly`, `SameSite=Strict`, `Secure` cookies (production).
- App **refuses to start in production without a strong `SESSION_SECRET`.**
- Server enforces a minimum Argon2id strength (64 MB / 3 iterations) on signup
  and password rotation — a tampered client cannot register with a weak KDF.
- Signup gates on estimated password **entropy**, not just length.
- Login uses a constant-time-ish dummy bcrypt compare to blunt user enumeration.
- Per-user data isolation enforced on every API query (`userId` filter).
- Strict security headers: CSP, HSTS, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, and `X-Frame-Options: SAMEORIGIN`
  (clickjacking protection on by default).
- In-memory per-IP login rate limiting.

### Known limitations / next steps

- CSP still allows `'unsafe-inline'` for scripts (required by Next.js without a
  nonce setup). For maximum XSS hardening, migrate to a per-request nonce CSP.
- `typescript.ignoreBuildErrors` is currently `true` in `next.config.ts` — flip
  it to `false` once outstanding type issues are resolved so type bugs can't
  reach crypto/auth paths.
- The rate limiter is in-memory; a multi-instance deployment needs a shared
  store (e.g. Redis).
- No MFA and no password reset (a reset would necessarily weaken zero-knowledge).

## Getting started

Requires [Bun](https://bun.sh) (or Node 18+ with your package manager of choice).

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env
# then edit .env and set a strong SESSION_SECRET (openssl rand -base64 48)

# 3. Create the database schema
bun run db:push

# 4. Run the dev server
bun run dev            # http://localhost:3000
```

## Production build

```bash
bun run build
SESSION_SECRET="<long-random-value>" bun run start
```

Set at minimum in your production environment:

| Variable            | Required | Notes                                                    |
| ------------------- | -------- | -------------------------------------------------------- |
| `DATABASE_URL`      | yes      | e.g. `file:./db/custom.db`                               |
| `SESSION_SECRET`    | yes      | ≥ 32 random chars; app refuses to boot without it        |
| `ALLOW_IFRAME_EMBED`| no       | Set to `1` only to allow cross-origin iframe embedding   |

A `Caddyfile` is included for reverse-proxying to the standalone server.

## Tech stack

- **Framework:** Next.js (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Data:** Prisma ORM + SQLite
- **Crypto:** Web Crypto API (AES-256-GCM) + `hash-wasm` (Argon2id)
- **Auth/session:** `jose` (JWT) + `bcryptjs`
- **State:** Zustand

## License

Provided as-is, without warranty. Review and audit before relying on it for
sensitive data.
