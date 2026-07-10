/**
 * Server-side Supabase client (used only inside Route Handlers / Middleware).
 *
 * The browser NEVER instantiates a Supabase client. All access is server-
 * mediated, which lets us keep the auth session in an httpOnly cookie that page
 * scripts cannot read — closing the XSS session-theft gap that a browser client
 * (localStorage / JS-readable cookie) would leave open.
 *
 * Per-user isolation is still enforced by Postgres Row-Level Security: this
 * client carries the logged-in user's access token, so every query runs as that
 * user (auth.uid()).
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// httpOnly is safe here because nothing in the browser ever needs to read these
// cookies — only the server (which CAN read httpOnly cookies) does.
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function createClient() {
  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example)."
    );
  }
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, { ...options, ...AUTH_COOKIE_OPTIONS })
          );
        } catch {
          // `.set` throws when called from a Server Component; the middleware
          // refresh handles cookie writes in that case, so this is safe to ignore.
        }
      },
    },
  });
}

/** Convenience: return the authenticated user id or null. */
export async function getUserId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
