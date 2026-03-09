import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["var(--font-mono)", "JetBrains Mono", "Fira Code", "monospace"],
        heading: ["var(--font-heading)", "Space Mono", "monospace"],
      },
      colors: {
        terminal: {
          green: "#00ff41",
          "green-dim": "#00cc33",
          "green-dark": "#003300",
          "green-bg": "#001a00",
          black: "#000000",
          surface: "#0a0a0a",
          border: "#00ff4133",
        },
      },
      animation: {
        "boot-line": "boot-line 0.4s ease-out forwards",
        "cursor-blink": "cursor-blink 1s step-end infinite",
        flicker: "flicker 4s ease-in-out infinite",
        "pulse-green": "pulse-green 2s ease-in-out infinite",
        "grid-reveal": "grid-reveal 0.6s ease-out forwards",
        "slide-up": "slide-up 0.3s ease-out forwards",
      },
    },
  },
  plugins: [],
};
export default config;
