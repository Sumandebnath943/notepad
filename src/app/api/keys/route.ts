import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUserId, AuthError } from "@/lib/auth";

/**
 * GET /api/keys — returns the user's public key material (salt + wrapped DEK).
 * This is NOT enough to decrypt anything: the DEK is encrypted with the Master
 * Key, which only exists when the user types their master password. A DB
 * attacker who reads this still cannot decrypt notes.
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const key = await db.userKey.findUnique({ where: { userId } });
    if (!key) {
      return NextResponse.json(
        { error: "Key material not found. Your account may be corrupt." },
        { status: 404 }
      );
    }
    return NextResponse.json({
      kdfSalt: key.kdfSalt,
      encryptedDek: key.encryptedDek,
      dekNonce: key.dekNonce,
      kdfOpsLimit: key.kdfOpsLimit,
      kdfMemLimit: key.kdfMemLimit,
    });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("keys GET error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// Same Argon2id floor as signup — a rotation must not weaken the KDF.
const MIN_KDF_OPS = 3;
const MIN_KDF_MEM = 64 * 1024; // 64 MiB, in KiB

const RotateSchema = z.object({
  // After a master-password rotation the client re-derives a new Master Key and
  // re-wraps the SAME DEK. Only the wrapped DEK + nonce + new salt change.
  kdfSalt: z.string().min(1),
  encryptedDek: z.string().min(1),
  dekNonce: z.string().min(1),
  kdfOpsLimit: z.number().int().min(MIN_KDF_OPS).max(20),
  kdfMemLimit: z.number().int().min(MIN_KDF_MEM),
});

/**
 * PUT /api/keys — replace the wrapped DEK (master password rotation). The DEK
 * itself is unchanged, so existing notes keep working and don't need
 * re-encryption. This is the key benefit of envelope encryption.
 */
export async function PUT(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    const parsed = RotateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const { kdfSalt, encryptedDek, dekNonce, kdfOpsLimit, kdfMemLimit } =
      parsed.data;

    await db.userKey.update({
      where: { userId },
      data: {
        kdfSalt,
        encryptedDek,
        dekNonce,
        kdfOpsLimit,
        kdfMemLimit,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("keys PUT error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
