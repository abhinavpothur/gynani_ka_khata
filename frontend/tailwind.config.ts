import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        background: '#FDFCF8', // Warm Alabaster (not blinding white)
        surface: '#FFFFFF',    // Pure White for cards
        foreground: '#111111', // Deep Charcoal (softer than pure black)
        accent: '#0033FF',     // Electric Blue (sharp, premium action color)
        alert: '#FF2A00',      // Vermilion (for debt/alerts)
      },
    },
  },
  plugins: [],
};
export default config;