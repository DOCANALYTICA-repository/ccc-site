import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { Role } from "@/lib/types";

export function ProtectedRoute({ roles, allowPasswordChange = false }: { roles?: Role[]; allowPasswordChange?: boolean }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex min-h-dvh items-center justify-center text-sm text-ink-muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword && !allowPasswordChange) return <Navigate to="/change-password" replace />;
  if (!user.mustChangePassword && allowPasswordChange) return <Navigate to="/" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return <Outlet />;
}
