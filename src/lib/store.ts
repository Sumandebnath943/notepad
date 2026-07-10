/**
 * Auth + crypto session store (Zustand).
 *
 * SECURITY INVARIANTS:
 *   - `dek` (CryptoKey) lives ONLY in this store, i.e. in JS memory. It is
 *     never written to localStorage / sessionStorage / a cookie.
 *   - On `lock()` or `logout()`, `dek` is dropped to null, immediately making
 *     every note undecryptable until the master password is re-entered.
 *   - The master password itself is never stored; it is used ephemerally to
 *     derive the Master Key, which unwraps the DEK, then discarded.
 *   - Auto-lock fires after `lockTimeoutMs` of inactivity, or on tab close.
 */

import { create } from "zustand";
import {
  api,
  type KeyMaterialDto,
  type NoteDto,
  type UserDto,
} from "@/lib/supabase-data";
import {
  ARGON2_MEM_COST,
  ARGON2_TIME_COST,
  base64ToBytes,
  bytesToBase64,
  createAndWrapDek,
  decryptNote,
  deriveMasterKey,
  encryptNote,
  importAesKey,
  randomSalt,
  unwrapDek,
  type NotePlaintext,
} from "@/lib/crypto";

export type AuthStatus =
  | "loading"
  | "unauthenticated"
  | "authenticated-locked" // logged in, DEK not in memory
  | "unlocked"; // DEK in memory, ready to use

export interface DecryptedNote extends NotePlaintext {
  id: string;
  createdAt: string;
  updatedAt: string;
}

interface AuthState {
  status: AuthStatus;
  user: UserDto | null;
  keyMaterial: KeyMaterialDto | null;
  dek: CryptoKey | null;
  notes: DecryptedNote[];
  notesLoading: boolean;
  lastActivity: number;
  lockTimeoutMs: number;
  error: string | null;

  init: () => Promise<void>;
  signup: (params: {
    email: string;
    loginPassword: string;
    masterPassword: string;
  }) => Promise<void>;
  login: (params: { email: string; loginPassword: string }) => Promise<void>;
  logout: () => Promise<void>;
  unlock: (masterPassword: string) => Promise<void>;
  lock: () => void;
  setLockTimeout: (ms: number) => void;
  touchActivity: () => void;
  refreshNotes: () => Promise<void>;
  createNote: (title: string, body: string) => Promise<DecryptedNote | null>;
  updateNote: (id: string, title: string, body: string) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  rotateMasterPassword: (
    currentMaster: string,
    newMaster: string
  ) => Promise<void>;
  clearError: () => void;
}

let autoLockTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutoLock(get: () => AuthState, set: (p: Partial<AuthState>) => void) {
  if (autoLockTimer) clearTimeout(autoLockTimer);
  const { status, lockTimeoutMs } = get();
  if (status !== "unlocked") return;
  autoLockTimer = setTimeout(() => {
    // Only lock if still unlocked and no activity in the window.
    set({ dek: null, status: "authenticated-locked", notes: [] });
  }, lockTimeoutMs);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "loading",
  user: null,
  keyMaterial: null,
  dek: null,
  notes: [],
  notesLoading: false,
  lastActivity: Date.now(),
  lockTimeoutMs: 5 * 60 * 1000, // 5 minutes default
  error: null,

  async init() {
    try {
      const { user } = await api.me();
      if (user) {
        set({ user, status: "authenticated-locked" });
        // Pre-fetch key material so the unlock screen is ready immediately.
        try {
          const km = await api.getKeys();
          set({ keyMaterial: km });
        } catch {
          /* ignore — unlock will retry */
        }
      } else {
        set({ user: null, status: "unauthenticated" });
      }
    } catch {
      set({ user: null, status: "unauthenticated" });
    }
  },

  async signup({ email, loginPassword, masterPassword }) {
    set({ error: null });
    try {
      // 1. Generate a unique salt and derive the Master Key (Argon2id).
      const salt = randomSalt();
      const mkBytes = await deriveMasterKey(masterPassword, salt);
      const masterKey = await importAesKey(mkBytes);
      mkBytes.fill(0); // zero raw key material ASAP

      // 2. Create a random DEK and wrap it with the Master Key.
      const { encrypted, dek } = await createAndWrapDek(masterKey);

      // 3. Send only ciphertext/salt/login-hash to the server.
      const user = await api.signup({
        email,
        loginPassword,
        kdfSalt: bytesToBase64(salt),
        encryptedDek: encrypted.encryptedDek,
        dekNonce: encrypted.dekNonce,
        kdfOpsLimit: ARGON2_TIME_COST,
        kdfMemLimit: ARGON2_MEM_COST,
      });

      set({
        user,
        status: "unlocked",
        dek,
        keyMaterial: {
          kdfSalt: bytesToBase64(salt),
          encryptedDek: encrypted.encryptedDek,
          dekNonce: encrypted.dekNonce,
          kdfOpsLimit: ARGON2_TIME_COST,
          kdfMemLimit: ARGON2_MEM_COST,
        },
        lastActivity: Date.now(),
      });
      scheduleAutoLock(get, set);
      // Pre-load notes for the fresh session.
      void get().refreshNotes();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign up failed";
      set({ error: msg });
      throw e;
    }
  },

  async login({ email, loginPassword }) {
    set({ error: null });
    try {
      const user = await api.login({ email, loginPassword });
      // Fetch key material so the unlock screen is ready.
      let km: KeyMaterialDto | null = null;
      try {
        km = await api.getKeys();
      } catch {
        /* will retry on unlock */
      }
      set({
        user,
        keyMaterial: km,
        status: "authenticated-locked",
        dek: null,
        notes: [],
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Login failed";
      set({ error: msg });
      throw e;
    }
  },

  async logout() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    if (autoLockTimer) clearTimeout(autoLockTimer);
    set({
      user: null,
      keyMaterial: null,
      dek: null,
      notes: [],
      status: "unauthenticated",
      error: null,
    });
  },

  async unlock(masterPassword) {
    set({ error: null });
    try {
      let km = get().keyMaterial;
      if (!km) {
        km = await api.getKeys();
        set({ keyMaterial: km });
      }
      const salt = base64ToBytes(km.kdfSalt);
      // Use the exact KDF params recorded for this user (strong defaults).
      const memCost = km.kdfMemLimit || ARGON2_MEM_COST;
      const timeCost = km.kdfOpsLimit || ARGON2_TIME_COST;
      const mkBytes = await deriveMasterKey(masterPassword, salt, {
        memCost,
        timeCost,
      });
      const masterKey = await importAesKey(mkBytes);
      mkBytes.fill(0);

      // This throws if the master password is wrong (AES-GCM auth tag fails).
      const dek = await unwrapDek(
        masterKey,
        km.encryptedDek,
        km.dekNonce
      );

      set({
        dek,
        status: "unlocked",
        lastActivity: Date.now(),
        error: null,
      });
      scheduleAutoLock(get, set);
      // Decrypt the note list now that we have the DEK.
      void get().refreshNotes();
    } catch (e) {
      // Don't leak whether it was a wrong password vs. corruption — but a wrong
      // password is by far the most common cause.
      set({ error: "Incorrect master password, or your data is corrupted." });
      throw e;
    }
  },

  lock() {
    if (autoLockTimer) clearTimeout(autoLockTimer);
    set({ dek: null, notes: [], status: "authenticated-locked" });
  },

  setLockTimeout(ms) {
    set({ lockTimeoutMs: ms });
    scheduleAutoLock(get, set);
  },

  touchActivity() {
    set({ lastActivity: Date.now() });
    scheduleAutoLock(get, set);
  },

  async refreshNotes() {
    const { dek } = get();
    if (!dek) return;
    set({ notesLoading: true });
    try {
      const { notes } = await api.listNotes();
      const decrypted: DecryptedNote[] = [];
      for (const n of notes) {
        try {
          const pt = await decryptNote(dek, {
            ciphertext: n.ciphertext,
            nonce: n.nonce,
          });
          decrypted.push({
            id: n.id,
            title: pt.title,
            body: pt.body,
            createdAt: n.createdAt,
            updatedAt: n.updatedAt,
          });
        } catch {
          // A single undecryptable note shouldn't break the whole list.
          decrypted.push({
            id: n.id,
            title: "[Undecryptable note]",
            body: "This note could not be decrypted. It may have been tampered with.",
            createdAt: n.createdAt,
            updatedAt: n.updatedAt,
          });
        }
      }
      // Newest first by updatedAt (server already sorts, but be safe).
      decrypted.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      set({ notes: decrypted, notesLoading: false });
    } catch (e) {
      set({ notesLoading: false });
      throw e;
    }
  },

  async createNote(title, body) {
    const { dek } = get();
    if (!dek) throw new Error("Vault is locked");
    const enc = await encryptNote(dek, { title, body });
    const { note } = await api.createNote(enc);
    const created: DecryptedNote = {
      id: note.id,
      title,
      body,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
    set((s) => ({ notes: [created, ...s.notes] }));
    get().touchActivity();
    return created;
  },

  async updateNote(id, title, body) {
    const { dek } = get();
    if (!dek) throw new Error("Vault is locked");
    const enc = await encryptNote(dek, { title, body });
    const { note } = await api.updateNote(id, enc);
    set((s) => ({
      notes: s.notes.map((n) =>
        n.id === id
          ? { ...n, title, body, updatedAt: note.updatedAt }
          : n
      ),
    }));
    get().touchActivity();
  },

  async deleteNote(id) {
    await api.deleteNote(id);
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
    get().touchActivity();
  },

  async rotateMasterPassword(currentMaster, newMaster) {
    // Verify current password by deriving MK and re-unwrapping DEK.
    const km = get().keyMaterial;
    if (!km) throw new Error("No key material available");
    const salt = base64ToBytes(km.kdfSalt);
    const mkBytes = await deriveMasterKey(currentMaster, salt, {
      memCost: km.kdfMemLimit || ARGON2_MEM_COST,
      timeCost: km.kdfOpsLimit || ARGON2_TIME_COST,
    });
    const oldMk = await importAesKey(mkBytes);
    mkBytes.fill(0);
    const dek = await unwrapDek(oldMk, km.encryptedDek, km.dekNonce);

    // Re-wrap the SAME DEK with a fresh salt + new Master Key.
    const newSalt = randomSalt();
    const newMkBytes = await deriveMasterKey(newMaster, newSalt);
    const newMk = await importAesKey(newMkBytes);
    newMkBytes.fill(0);

    // Export DEK bytes to re-wrap. (The DEK CryptoKey is non-extractable, so we
    // re-encrypt by using the DEK to encrypt a known payload? No — simpler: we
    // already have the DEK in memory as a CryptoKey but it's non-extractable.
    // To re-wrap we need the raw DEK. Approach: re-derive nothing; instead, we
    // decrypt the OLD wrapped DEK to get raw DEK bytes via unwrapDekRaw.)
    const rawDek = await unwrapDekRaw(oldMk, km.encryptedDek, km.dekNonce);
    const newNonce = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: newNonce },
      newMk,
      rawDek
    );
    const newEncryptedDek = bytesToBase64(new Uint8Array(ct));
    const newDekNonce = bytesToBase64(newNonce);
    rawDek.fill(0);

    await api.rotateKeys({
      kdfSalt: bytesToBase64(newSalt),
      encryptedDek: newEncryptedDek,
      dekNonce: newDekNonce,
      kdfOpsLimit: ARGON2_TIME_COST,
      kdfMemLimit: ARGON2_MEM_COST,
    });

    set({
      dek,
      keyMaterial: {
        kdfSalt: bytesToBase64(newSalt),
        encryptedDek: newEncryptedDek,
        dekNonce: newDekNonce,
        kdfOpsLimit: ARGON2_TIME_COST,
        kdfMemLimit: ARGON2_MEM_COST,
      },
    });
    get().touchActivity();
  },

  clearError() {
    set({ error: null });
  },
}));

// Helper that returns the RAW DEK bytes (used only during rotation).
async function unwrapDekRaw(
  masterKey: CryptoKey,
  encryptedDek: string,
  dekNonce: string
): Promise<Uint8Array> {
  const ct = base64ToBytes(encryptedDek);
  const nonce = base64ToBytes(dekNonce);
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, masterKey, ct)
  );
}
