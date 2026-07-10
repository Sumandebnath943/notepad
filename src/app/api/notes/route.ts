import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getUserId } from "@/lib/supabase/server";

// Alias snake_case columns to the camelCase shape the browser expects.
const NOTE_COLS =
  "id, ciphertext, nonce, createdAt:created_at, updatedAt:updated_at";

/** GET /api/notes — list the user's notes (ciphertext only). RLS scopes to the user. */
export async function GET() {
  try {
    const supabase = await createClient();
    const uid = await getUserId(supabase);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("notes")
      .select(NOTE_COLS)
      .order("updated_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ notes: data ?? [] });
  } catch (e) {
    console.error("notes list error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

const CreateSchema = z.object({
  ciphertext: z.string().min(1),
  nonce: z.string().min(1),
});

/** POST /api/notes — create a note. Only ciphertext + nonce are accepted. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const supabase = await createClient();
    const uid = await getUserId(supabase);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { ciphertext, nonce } = parsed.data;
    const { data, error } = await supabase
      .from("notes")
      .insert({ user_id: uid, ciphertext, nonce })
      .select(NOTE_COLS)
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Create failed" },
        { status: 400 }
      );
    }
    return NextResponse.json({ note: data }, { status: 201 });
  } catch (e) {
    console.error("note create error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
