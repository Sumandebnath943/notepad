/**
 * Session refresh for the Next.js middleware.
 *
 * Runs on every matched request, reads the httpOnly auth cookies, and lets
 * Supabase rotate the access/refresh tokens when needed — writing the updated
 * cookies back on the response. Without this, server-side sessions would go
 * stale and users would get logged out when the short-lived access token
 * expires.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // If Supabase isn't configured yet, don't break the whole app — just pass through.
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, { ...options, ...AUTH_COOKIE_OPTIONS })
        );
      },
    },
  });

  // Touching getUser() triggers a refresh when the access token is near expiry.
  await supabase.auth.getUser();

  return response;
}
