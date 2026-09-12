import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { AuthedUser } from "./api";
import { getSessionUser, setSession, clearSession, login as apiLogin } from "./api";

interface AuthContextValue {
  user: AuthedUser | null;
  login: (pin: string) => Promise<void>;
  logout: () => void;
  error: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthedUser | null>(getSessionUser());
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (pin: string) => {
    setError(null);
    try {
      const { token, user } = await apiLogin(pin);
      setSession(token, user);
      setUser(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка входу");
      throw e;
    }
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, login, logout, error }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
