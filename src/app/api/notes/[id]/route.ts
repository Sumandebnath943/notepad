import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getUserId } from "@/lib/supabase/server";

const NOTE_COLS =
  "id, ciphertext, nonce, createdAt:created_at, updatedAt:updated_at";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/notes/[id] — fetch a single note. Ownership is enforced by RLS: a
 * note belonging to another user simply doesn't match and 404s.
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const uid = await getUserId(supabase);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("notes")
      .select(NOTE_COLS)
      .eq("id", id)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ note: data });
  } catch (e) {
    console.error("note get error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

const UpdateSchema = z.object({
  ciphertext: z.string().min(1),
  nonce: z.string().min(1),
});

/** PUT /api/notes/[id] — update ciphertext + nonce. Ownership enforced by RLS. */
export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const supabase = await createClient();
    const uid = await getUserId(supabase);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { ciphertext, nonce } = parsed.data;
    const { data, error } = await supabase
      .from("notes")
      .update({ ciphertext, nonce })
      .eq("id", id)
      .select(NOTE_COLS)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ note: data });
  } catch (e) {
    console.error("note update error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** DELETE /api/notes/[id] — permanently delete a note. Ownership enforced by RLS. */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const uid = await getUserId(supabase);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { error } = await supabase.from("notes").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("note delete error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
