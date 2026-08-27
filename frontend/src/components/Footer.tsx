import { DocAnalyticaLogo } from "@/components/Logo";

// Deliberately quiet, per PLAN.md section 7.4.
export function Footer() {
  return (
    <footer className="flex flex-col items-center gap-1.5 border-t border-hairline px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 text-center">
      <span className="text-[11px] uppercase tracking-wide text-ink-muted">Made by</span>
      <a
        href="https://docanalytica.vercel.app/"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 opacity-80 transition-opacity hover:opacity-100"
      >
        <DocAnalyticaLogo />
        <span className="text-sm font-semibold text-ink">DOC Analytica</span>
      </a>
    </footer>
  );
}
