/**
 * Data-access layer backed by Supabase (Auth + Postgres + RLS).
 *
 * This mirrors the shape of the old fetch-based `api` object so the rest of the
 * app (lib/store.ts) is unchanged: it still calls `signup`, `login`, `getKeys`,
 * `listNotes`, etc. The difference is these now talk directly to Supabase.
 *
 * Isolation is enforced by Row-Level Security in the database (auth.uid() =
 * user_id), not by this code — a query can only ever see/modify the current
 * user's rows. Only ciphertext and wrapped key material are ever sent.
 */

import { supabase } from "@/lib/supabase/client";

export interface UserDto {
  id: string;
  email: string;
  createdAt?: string;
}

export interface KeyMaterialDto {
  kdfSalt: string;
  encryptedDek: string;
  dekNonce: string;
  kdfOpsLimit: number;
  kdfMemLimit: number;
}

export interface NoteDto {
  id: string;
  ciphertext: string;
  nonce: string;
  createdAt: string;
  updatedAt: string;
}

// ── Row shapes (snake_case as stored in Postgres) ────────────────────────────
interface NoteRow {
  id: string;
  ciphertext: string;
  nonce: string;
  created_at: string;
  updated_at: string;
}

function mapNote(row: NoteRow): NoteDto {
  return {
    id: row.id,
    ciphertext: row.ciphertext,
    nonce: row.nonce,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not authenticated");
  return data.user.id;
}

const NOTE_COLS = "id, ciphertext, nonce, created_at, updated_at";

export const api = {
  async me(): Promise<{ user: UserDto | null }> {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { user: null };
    return {
      user: {
        id: data.user.id,
        email: data.user.email ?? "",
        createdAt: data.user.created_at,
      },
    };
  },

  async signup(body: {
    email: string;
    loginPassword: string;
    kdfSalt: string;
    encryptedDek: string;
    dekNonce: string;
    kdfOpsLimit: number;
    kdfMemLimit: number;
  }): Promise<{ id: string; email: string }> {
    const { data, error } = await supabase.auth.signUp({
      email: body.email,
      password: body.loginPassword,
    });
    if (error) throw new Error(error.message);
    const user = data.user;
    if (!user) throw new Error("Sign up failed");
    // Requires an active session (email confirmation must be OFF) so the RLS
    // "own keys" policy passes on insert.
    if (!data.session) {
      throw new Error(
        "Account created, but email confirmation is enabled. Disable " +
          '"Confirm email" in Supabase Auth settings for this zero-knowledge ' +
          "flow, then sign up again."
      );
    }
    const { error: keyErr } = await supabase.from("user_keys").insert({
      user_id: user.id,
      kdf_salt: body.kdfSalt,
      encrypted_dek: body.encryptedDek,
      dek_nonce: body.dekNonce,
      kdf_ops_limit: body.kdfOpsLimit,
      kdf_mem_limit: body.kdfMemLimit,
    });
    if (keyErr) throw new Error(keyErr.message);
    return { id: user.id, email: user.email ?? body.email };
  },

  async login(body: {
    email: string;
    loginPassword: string;
  }): Promise<{ id: string; email: string }> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.loginPassword,
    });
    if (error || !data.user) throw new Error("Invalid email or password.");
    return { id: data.user.id, email: data.user.email ?? body.email };
  },

  async logout(): Promise<{ ok: boolean }> {
    await supabase.auth.signOut();
    return { ok: true };
  },

  async getKeys(): Promise<KeyMaterialDto> {
    const uid = await currentUserId();
    const { data, error } = await supabase
      .from("user_keys")
      .select(
        "kdf_salt, encrypted_dek, dek_nonce, kdf_ops_limit, kdf_mem_limit"
      )
      .eq("user_id", uid)
      .single();
    if (error || !data) {
      throw new Error("Key material not found. Your account may be corrupt.");
    }
    return {
      kdfSalt: data.kdf_salt,
      encryptedDek: data.encrypted_dek,
      dekNonce: data.dek_nonce,
      kdfOpsLimit: data.kdf_ops_limit,
      kdfMemLimit: data.kdf_mem_limit,
    };
  },

  async rotateKeys(body: {
    kdfSalt: string;
    encryptedDek: string;
    dekNonce: string;
    kdfOpsLimit: number;
    kdfMemLimit: number;
  }): Promise<{ ok: boolean }> {
    const uid = await currentUserId();
    const { error } = await supabase
      .from("user_keys")
      .update({
        kdf_salt: body.kdfSalt,
        encrypted_dek: body.encryptedDek,
        dek_nonce: body.dekNonce,
        kdf_ops_limit: body.kdfOpsLimit,
        kdf_mem_limit: body.kdfMemLimit,
      })
      .eq("user_id", uid);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  async listNotes(): Promise<{ notes: NoteDto[] }> {
    const { data, error } = await supabase
      .from("notes")
      .select(NOTE_COLS)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { notes: (data ?? []).map(mapNote) };
  },

  async createNote(body: {
    ciphertext: string;
    nonce: string;
  }): Promise<{ note: NoteDto }> {
    const uid = await currentUserId();
    const { data, error } = await supabase
      .from("notes")
      .insert({ user_id: uid, ciphertext: body.ciphertext, nonce: body.nonce })
      .select(NOTE_COLS)
      .single();
    if (error || !data) throw new Error(error?.message ?? "Create failed");
    return { note: mapNote(data) };
  },

  async updateNote(
    id: string,
    body: { ciphertext: string; nonce: string }
  ): Promise<{ note: NoteDto }> {
    const { data, error } = await supabase
      .from("notes")
      .update({ ciphertext: body.ciphertext, nonce: body.nonce })
      .eq("id", id)
      .select(NOTE_COLS)
      .single();
    if (error || !data) throw new Error(error?.message ?? "Update failed");
    return { note: mapNote(data) };
  },

  async deleteNote(id: string): Promise<{ ok: boolean }> {
    const { error } = await supabase.from("notes").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};
