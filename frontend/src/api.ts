const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface AuthedUser {
  id: number;
  name: string;
  role: "owner" | "editor" | "viewer";
}

function getToken(): string | null {
  return localStorage.getItem("ikorka_packaging_token");
}

export function setSession(token: string, user: AuthedUser) {
  localStorage.setItem("ikorka_packaging_token", token);
  localStorage.setItem("ikorka_packaging_user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("ikorka_packaging_token");
  localStorage.removeItem("ikorka_packaging_user");
}

export function getSessionUser(): AuthedUser | null {
  try {
    const raw = localStorage.getItem("ikorka_packaging_user");
    return raw ? (JSON.parse(raw) as AuthedUser) : null;
  } catch {
    return null;
  }
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearSession();
    window.location.reload();
    throw new ApiError("Сесія закінчилась", 401);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error || `Помилка запиту (${res.status})`, res.status);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export async function login(pin: string): Promise<{ token: string; user: AuthedUser }> {
  return request("/login", { method: "POST", body: JSON.stringify({ pin }) });
}
