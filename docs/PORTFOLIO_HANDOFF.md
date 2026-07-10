# AEGIS VAULT — Portfolio Handoff

Everything you need to build a landing page for this project on your portfolio
site: ready-to-paste copy, the story, the tech, what it demonstrates, and what
it taught me. Lift any of it directly, or hand this whole file to a page builder.

> **Purpose of this doc:** it is *page content*, not code docs. It's written so
> you can drop the sections straight into a portfolio case-study page.

---

## 0. One-liner / tagline options

- **"A zero-knowledge notes app — encrypted in your browser, unreadable to the server."**
- "Encrypted notes, invisible by design."
- "A password manager's security model, applied to note-taking."
- "Your notes, end-to-end encrypted. Not even the database can read them."

## 1. Hero section (ready to paste)

> ### AEGIS VAULT
> **Zero-knowledge encrypted notepad**
>
> A full-stack notes app where every note is encrypted in the browser before it
> ever leaves your device. The server stores nothing but ciphertext — a complete
> database breach would reveal nothing without your master password.
>
> Built with Next.js, Supabase, and the Web Crypto API.
>
> `[ Live Demo ]`  `[ View Source ]`

**Hero sub-points (badges / chips):**
`Argon2id` · `AES-256-GCM` · `Envelope Encryption` · `Zero-Knowledge` · `Row-Level Security` · `httpOnly Sessions`

## 2. The problem (why it exists)

Most "secure" notes apps still store your notes in a form the company can read —
you're trusting their servers, employees, and breach response. AEGIS VAULT
removes that trust requirement entirely: the encryption keys are derived from a
master password that **never leaves the browser and is never stored anywhere**.
Even with full access to the database, an attacker gets only unreadable
ciphertext. This is the same "zero-knowledge" model used by password managers
like Bitwarden — applied to note-taking.

## 3. What it does (user-facing features)

- **Create, edit, delete notes** with auto-save — every note encrypted client-side.
- **Two-password model:** a login password (for your account/session) and a
  separate master password (which decrypts your notes).
- **Multi-device:** log in on any device, enter your master password, and your
  notes decrypt — nothing device-specific is stored.
- **Auto-lock:** the app wipes your keys from memory after inactivity, when the
  tab is hidden, or on logout — re-entry of the master password is required.
- **Master-password strength enforcement:** a live checklist requires 16+
  characters with mixed case, numbers, and symbols before a vault can be created.
- **Password rotation** without re-encrypting every note (envelope encryption).
- **Tamper detection:** notes are authenticated (AES-GCM); any modification is
  detected on decrypt.

## 4. How it's built (architecture)

**The core idea — envelope encryption** (the same pattern AWS KMS / Bitwarden use):

```
Master Password
   │  Argon2id (64 MB, 3 iterations, unique salt)
   ▼
Master Key  ── never leaves the browser, never stored
   │  encrypts
   ▼
Data Encryption Key (DEK, random 256-bit)  ── stored only as ciphertext
   │  encrypts
   ▼
Each note  ── AES-256-GCM, unique nonce per note
```

**The stack:**
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS +
  shadcn/ui, framer-motion, Zustand for state.
- **Crypto:** Web Crypto API (AES-256-GCM) + `hash-wasm` (Argon2id) — all
  audited, standard primitives, no custom crypto.
- **Backend:** Supabase — Auth for login, Postgres for storage, and Row-Level
  Security so the database itself enforces per-user isolation.
- **Sessions:** server-mediated via `@supabase/ssr` — the auth token lives in an
  httpOnly cookie the browser's JavaScript can't read, so an XSS can't steal it.
- **Hosting:** Vercel (app) + Supabase (data).

**Security hardening layered on top:** strict Content-Security-Policy, HSTS,
X-Frame-Options (clickjacking), timing-safe auth behavior, and a server-enforced
minimum key-derivation strength.

## 5. Technical challenges I solved (the interesting part)

Great portfolio material — each is a real decision with a real trade-off:

1. **Designing a genuine zero-knowledge model.** Rather than "double AES" or
   hand-rolled crypto, I used envelope encryption so the master password can be
   rotated without re-encrypting every note, and so notes are protected by a
   full-entropy random key even if a user's password is weak.
2. **Migrating the backend from SQLite to Supabase.** The first build used
   SQLite + Prisma, which can't run on serverless hosting. I migrated to
   Supabase Auth + Postgres + RLS, moving user isolation from application code
   into the database itself (defense in depth).
