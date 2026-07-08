import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--color-canvas) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        aqua: "rgb(var(--color-aqua) / <alpha-value>)",
        lagoon: "rgb(var(--color-lagoon) / <alpha-value>)",
        limepop: "rgb(var(--color-limepop) / <alpha-value>)",
        coral: "rgb(var(--color-coral) / <alpha-value>)",
        cloud: "rgb(var(--color-cloud) / <alpha-value>)"
      },
      boxShadow: {
        soft: "0 24px 70px rgba(28, 45, 55, 0.12)",
        lift: "0 18px 40px rgba(28, 45, 55, 0.16)"
      },
      borderRadius: {
        "studio-sm": "1rem",
        studio: "1.5rem",
        "studio-lg": "2rem",
        "studio-xl": "2.6rem"
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "ui-sans-serif", "system-ui"]
      }
    }
  },
  plugins: []
};

export default config;
