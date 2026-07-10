/**
 * Client-side cryptography for the Secure Notepad.
 *
 * Zero-knowledge model: ALL encryption/decryption happens in the browser.
 * The server (and any database attacker) only ever sees ciphertext.
 *
 * Envelope encryption (same pattern Bitwarden / AWS KMS use):
 *
 *   Master Password
 *        │  Argon2id(password, unique salt)  →  256-bit Master Key (MK)
 *        │  (MK never leaves the browser, never persisted)
 *        ▼
 *   Master Key encrypts  →  Data Encryption Key (DEK, random 256-bit)
 *        │  (encrypted DEK is the only key material stored server-side)
 *        ▼
 *   DEK encrypts each note  →  AES-256-GCM with a unique nonce per note
 *
 * Why envelope encryption:
 *   - Rotating the master password only re-encrypts the DEK (one small blob),
 *     not every note.
 *   - The DEK is a random key, so it has full entropy regardless of password
 *     strength — notes are protected by a strong key even if the KDF is "only"
 *     as strong as the user's password.
 *
 * Primitives (audited, standard — no custom crypto):
 *   - Key derivation:  Argon2id (64 MB memory, 3 iterations)  — hash-wasm
 *   - Symmetric AEAD:  AES-256-GCM                            — Web Crypto API
 *   - Random values:   CSPRNG                                  — crypto.getRandomValues
 */

import { argon2id } from "hash-wasm";

// ── Argon2id parameters ──────────────────────────────────────────────────────
// Per the spec: 64 MB memory cost, 3 iterations. These are deliberately strong.
// DO NOT lower these "for performance" — password strength is the real weak
// point, and Argon2id's job is to make brute force expensive.
export const ARGON2_MEM_COST = 64 * 1024; // 64 MB (in KiB)
export const ARGON2_TIME_COST = 3; // iterations
export const ARGON2_PARALLELISM = 1; // browsers are typically single-thread for this
export const KEY_LEN = 32; // 256-bit keys
export const NONCE_LEN = 12; // 96-bit nonce for AES-GCM
export const SALT_LEN = 16; // 128-bit salt per user

// ── Base64 helpers (Uint8Array ⇄ string) ─────────────────────────────────────
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ── CSPRNG ───────────────────────────────────────────────────────────────────
export function randomBytes(len: number): Uint8Array {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return buf;
}

export function randomSalt(): Uint8Array {
  return randomBytes(SALT_LEN);
}

export function randomNonce(): Uint8Array {
  return randomBytes(NONCE_LEN);
}

// ── Master Key derivation (Argon2id) ─────────────────────────────────────────
/**
 * Derive a 256-bit Master Key from the user's master password and salt.
 * Returns the raw key bytes. The caller should import these as a
 * non-extractable CryptoKey and never persist them.
 */
export async function deriveMasterKey(
  password: string,
  salt: Uint8Array,
  opts?: { memCost?: number; timeCost?: number }
): Promise<Uint8Array> {
  const memCost = opts?.memCost ?? ARGON2_MEM_COST;
  const timeCost = opts?.timeCost ?? ARGON2_TIME_COST;
  return argon2id({
    password,
    salt,
    parallelism: ARGON2_PARALLELISM,
    memorySize: memCost,
    iterations: timeCost,
    hashLength: KEY_LEN,
    outputType: "binary",
  });
}

/** Import raw 32-byte key material as a non-extractable AES-256-GCM CryptoKey. */
export async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

// ── Envelope encryption: DEK management ──────────────────────────────────────
export interface EncryptedDek {
  encryptedDek: string; // base64
  dekNonce: string; // base64
}

/**
 * Generate a fresh random 256-bit DEK and wrap it with the Master Key.
 * Returns the encrypted DEK blob (safe to store server-side) plus the live DEK
 * CryptoKey (keep in memory only).
 */
export async function createAndWrapDek(
  masterKey: CryptoKey
): Promise<{ encrypted: EncryptedDek; dek: CryptoKey }> {
  const dekBytes = randomBytes(KEY_LEN);
  const dek = await importAesKey(dekBytes);
  const nonce = randomNonce();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    masterKey,
    dekBytes
  );
  // Zero out the raw DEK bytes from memory ASAP.
  dekBytes.fill(0);
  return {
    encrypted: {
      encryptedDek: bytesToBase64(new Uint8Array(ciphertext)),
      dekNonce: bytesToBase64(nonce),
    },
    dek,
  };
}