3. **Closing an XSS session-theft gap.** A browser-side Supabase client would
   keep the session token in JS-readable storage. I re-architected to be
   server-mediated with `@supabase/ssr`, putting the session in an httpOnly
   cookie — so page scripts can never read it — while keeping RLS enforcement.
4. **Keeping keys out of persistence.** The Master Key and DEK live only in
   memory (a Zustand store / JS closures), are zeroed after use, and are dropped
   on auto-lock — never in localStorage, sessionStorage, or cookies.
5. **Security-first UX.** A live password-policy checklist, strength meter, and
   auto-lock make the *right* behavior the default, since password strength is
   the real weak point in a zero-knowledge system.

## 6. What it taught me (skills / takeaways)

Frame these as bullet takeaways on the page:

- **Applied cryptography in practice** — KDFs (Argon2id) vs. hashing, authenticated
  encryption (AES-GCM), nonces/salts, and *envelope / key-wrapping* patterns.
- **Threat modeling** — reasoning about what a database breach, an XSS, or a
  compromised device can and cannot reach, and designing so the worst case
  yields only ciphertext.
- **The difference between "encrypted" and "zero-knowledge"** — and why where the
  keys live matters more than which cipher you pick.
- **Auth & session security** — httpOnly cookies vs. localStorage, server-mediated
  access, and Postgres Row-Level Security as database-enforced authorization.
- **Full-stack Next.js** — App Router, Route Handlers, middleware, and a clean
  separation between a browser fetch client and server-side data access.
- **Making trade-offs explicitly** — self-hosted vs. managed, database-enforced
  vs. app-enforced isolation, complexity vs. security, and documenting the *why*.
- **Shipping** — from spec → build → hardening → cloud deployment (Vercel +
  Supabase) with real environment/secret management.

## 7. Highlight stats (for a stat strip)

- **0** — bytes of plaintext or keys the server ever sees
- **256-bit** — AES-GCM authenticated encryption
- **64 MB / 3 iterations** — Argon2id key derivation cost
- **2** — independent passwords (login vs. master)
- **100%** — of encryption/decryption performed client-side

## 8. Suggested page structure

1. **Hero** — title, tagline, two CTAs (Live Demo, Source), primitive badges.
2. **The problem** — 2–3 sentences (section 2).
3. **What it does** — feature grid/cards (section 3).
4. **How it works** — the envelope-encryption diagram (section 4) + short prose.
5. **Architecture / stack** — logos or a labeled diagram; the request/crypto flow.
6. **Challenges & decisions** — 3–5 cards (section 5). *This is the differentiator.*
7. **What I learned** — bullet list (section 6).
8. **Screenshots** — see section 9.
9. **CTA footer** — links to demo + GitHub.

## 9. Screenshots / visuals to capture

- The **auth screen** (the branded hero + "Create vault" with the live password
  checklist) — visually strong, shows the security framing.
- The **notes editor** with an "Encrypted" chip.
- **Proof shot:** a side-by-side of a readable note in the app vs. the same row
  in the Supabase table showing gibberish `ciphertext`. *This single image sells
  the whole concept — lead with it.*
- The **envelope-encryption diagram** (recreate section 4 as a clean graphic).

## 10. Links & meta

- **Live demo:** `<your Vercel URL>`
- **Source:** https://github.com/Sumandebnath943/notepad
- **Suggested SEO title:** "AEGIS VAULT — Zero-Knowledge Encrypted Notes App (Next.js + Supabase)"
- **Meta description:** "A full-stack, end-to-end encrypted notepad. Notes are
  encrypted in the browser with Argon2id + AES-256-GCM; the server stores only
  ciphertext. Built with Next.js, Supabase, and Row-Level Security."
- **Tags:** Next.js · React · TypeScript · Supabase · PostgreSQL · Web Crypto ·
  Applied Cryptography · Zero-Knowledge · Full-Stack

## 11. A note on the live demo (honesty for your page)

This is a **portfolio demonstration project**, not an audited security product.
If you link a live demo, consider adding a line like *"Demo / educational project
— please don't store truly sensitive data."* It's an honest, mature touch that
actually reads as a *plus* to technical reviewers, because it shows you
understand the difference between a strong design and a professionally audited
product.
