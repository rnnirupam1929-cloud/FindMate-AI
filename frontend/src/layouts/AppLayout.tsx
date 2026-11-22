import { useQuery } from "@tanstack/react-query";
import { Bell, FilePlus2, LayoutDashboard, ListChecks, LogOut, Map, Menu, PackageSearch, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { Api } from "@/services/endpoints";
import { cn } from "@/utils/cn";

export function AppLayout() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const notes = useQuery({ queryKey: ["notifications", "unread"], queryFn: () => Api.notifications(true), refetchInterval: 30_000 });
  const unread = notes.data?.unread ?? 0;
  const staff = user?.role === "admin" || user?.role === "verification_agent";

  const items = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/report/lost", label: "Report lost item", icon: Search },
    { to: "/report/found", label: "I found something", icon: PackageSearch },
    { to: "/reports", label: "My reports", icon: FilePlus2 },
    { to: "/matches", label: "Matches", icon: Sparkles },
    { to: "/verifications", label: "Verifications", icon: ShieldCheck },
    { to: "/map", label: "Map", icon: Map },
    { to: "/notifications", label: "Notifications", icon: Bell, badge: unread },
    ...(staff ? [{ to: "/admin", label: "Admin", icon: ListChecks }] : []),
  ];

  const links = (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map(({ to, label, icon: I, badge }) => (
        <NavLink key={to} to={to} end={to === "/dashboard"} className={({ isActive }) => cn("flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold", isActive ? "bg-mint text-forest" : "text-ink hover:bg-mint/60")}>
          <I className="h-[18px] w-[18px]" aria-hidden />{label}
          {!!badge && <span className="ml-auto rounded-full bg-sun px-2 text-xs font-bold text-forest" aria-label={`${badge} unread`}>{badge}</span>}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-stone-300 bg-white p-4 lg:flex">
        <Logo className="mb-6 px-2" />
        {links}
        <div className="mt-auto border-t border-stone-200 pt-4">
          <p className="truncate px-2 text-sm font-bold">{user?.full_name || "Your account"}</p>
          <p className="truncate px-2 text-xs text-stone">{user?.email}</p>
          <p className="px-2 text-xs capitalize text-stone">{user?.role.replace("_", " ")}</p>
          <Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={async () => { await signOut(); nav("/"); }}><LogOut className="h-4 w-4" />Log out</Button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-stone-300 bg-white px-4 lg:hidden">
          <Logo />
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild aria-label="Notifications"><NavLink to="/notifications" className="relative"><Bell className="h-5 w-5" />{unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-sun px-1.5 text-[10px] font-bold text-forest">{unread}</span>}</NavLink></Button>
            <Button variant="ghost" size="sm" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen(!open)}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</Button>
          </div>
        </header>
        {open && (
          <div id="mobile-menu" className="fixed inset-x-0 bottom-0 top-14 z-20 overflow-y-auto bg-white p-4 lg:hidden">
            {links}
            <Button variant="secondary" className="mt-4 w-full" onClick={async () => { await signOut(); nav("/"); }}><LogOut className="h-4 w-4" />Log out</Button>
          </div>
        )}
        <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-10" id="main"><Outlet /></main>
      </div>
    </div>
  );
}