/**
 * Unwrap the DEK using the Master Key. Returns the live DEK CryptoKey to be
 * held in memory. If the master password is wrong, AES-GCM auth will throw.
 */
export async function unwrapDek(
  masterKey: CryptoKey,
  encryptedDek: string,
  dekNonce: string
): Promise<CryptoKey> {
  const ct = base64ToBytes(encryptedDek);
  const nonce = base64ToBytes(dekNonce);
  const dekBytes = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, masterKey, ct)
  );
  const dek = await importAesKey(dekBytes);
  dekBytes.fill(0);
  return dek;
}

// ── Note encryption (AES-256-GCM with DEK) ───────────────────────────────────
export interface NotePlaintext {
  title: string;
  body: string;
}

export interface EncryptedNote {
  ciphertext: string; // base64
  nonce: string; // base64
}

/** Encrypt the combined {title, body} payload with the DEK. */
export async function encryptNote(
  dek: CryptoKey,
  note: NotePlaintext
): Promise<EncryptedNote> {
  const nonce = randomNonce();
  // A single AEAD operation over the combined payload avoids any chance of
  // nonce reuse across title/body and binds them together.
  const plaintext = new TextEncoder().encode(JSON.stringify(note));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    dek,
    plaintext
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(ct)),
    nonce: bytesToBase64(nonce),
  };
}

/** Decrypt a note payload. Throws if the DEK is wrong or the note was tampered
 *  with (AES-GCM authenticated decryption). */
export async function decryptNote(
  dek: CryptoKey,
  enc: EncryptedNote
): Promise<NotePlaintext> {
  const ct = base64ToBytes(enc.ciphertext);
  const nonce = base64ToBytes(enc.nonce);
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, dek, ct)
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as NotePlaintext;
}

// ── Password strength estimation ─────────────────────────────────────────────
/**
 * Rough entropy estimate (bits) for the master password. Used only for a
 * strength meter and a soft minimum gate — the real protection is Argon2id
 * making each guess expensive.
 */
export function estimatePasswordEntropy(password: string): number {
  if (!password) return 0;
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/[0-9]/.test(password)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(password)) pool += 33;
  return Math.round(password.length * Math.log2(pool));
}

export function passwordStrengthLabel(entropy: number): {
  label: string;
  color: string;
  pct: number;
} {
  // <40 weak, 40-60 fair, 60-80 good, 80+ strong
  if (entropy < 28) return { label: "Very weak", color: "bg-red-500", pct: 15 };
  if (entropy < 40) return { label: "Weak", color: "bg-orange-500", pct: 35 };
  if (entropy < 60) return { label: "Fair", color: "bg-yellow-500", pct: 55 };
  if (entropy < 80) return { label: "Good", color: "bg-emerald-500", pct: 78 };
  return { label: "Strong", color: "bg-emerald-600", pct: 100 };
}

// ── Master-password policy ───────────────────────────────────────────────────
/**
 * Hard requirements for the master password. Because the master password is the
 * ONLY thing protecting your notes (zero-knowledge — there is no recovery), we
 * refuse to set a weak one. Every rule must pass before a vault can be created.
 */
export interface PasswordRule {
  label: string;
  ok: boolean;
}

export const MASTER_PASSWORD_MIN_LENGTH = 16;

export function checkMasterPassword(password: string): PasswordRule[] {
  return [
    {
      label: `At least ${MASTER_PASSWORD_MIN_LENGTH} characters`,
      ok: password.length >= MASTER_PASSWORD_MIN_LENGTH,
    },
    { label: "A lowercase letter (a–z)", ok: /[a-z]/.test(password) },
    { label: "An uppercase letter (A–Z)", ok: /[A-Z]/.test(password) },
    { label: "A number (0–9)", ok: /[0-9]/.test(password) },
    { label: "A symbol (!@#$…)", ok: /[^A-Za-z0-9]/.test(password) },
  ];
}

/** True only when the master password satisfies every rule. */
export function masterPasswordMeetsPolicy(password: string): boolean {
  return checkMasterPassword(password).every((r) => r.ok);
}
