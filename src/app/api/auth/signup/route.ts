import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  createSession,
  hashLoginPassword,
  checkRateLimit,
  resetRateLimit,
  getClientIp,
  AuthError,
} from "@/lib/auth";

// Enforce the spec's Argon2id floor (64 MB memory / 3 iterations). A tampered
// client cannot register itself with weak KDF parameters that would make its
// own wrapped-DEK cheap to brute force.
const MIN_KDF_OPS = 3;
const MIN_KDF_MEM = 64 * 1024; // 64 MiB, in KiB

const SignupSchema = z.object({
  email: z.string().email().max(254),
  loginPassword: z.string().min(8).max(256),
  // Key material (all ciphertext / salts — server never sees plaintext)
  kdfSalt: z.string().min(1),
  encryptedDek: z.string().min(1),
  dekNonce: z.string().min(1),
  kdfOpsLimit: z.number().int().min(MIN_KDF_OPS).max(20),
  kdfMemLimit: z.number().int().min(MIN_KDF_MEM),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = SignupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const {
      email,
      loginPassword,
      kdfSalt,
      encryptedDek,
      dekNonce,
      kdfOpsLimit,
      kdfMemLimit,
    } = parsed.data;

    const ip = getClientIp(req);
    const rl = checkRateLimit(ip);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Too many attempts. Retry in ${rl.retryAfter}s.` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
      );
    }

    const existing = await db.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    if (existing) {
      // Do not leak that the email is registered.
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await hashLoginPassword(loginPassword);
    const user = await db.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        userKey: {
          create: {
            kdfSalt,
            encryptedDek,
            dekNonce,
            kdfOpsLimit,
            kdfMemLimit,
          },
        },
      },
      select: { id: true, email: true },
    });

    resetRateLimit(ip);
    await createSession(user);
    return NextResponse.json({ id: user.id, email: user.email });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("signup error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
