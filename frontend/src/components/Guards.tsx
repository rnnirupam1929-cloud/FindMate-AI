import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Spinner } from "@/components/ui/misc";

export function RequireAuth() {
  const { user, loading, sessionExpired } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner label="Checking your session" />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname, expired: sessionExpired }} />;
  return <Outlet />;
}

export function RequireRole({ roles }: { roles: string[] }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) {
    return <div className="py-20 text-center" role="alert"><h1 className="text-2xl font-extrabold">Access restricted</h1><p className="mt-2 text-sm text-stone">You don't have permission to view this page.</p></div>;
  }
  return <Outlet />;
}
