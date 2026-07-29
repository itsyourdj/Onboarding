/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ['"IBM Plex Serif"', "ui-serif", "Georgia", "serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        // Role tokens (auto-swap with [data-theme])
        "bg-primary": "var(--color-bg-primary)",
        "bg-secondary": "var(--color-bg-secondary)",
        "bg-elevated": "var(--color-bg-elevated)",
        "bg-card": "var(--color-bg-card)",
        "fg-primary": "var(--color-fg-primary)",
        "fg-secondary": "var(--color-fg-secondary)",
        "action-primary": "var(--color-action-primary)",
        "brand-accent": "var(--color-brand-accent)",
        divider: "var(--color-divider)",
        "state-success": "var(--color-state-success)",
        "state-danger": "var(--color-state-danger)",
        "state-warning": "var(--color-state-warning)",
        "health-good": "var(--color-health-good)",
        "health-watch": "var(--color-health-watch)",
        "health-risk": "var(--color-health-risk)",
      },
      borderRadius: {
        pill: "9999px",
      },
      boxShadow: {
        card: "0 8px 24px rgba(0,0,0,0.06)",
        pop: "0 18px 44px rgba(0,0,0,0.11)",
        modal: "0 24px 48px rgba(0,0,0,0.18)",
      },
    },
  },
  plugins: [],
};
