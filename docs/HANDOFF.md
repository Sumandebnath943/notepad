# AEGIS VAULT — Developer Handoff

A practical guide for anyone picking up this codebase: what it is, how to run it,
how to deploy it, and what to watch out for. For the full "why," see
[`PROJECT_BIBLE.md`](./PROJECT_BIBLE.md).

---

## 1. What this is

**AEGIS VAULT** is a **zero-knowledge encrypted notepad**. All encryption and
decryption happen in the browser; the server (Supabase) only ever stores
ciphertext. A full database breach yields nothing readable without the user's
master password.

- **Live:** deployed on Vercel, backed by Supabase.
- **Repo:** https://github.com/Sumandebnath943/notepad (branch: `main`)

## 2. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS + shadcn/ui, framer-motion |
| Backend | Supabase — Auth + Postgres + Row-Level Security |
| Auth/session | `@supabase/ssr` (httpOnly cookies), server-mediated |
| Crypto | Web Crypto API (AES-256-GCM) + `hash-wasm` (Argon2id) |
| Client state | Zustand |
| Hosting | Vercel (app) + Supabase (data) |

## 3. Repository map

```
src/
  app/
    api/
      auth/{signup,login,logout,me}/route.ts   Route Handlers → Supabase (server-side)
      keys/route.ts                            GET/PUT wrapped key material
      notes/route.ts, notes/[id]/route.ts      CRUD notes (ciphertext only)
    globals.css                                theme, .glass / .glass-solid surfaces
    layout.tsx, page.tsx
  components/
    secure-notepad/                            app screens (auth, unlock, notes, lock-gate)
    ui/                                         shadcn primitives
    brand/logo.tsx
  hooks/                                        use-mobile, use-toast
  lib/
    crypto.ts       ← ALL client-side cryptography + master-password policy
    store.ts        ← Zustand store: auth state, DEK in memory, notes, auto-lock
    api.ts          ← browser fetch client → /api/*
    supabase/
      server.ts     ← createServerClient (httpOnly cookies) for Route Handlers
      middleware.ts ← session refresh helper
    utils.ts
  middleware.ts                                runs the Supabase session refresh
supabase/migrations/0001_init.sql              schema + RLS policies (run in Supabase)
next.config.ts                                 security headers (CSP, HSTS, etc.)
Caddyfile                                      optional reverse proxy for self-hosting
```

**The three files that matter most:** `src/lib/crypto.ts` (the crypto),
`src/lib/store.ts` (how keys live in memory + the app lifecycle), and
`supabase/migrations/0001_init.sql` (the data model + RLS).

## 4. Local setup

**Prereqs:** Node 18+ (repo was built/tested on Node 24). Bun is optional — npm
works for everything (`bun` is only referenced in the `start`/`build` scripts).

1. **Clone & install**
   ```bash
   git clone https://github.com/Sumandebnath943/notepad.git
   cd notepad
   npm install          # or: bun install
   ```
2. **Create a Supabase project** at supabase.com.
3. **Run the schema** — Supabase dashboard → SQL Editor → paste
   `supabase/migrations/0001_init.sql` → Run. Creates `user_keys` + `notes` +
   RLS policies.
4. **Disable email confirmation** — Authentication → Providers → Email →
   **"Confirm email" OFF**. *(Signup needs an immediate session to write key
   material under RLS; an email round-trip breaks that.)*
5. **Configure env** — copy `.env.example` → `.env` (or `.env.local`) and set:
   ```
   NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon public key>"
   ```
6. **Run**
   ```bash
   npm run dev          # http://localhost:3000
   ```

## 5. Deployment (Vercel + Supabase)

1. Connect the GitHub repo to Vercel. Production branch = `main`.
2. In Vercel → Settings → Environment Variables, set `NEXT_PUBLIC_SUPABASE_URL`
   and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for **Production** (and Preview).
3. Ensure the Supabase migration has been run and email confirmation is off.
4. Push to `main` → Vercel builds and deploys automatically.

> ⚠️ **Do not deploy the old SQLite version.** Early history used SQLite/Prisma,
> which cannot run on Vercel's serverless (ephemeral filesystem). `main` is the
> Supabase version — keep it that way for any hosted deploy.

## 6. Environment variables

| Variable | Where | Required | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | local `.env`, Vercel | yes | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | local `.env`, Vercel | yes | anon/public key (safe to expose) |
| `ALLOW_IFRAME_EMBED` | optional | no | `1` allows cross-origin iframe embedding; unset keeps clickjacking protection on |

The Supabase **service_role key is never used** and must never be added client-side.

## 7. How it works (30-second version)

- **Signup:** browser derives a Master Key from the master password (Argon2id),
  generates a random DEK, wraps the DEK with the Master Key, and sends only
  ciphertext + salt to Supabase (via `/api/auth/signup`). Supabase Auth stores
  the login password.
- **Unlock:** browser re-derives the Master Key from the master password + stored
  salt, unwraps the DEK, keeps it **in memory only**.
- **Notes:** encrypted/decrypted in the browser with the DEK (AES-256-GCM). The
  server sees only ciphertext.
- **Sessions:** Supabase Auth session lives in an **httpOnly cookie**; all
  Supabase calls go through server-side Route Handlers. Page scripts can't read
  the token.
- **Isolation:** Postgres **RLS** (`auth.uid() = user_id`) — the database itself
  refuses cross-user access.
- **Auto-lock:** the DEK is dropped from memory after inactivity / tab-hidden /
  logout; re-entry of the master password is required to resume.

## 8. Known limitations / next steps

- `typescript.ignoreBuildErrors: true` in `next.config.ts` — flip to `false`
  once type issues are resolved so type bugs can't reach crypto/auth paths.
- CSP still allows `'unsafe-inline'` for scripts (Next.js needs it without a
  nonce setup). Migrate to a per-request nonce CSP for maximum XSS hardening.
- Next 16 deprecation: rename `src/middleware.ts` → `src/proxy.ts` (the
  `middleware` convention still runs, just warns).
- No MFA / password reset yet (Supabase Auth supports both — wire up if wanted).
- Editor is a plain textarea. A Markdown or code editor (syntax highlighting)
  was discussed as a future enhancement.
- `build`/`start` scripts still use bun + Unix tooling (`cp`, `tee`); fine on
  Vercel, but adjust if self-hosting on Windows.

## 9. Verifying a change (smoke test)

1. Sign up with a master password that passes the policy (16+ chars, upper,
   lower, number, symbol).
2. Create a note, type, wait for "Saved", reload → note persists.
3. In Supabase → Table Editor → `notes`: `ciphertext` is gibberish (zero-
   knowledge confirmed).
4. Lock → unlock with master password. Wrong password → clean error.
5. DevTools → Application → Cookies: the Supabase auth cookie shows **HttpOnly**.

## 10. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Missing Supabase configuration` (500) | env vars not set / not restarted |
| Signup fails with a permission/RLS error | migration not run, or "Confirm email" still on |
| Logged out after ~1 hour | middleware not running (session not refreshing) |
| `npm run dev` fails on Windows | old `tee` pipe — already fixed on `main`; pull latest |
| Notes show "[Undecryptable note]" | wrong DEK, or ciphertext was tampered with |
