// tailwind.config.ts — 修正済み（そのまま置換コピペ用）
// ポイント: darkMode は 'class' の「文字列」指定にする。型: Config に適合させる。


import type { Config } from "tailwindcss";


const config = {
  darkMode: ['class', '.dark'],            
  content: [
    './app/**/*.{ts,tsx,js,jsx}',
    './components/**/*.{ts,tsx,js,jsx}',
    './pages/**/*.{ts,tsx,js,jsx}', // pages を使っている場合のみ
  ],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;

export default config;

