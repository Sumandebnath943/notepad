import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Enforce the spec's Argon2id floor (64 MB / 3 iterations) — a tampered client
// cannot register with weak KDF params that would make its wrapped DEK cheap to
// brute force.
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

export async function POST(req: Request) {
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

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: loginPassword,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const user = data.user;
    if (!user) {
      return NextResponse.json({ error: "Sign up failed" }, { status: 400 });
    }
    // We need an active session here so the "own keys" RLS policy passes on the
    // insert below. That requires email confirmation to be OFF in Supabase.
    if (!data.session) {
      return NextResponse.json(
        {
          error:
            'Email confirmation is enabled. Disable "Confirm email" in ' +
            "Supabase Auth settings for this zero-knowledge flow.",
        },
        { status: 400 }
      );
    }

    const { error: keyErr } = await supabase.from("user_keys").insert({
      user_id: user.id,
      kdf_salt: kdfSalt,
      encrypted_dek: encryptedDek,
      dek_nonce: dekNonce,
      kdf_ops_limit: kdfOpsLimit,
      kdf_mem_limit: kdfMemLimit,
    });
    if (keyErr) {
      return NextResponse.json({ error: keyErr.message }, { status: 400 });
    }

    return NextResponse.json({ id: user.id, email: user.email });
  } catch (e) {
    console.error("signup error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
