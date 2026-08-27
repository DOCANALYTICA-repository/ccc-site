import { useTheme } from "@/hooks/useTheme";

// Two <img> elements toggled by CSS, not display:none swap on a single
// element — both are preloaded so there's no flash on theme change.
// See PLAN.md section 7.4.
//
// The real lockup (shield + "CCC" + tagline) is tall/portrait, so it only
// reads at a decent size. `variant="mark"` crops to just the shield for
// tight spaces (nav rail, mobile top bar); `variant="full"` is the whole
// lockup for spacious placements (login page).
export function CccLogo({
  className,
  variant = "mark",
}: {
  className?: string;
  variant?: "mark" | "full";
}) {
  const { theme } = useTheme();
  const file = variant === "full" ? "ccc-logo" : "ccc-mark";
  return (
    <img
      src={`/brand/${file}-${theme}.png`}
      alt="CCC — For the Top 1%"
      className={className ?? "h-9 w-auto"}
    />
  );
}

export function DocAnalyticaLogo({ className }: { className?: string }) {
  const { theme } = useTheme();
  return (
    <img
      src={theme === "dark" ? "/brand/doc-analytica-dark.png" : "/brand/doc-analytica-light.png"}
      alt="DOC Analytica"
      className={className ?? "h-12 w-auto sm:h-14"}
    />
  );
}
