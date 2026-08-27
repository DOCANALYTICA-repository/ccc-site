import { useEffect, useState, type ComponentType } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Bell, BookOpen, CalendarDays, CircleUserRound, ContactRound, Home, LogOut, Menu, MessageCircle, Moon, Network, Sun, UsersRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { CccLogo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api";

interface NavItem { to: string; label: string; icon: ComponentType<{ className?: string }>; }

const INTERNAL_ITEMS: NavItem[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/events", label: "Events", icon: CalendarDays },
  { to: "/contacts", label: "Contacts", icon: ContactRound },
  { to: "/network", label: "Community", icon: UsersRound },
  { to: "/admin", label: "More", icon: Menu },
];

const COMMUNITY_ITEMS: NavItem[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/network", label: "Network", icon: Network },
  { to: "/messages", label: "Messages", icon: MessageCircle },
  { to: "/courses", label: "Courses", icon: BookOpen },
  { to: "/profile", label: "Profile", icon: CircleUserRound },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const internal = user?.role === "ADMIN" || user?.role === "STAFF";
  const items = internal ? INTERNAL_ITEMS : COMMUNITY_ITEMS;

  useEffect(() => {
    api.get<{ unread: number }>("/notifications?limit=1").then((r) => setUnread(r.unread)).catch(() => undefined);
  }, [location.pathname]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-page sm:flex-row">
      <nav aria-label="Primary" className="hidden shrink-0 flex-col gap-1 overflow-y-auto border-r border-hairline bg-surface px-2 py-4 sm:flex sm:w-16 lg:w-60 lg:px-3">
        <div className="mb-6 flex items-center justify-center px-1 lg:justify-start lg:px-2"><CccLogo className="h-8 w-auto lg:h-9" /></div>
        {items.map((item) => <ShellLink key={item.to} item={item} desktop />)}
        <NavLink to="/notifications" className={({ isActive }) => cn("relative flex items-center gap-3 rounded-control border-l-4 px-2 py-2.5 text-sm font-medium tap-target lg:px-3", isActive ? "border-accent bg-ink text-page" : "border-transparent text-ink hover:bg-page")}>
          <Bell className="h-5 w-5" aria-hidden />
          <span className="hidden lg:inline">Notifications</span>
          {unread > 0 && <span className="ml-auto rounded-full bg-accent-ink px-1.5 py-0.5 text-[10px] font-semibold text-white">{unread}</span>}
        </NavLink>
        <div className="mt-auto flex flex-col gap-1">
          <button onClick={toggle} className="flex items-center gap-3 rounded-control px-2 py-2.5 text-sm font-medium text-ink hover:bg-page tap-target lg:px-3">
            {theme === "dark" ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
            <span className="hidden lg:inline">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
          <button onClick={() => logout()} className="flex items-center gap-3 rounded-control px-2 py-2.5 text-sm font-medium text-ink-muted hover:bg-page tap-target lg:px-3">
            <LogOut className="h-5 w-5" aria-hidden /><span className="hidden lg:inline">Sign out ({user?.name})</span>
          </button>
        </div>
      </nav>

      <header className="flex items-center justify-between border-b border-hairline bg-surface px-4 py-3 sm:hidden">
        <CccLogo className="h-7 w-auto" />
        <div className="flex items-center gap-1">
          <NavLink to="/notifications" aria-label={`Notifications, ${unread} unread`} className="relative flex h-11 w-11 items-center justify-center rounded-control text-ink">
            <Bell className="h-5 w-5" aria-hidden />
            {unread > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent" />}
          </NavLink>
          <button onClick={toggle} className="flex h-11 w-11 items-center justify-center rounded-control text-ink" aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <img src={`/brand/ccc-mark-${theme}.png`} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-contain p-10 opacity-[0.05] sm:p-16" />
          <div className="relative h-full overflow-y-auto pb-24 sm:pb-0">
            <div key={location.pathname} className="mx-auto w-full max-w-[1600px] animate-page-in px-4 py-5 sm:px-6 sm:py-6 lg:px-8"><Outlet /></div>
          </div>
        </div>
        <div className="shrink-0 pb-20 sm:pb-0"><Footer /></div>
      </main>

      <nav aria-label="Mobile primary" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-hairline bg-surface pb-safe-b sm:hidden">
        {items.map((item) => <ShellLink key={item.to} item={item} />)}
      </nav>
    </div>
  );
}

function ShellLink({ item, desktop = false }: { item: NavItem; desktop?: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink to={item.to} end={item.to === "/"} className={({ isActive }) => desktop
      ? cn("flex items-center gap-3 rounded-control border-l-4 px-2 py-2.5 text-sm font-medium tap-target lg:px-3", isActive ? "border-accent bg-ink text-page" : "border-transparent text-ink hover:bg-page")
      : cn("flex min-w-0 flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium tap-target", isActive ? "text-accent-ink" : "text-ink-muted")}>
      <Icon className="h-5 w-5 shrink-0" aria-hidden /><span className={desktop ? "hidden lg:inline" : "truncate"}>{item.label}</span>
    </NavLink>
  );
}
