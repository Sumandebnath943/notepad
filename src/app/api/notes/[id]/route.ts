import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUserId, AuthError } from "@/lib/auth";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/notes/[id] — fetch a single note (ciphertext). Ownership is enforced
 * by the userId filter; a note belonging to another user simply 404s.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const note = await db.note.findFirst({
      where: { id, userId },
      select: {
        id: true,
        ciphertext: true,
        nonce: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ note });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("note get error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

const UpdateSchema = z.object({
  ciphertext: z.string().min(1),
  nonce: z.string().min(1),
});

/**
 * PUT /api/notes/[id] — update a note's ciphertext + nonce (re-encrypted with a
 * fresh nonce on every save). Ownership enforced via userId filter.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const { ciphertext, nonce } = parsed.data;
    // findFirst + update to enforce ownership atomically-ish.
    const existing = await db.note.findFirst({ where: { id, userId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const note = await db.note.update({
      where: { id },
      data: { ciphertext, nonce },
      select: {
        id: true,
        ciphertext: true,
        nonce: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ note });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("note update error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/notes/[id] — permanently delete a note. Ciphertext is removed
 * from the server. (This is the one genuinely destructive action.)
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const existing = await db.note.findFirst({ where: { id, userId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await db.note.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("note delete error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
