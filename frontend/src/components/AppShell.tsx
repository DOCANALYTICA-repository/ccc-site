import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { CccLogo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { cn } from "@/lib/cn";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Home", icon: "⌂" },
  { to: "/contacts", label: "Contacts", icon: "☰" },
  { to: "/events", label: "Events", icon: "▤" },
  { to: "/import", label: "Import", icon: "⇩" },
  { to: "/users", label: "Users", icon: "⚙", adminOnly: true },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();

  const items = NAV_ITEMS.filter((i) => !i.adminOnly || user?.role === "ADMIN");

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-page sm:flex-row">
      {/* Desktop / tablet rail — always visible, own scroll region if it
          ever overflows (PLAN.md section 7.5) */}
      <nav className="hidden shrink-0 flex-col gap-1 overflow-y-auto border-r border-hairline bg-surface px-2 py-4 sm:flex sm:w-16 lg:w-56 lg:px-3">
        <div className="mb-6 flex items-center justify-center px-1 lg:justify-start lg:px-2">
          <CccLogo className="h-8 w-auto lg:h-9" />
        </div>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-control border-l-4 px-2 py-2.5 text-sm font-medium tap-target lg:px-3",
                isActive
                  ? "border-accent bg-ink text-page"
                  : "border-transparent text-ink hover:bg-page",
              )
            }
          >
            <span className="w-5 text-center text-base" aria-hidden>
              {item.icon}
            </span>
            <span className="hidden lg:inline">{item.label}</span>
          </NavLink>
        ))}

        <div className="mt-auto flex flex-col gap-1">
          <button
            onClick={toggle}
            className="flex items-center gap-3 rounded-control px-2 py-2.5 text-sm font-medium text-ink hover:bg-page tap-target lg:px-3"
          >
            <span className="w-5 text-center" aria-hidden>{theme === "dark" ? "☀" : "☾"}</span>
            <span className="hidden lg:inline">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
          <button
            onClick={() => logout()}
            className="flex items-center gap-3 rounded-control px-2 py-2.5 text-sm font-medium text-ink-muted hover:bg-page tap-target lg:px-3"
          >
            <span className="w-5 text-center" aria-hidden>⏻</span>
            <span className="hidden lg:inline">Sign out ({user?.name})</span>
          </button>
        </div>
      </nav>

      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b border-hairline bg-surface px-4 py-3 sm:hidden">
        <CccLogo className="h-7 w-auto" />
        <button onClick={toggle} className="tap-target rounded-control px-2 text-lg" aria-label="Toggle theme">
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </header>

      {/* Content scrolls in its own region; rail, top bar, and footer stay
          put — nothing but this middle strip should ever move. */}
      <main className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {/* Watermark — sized to the content pane only, so it never runs
              under the rail or the footer. Same asset as the nav mark; its
              own dark/light PNGs already read as a pale ghost on either
              page background, so no extra tinting is needed. */}
          <img
            src={`/brand/ccc-mark-${theme}.png`}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-contain p-10 opacity-[0.05] sm:p-16"
          />
          <div className="relative h-full overflow-y-auto pb-20 sm:pb-0">
            <div key={location.pathname} className="mx-auto w-full max-w-[1600px] animate-page-in px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
              <Outlet />
            </div>
          </div>
        </div>
        <div className="shrink-0 pb-20 sm:pb-0">
          <Footer />
        </div>
      </main>

      {/* Mobile bottom tab bar — PLAN.md section 7.5 */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-hairline bg-surface pb-safe-b sm:hidden">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium tap-target",
                isActive ? "text-accent-ink" : "text-ink-muted",
              )
            }
          >
            <span className="text-lg" aria-hidden>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
