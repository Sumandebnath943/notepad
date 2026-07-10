import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getUserId } from "@/lib/supabase/server";

/**
 * GET /api/keys — the user's salt + wrapped DEK. Useless without the master
 * password (the DEK is encrypted with the Master Key, which only exists in the
 * browser after the user types their master password). RLS ensures only the
 * user's own row is returned.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const uid = await getUserId(supabase);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("user_keys")
      .select(
        "kdfSalt:kdf_salt, encryptedDek:encrypted_dek, dekNonce:dek_nonce, kdfOpsLimit:kdf_ops_limit, kdfMemLimit:kdf_mem_limit"
      )
      .eq("user_id", uid)
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: "Key material not found. Your account may be corrupt." },
        { status: 404 }
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    console.error("keys GET error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

const MIN_KDF_OPS = 3;
const MIN_KDF_MEM = 64 * 1024; // 64 MiB, in KiB

const RotateSchema = z.object({
  kdfSalt: z.string().min(1),
  encryptedDek: z.string().min(1),
  dekNonce: z.string().min(1),
  kdfOpsLimit: z.number().int().min(MIN_KDF_OPS).max(20),
  kdfMemLimit: z.number().int().min(MIN_KDF_MEM),
});

/**
 * PUT /api/keys — replace the wrapped DEK (master-password rotation). The DEK
 * itself is unchanged, so notes don't need re-encryption.
 */
export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = RotateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const supabase = await createClient();
    const uid = await getUserId(supabase);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { kdfSalt, encryptedDek, dekNonce, kdfOpsLimit, kdfMemLimit } =
      parsed.data;
    const { error } = await supabase
      .from("user_keys")
      .update({
        kdf_salt: kdfSalt,
        encrypted_dek: encryptedDek,
        dek_nonce: dekNonce,
        kdf_ops_limit: kdfOpsLimit,
        kdf_mem_limit: kdfMemLimit,
      })
      .eq("user_id", uid);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("keys PUT error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
