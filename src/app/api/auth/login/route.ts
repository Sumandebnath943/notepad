import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const LoginSchema = z.object({
  email: z.string().email().max(254),
  loginPassword: z.string().min(1).max(256),
});

export async function POST(req: Request) {
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

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: loginPassword,
    });
    // Supabase Auth handles rate limiting and returns a generic error, so we
    // don't leak whether the email exists.
    if (error || !data.user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }
    return NextResponse.json({ id: data.user.id, email: data.user.email });
  } catch (e) {
    console.error("login error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
