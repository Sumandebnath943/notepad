/**
 * Thin API client. All calls go through here so error handling is uniform.
 * Keys/plaintext never appear in these payloads except where explicitly
 * noted (ciphertext is fine; master password is NOT sent).
 */

export class ApiError extends Error {
  status: number;
  data?: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    credentials: "same-origin",
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : "Request failed") || `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}

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

export const api = {
  signup: (body: {
    email: string;
    loginPassword: string;
    kdfSalt: string;
    encryptedDek: string;
    dekNonce: string;
    kdfOpsLimit: number;
    kdfMemLimit: number;
  }) =>
    request<{ id: string; email: string }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  login: (body: { email: string; loginPassword: string }) =>
    request<{ id: string; email: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  logout: () =>
    request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  me: () => request<{ user: UserDto | null }>("/api/auth/me"),

  getKeys: () => request<KeyMaterialDto>("/api/keys"),

  rotateKeys: (body: {
    kdfSalt: string;
    encryptedDek: string;
    dekNonce: string;
    kdfOpsLimit: number;
    kdfMemLimit: number;
  }) =>
    request<{ ok: boolean }>("/api/keys", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  listNotes: () => request<{ notes: NoteDto[] }>("/api/notes"),

  createNote: (body: { ciphertext: string; nonce: string }) =>
    request<{ note: NoteDto }>("/api/notes", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateNote: (id: string, body: { ciphertext: string; nonce: string }) =>
    request<{ note: NoteDto }>(`/api/notes/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  deleteNote: (id: string) =>
    request<{ ok: boolean }>(`/api/notes/${id}`, { method: "DELETE" }),
};
