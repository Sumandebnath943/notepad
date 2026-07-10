/**
 * Server-side auth utilities.
 *
 * Two-password model (per spec): the LOGIN password (handled here, bcrypt-hashed
 * and stored) is SEPARATE from the encryption MASTER password (which never
 * touches the server). This lets us use standard session handling, rate
 * limiting, and future MFA without it ever affecting the encryption key.
 *
 * Sessions are signed JWTs in httpOnly, SameSite=Strict, Secure cookies — they
 * cannot be read by JS (mitigates XSS token theft). The DEK/Master Key are
 * NEVER in the cookie; they live only in browser memory after unlock.
 */

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

const SESSION_COOKIE = "sn_session";
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days (sliding)
const BCRYPT_ROUNDS = 12;

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // In production a missing/weak secret means anyone can forge a session
    // JWT, so we refuse to start rather than silently sign with a guessable
    // fallback. Set SESSION_SECRET to a long random value (see .env.example).
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SESSION_SECRET is not set. Refusing to run in production with an " +
          "insecure fallback session secret."
      );
    }
    // Dev-only fallback so `next dev` works without configuration.
    return new TextEncoder().encode(
      "dev-only-insecure-secret-change-me-" + process.cwd()
    );
  }
  if (process.env.NODE_ENV === "production" && secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is too short. Use at least 32 characters of entropy."
    );
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  sub: string; // user id
  email: string;
  iat?: number;
  exp?: number;
}

/** Hash a login password with bcrypt (server-side only). */
export async function hashLoginPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** Verify a login password against a stored bcrypt hash. */
export async function verifyLoginPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Create a signed session JWT and set it as an httpOnly cookie. */
export async function createSession(user: { id: string; email: string }) {
  const token = await new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

/** Read & verify the session from the cookie. Returns null if invalid/absent. */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    return {
      sub: payload.sub as string,
      email: payload.email as string,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

/** Require a valid session, returning the user id. Throws 401-style otherwise. */
export async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session?.sub) {
    throw new AuthError("Unauthorized", 401);
  }
  return session.sub;
}

/** Destroy the session cookie (logout). */
export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ── In-memory login rate limiting (defense in depth) ─────────────────────────
// Limits per-IP brute force against the login endpoint. A production deployment
// would back this with Redis, but an in-memory limiter is a meaningful baseline.
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000; // 15 min
const MAX_ATTEMPTS = 10;

export function checkRateLimit(ip: string): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, retryAfter: 0 };
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  return { ok: true, retryAfter: 0 };
}

export function resetRateLimit(ip: string) {
  attempts.delete(ip);
}

/** Extract a best-effort client IP from request headers. */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Convenience: look up a user row by session. */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session?.sub) return null;
  return db.user.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, createdAt: true },
  });
}
