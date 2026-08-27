import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

// Primary is BLACK, not orange — the reference's "Call" button, and the
// brand orange fails AA at body-text weight. See PLAN.md section 7.2.
const variants: Record<Variant, string> = {
  primary: "bg-ink text-page hover:opacity-90",
  secondary: "bg-surface text-ink border border-hairline hover:bg-page",
  ghost: "bg-transparent text-ink hover:bg-surface",
  danger: "bg-[#c10801] text-white hover:opacity-90",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-12 px-4 text-sm tap-target",
  lg: "h-12 px-5 text-base tap-target",
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
