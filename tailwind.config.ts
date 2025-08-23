import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./pages/**/*.{ts,tsx}",   // pages を使っていなくても入れてOK
  ],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;