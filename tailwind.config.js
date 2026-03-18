/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        pulse: {
          bg: "#0a0a12",
          surface: "#111119",
          border: "#1c1c2e",
          "border-hover": "#2d2d4a",
          accent: "#6366f1",
          "accent-light": "#818cf8",
          "accent-glow": "rgba(99, 102, 241, 0.15)",
          success: "#22c55e",
          warning: "#eab308",
          danger: "#ef4444",
          orange: "#f97316",
        },
      },
      fontFamily: {
        display: ['"Outfit"', "system-ui", "sans-serif"],
        body: ['"DM Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Fira Code"', "monospace"],
      },
    },
  },
  plugins: [],
};
