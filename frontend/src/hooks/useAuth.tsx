import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { clearQueryCache } from "@/lib/queryCache";
import type { AuthedUser } from "@/lib/types";

interface AuthContextValue {
  user: AuthedUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthedUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const { user } = await api.get<{ user: AuthedUser }>("/auth/me");
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(identifier: string, password: string) {
    const { user } = await api.post<{ user: AuthedUser }>("/auth/login", { identifier, password });
    // Whatever the previous session cached belongs to a different account.
    clearQueryCache();
    setUser(user);
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    const { user } = await api.post<{ user: AuthedUser }>("/auth/change-password", { currentPassword, newPassword });
    setUser(user);
  }

  async function logout() {
    await api.post("/auth/logout");
    clearQueryCache();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, changePassword, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export { ApiError };
