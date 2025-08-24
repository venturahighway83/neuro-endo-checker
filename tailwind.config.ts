// tailwind.config.ts — 修正済み（そのまま置換コピペ用）
// ポイント: darkMode は 'class' の「文字列」指定にする。型: Config に適合させる。


import type { Config } from "tailwindcss";

const config = {
darkMode: ["class", '[data-theme="dark"]'], // 2 要素必須
content: [
"./app/**/*.{ts,tsx,js,jsx}",
"./components/**/*.{ts,tsx,js,jsx}",
"./pages/**/*.{ts,tsx,js,jsx}",
],
theme: { extend: {} },
plugins: [],
} satisfies Config;
export default config;

