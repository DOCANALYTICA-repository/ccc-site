import { DocAnalyticaLogo } from "@/components/Logo";

// Deliberately quiet, per PLAN.md section 7.4.
export function Footer() {
  return (
    <footer className="flex flex-col items-center gap-1.5 border-t border-hairline px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 text-center">
      <span className="text-[11px] uppercase tracking-wide text-ink-muted">Made by</span>
      <a href="#" target="_blank" rel="noreferrer" className="opacity-80 transition-opacity hover:opacity-100">
        <DocAnalyticaLogo />
      </a>
    </footer>
  );
}
