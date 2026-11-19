import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: "var(--ground)",
        surface: "var(--surface)",
        panel: "var(--surface)",
        raised: "var(--raised)",
        active: "var(--active)",
        border: "var(--border)",
        rule: "var(--rule)",
        control: "var(--control)",
        text: "var(--text)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        "accent-tint": "var(--accent-tint)",
        positive: "var(--positive)",
        negative: "var(--negative)",
        warning: "var(--warning)",
        "chart-1": "var(--chart-1)",
        "chart-2": "var(--chart-2)",
        "chart-3": "var(--chart-3)",
        bg: "var(--ground)",
      },
      borderRadius: {
        card: "var(--radius-card)",
        control: "var(--radius-control)",
        sheet: "var(--radius-sheet)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "IBM Plex Sans", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
