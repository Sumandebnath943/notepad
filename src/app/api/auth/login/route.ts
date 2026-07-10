import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  createSession,
  verifyLoginPassword,
  checkRateLimit,
  resetRateLimit,
  getClientIp,
} from "@/lib/auth";

const LoginSchema = z.object({
  email: z.string().email().max(254),
  loginPassword: z.string().min(1).max(256),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 400 }
      );
    }
    const { email, loginPassword } = parsed.data;

    const ip = getClientIp(req);
    const rl = checkRateLimit(ip);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Too many attempts. Retry in ${rl.retryAfter}s.` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
      );
    }

    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, passwordHash: true },
    });

    // Always run a bcrypt compare to keep timing roughly constant whether or
    // not the user exists (mitigates user-enumeration via timing).
    const dummyHash =
      "$2a$12$000000000000000000000000000000000000000000000000000000";
    const ok = user
      ? await verifyLoginPassword(loginPassword, user.passwordHash)
      : await verifyLoginPassword(loginPassword, dummyHash);

    if (!user || !ok) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    resetRateLimit(ip);
    await createSession({ id: user.id, email: user.email });
    return NextResponse.json({ id: user.id, email: user.email });
  } catch (e) {
    console.error("login error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
