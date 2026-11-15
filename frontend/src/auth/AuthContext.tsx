import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi, meApi } from "@/api";
import { UNAUTHORIZED_EVENT, readStoredToken, storeToken } from "@/api/client";
import type { LoginUser, Role, Student } from "@/api/types";

interface AuthState {
  /** Null while signed out. */
  user: LoginUser | null;
  /** Student profile for role Student (id is the student id used by rooms); null otherwise. */
  student: Student | null;
  /** True until the stored session has been checked on first load. */
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginUser>;
  logout: () => void;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LoginUser | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (u: LoginUser) => {
    setUser(u);
    setStudent(u.roles.includes("Student") ? await meApi.student().catch(() => null) : null);
  }, []);

  const logout = useCallback(() => {
    storeToken(null);
    setUser(null);
    setStudent(null);
  }, []);

  // Restore the session from storage on first load.
  useEffect(() => {
    if (!readStoredToken()) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then(loadProfile)
      .catch(logout)
      .finally(() => setLoading(false));
  }, [loadProfile, logout]);

  // Any 401 from the API signs the user out.
  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, logout);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, logout);
  }, [logout]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await authApi.login(email, password);
      storeToken({ accessToken: result.accessToken, expiresAt: result.expiresAt });
      await loadProfile(result.user);
      return result.user;
    },
    [loadProfile],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      student,
      loading,
      login,
      logout,
      hasRole: (...roles) => !!user && roles.some((r) => user.roles.includes(r)),
    }),
    [user, student, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Landing page for a role after login. */
export function homePathFor(user: LoginUser): string {
  if (user.roles.includes("Student")) return "/student/courses";
  return "/staff/courses";
}
