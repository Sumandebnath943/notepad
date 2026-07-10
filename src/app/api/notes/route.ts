import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUserId, AuthError } from "@/lib/auth";

/**
 * GET /api/notes — list the current user's notes (ciphertext only). The server
 * returns ciphertext + nonces; decryption happens client-side with the DEK.
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const notes = await db.note.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        ciphertext: true,
        nonce: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ notes });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("notes list error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

const CreateSchema = z.object({
  ciphertext: z.string().min(1),
  nonce: z.string().min(1),
});

/**
 * POST /api/notes — create a note. Only ciphertext + nonce are accepted; the
 * server has no way to see plaintext.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const { ciphertext, nonce } = parsed.data;
    const note = await db.note.create({
      data: { userId, ciphertext, nonce },
      select: {
        id: true,
        ciphertext: true,
        nonce: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ note }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("note create error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
