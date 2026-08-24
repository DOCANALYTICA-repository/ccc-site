/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Tokens per PLAN.md section 7.2. Defined as CSS custom properties in
      // index.css so a theme toggle is a class swap, not a rebuild.
      colors: {
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        ink: "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        hairline: "var(--hairline)",
        surface: "var(--surface)",
        page: "var(--page)",
        "status-unconfirmed-bg": "var(--status-unconfirmed-bg)",
        "status-unconfirmed-fg": "var(--status-unconfirmed-fg)",
        "status-confirmed-bg": "var(--status-confirmed-bg)",
        "status-confirmed-fg": "var(--status-confirmed-fg)",
        "status-arrived-bg": "var(--status-arrived-bg)",
        "status-arrived-fg": "var(--status-arrived-fg)",
      },
      borderRadius: {
        card: "24px",
        control: "12px",
      },
      boxShadow: {
        panel: "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px -8px rgba(0,0,0,0.12)",
      },
      fontFamily: {
        // System stack, no external font fetch — the gate check-in screen
        // (PLAN.md section 7.6) has to work on bad venue wifi.
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "'Helvetica Neue'",
          "Arial",
          "sans-serif",
        ],
      },
      spacing: {
        "safe-b": "env(safe-area-inset-bottom)",
        "safe-t": "env(safe-area-inset-top)",
      },
      minHeight: {
        dvh: "100dvh",
      },
    },
  },
  plugins: [],
};
