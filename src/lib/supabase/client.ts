/**
 * Browser Supabase client.
 *
 * Uses only the PUBLIC anon key (safe to ship to the browser). Row-Level
 * Security in the database — not this client — is what isolates each user's
 * data: every query runs as the logged-in user (auth.uid()), and the RLS
 * policies only expose that user's own rows.
 *
 * ZERO-KNOWLEDGE NOTE: Supabase handles the *login* session only. The master
 * password, Master Key and DEK never touch Supabase — they stay in browser
 * memory exactly as before (see lib/crypto.ts and lib/store.ts). Supabase only
 * ever stores ciphertext + wrapped key material.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example)."
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
