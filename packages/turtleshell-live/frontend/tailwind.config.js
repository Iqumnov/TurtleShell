/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#f9f6f0",
        panel: "transparent",
        coal: "#faf7f5",
        sand: "#7c5c43",
        clay: "#a84e3b",
        sage: "#4e7052",
        border: "#e2ded7",
        tenant0: "#8fa2b8", // Slate Blue
        tenant1: "#b56b5c", // Rust
        tenant2: "#809c85", // Sage
        tenant3: "#cba358", // Ochre
        tenant4: "#9a8fa8", // Muted Lavender
        anomaly: "#a84c47", // Crimson
      },
      boxShadow: {
        premium: "none",
        glow: "none",
        glowRed: "none",
      }
    },
  },
  plugins: [],
}
