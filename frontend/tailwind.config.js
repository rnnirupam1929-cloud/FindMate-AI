/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: { DEFAULT: "#153C32", 700: "#1c4a3d", 800: "#153C32", 900: "#0f2d25" },
        leaf: { DEFAULT: "#287A5B", 600: "#22694e" },
        mint: { DEFAULT: "#DFF2E7", 200: "#c9e8d6" },
        paper: "#F8F8F3",
        ink: "#242B27",
        stone: { DEFAULT: "#7D8982", 200: "#e3e6e1", 300: "#d2d7d1" },
        sun: { DEFAULT: "#E8C979", 100: "#f7edcf" },
        danger: "#B4423A",
      },
      fontFamily: { sans: ["'Manrope Variable'", "Inter", "system-ui", "sans-serif"] },
      borderRadius: { DEFAULT: "6px", md: "8px", lg: "10px" },
    },
  },
  plugins: [],
};
