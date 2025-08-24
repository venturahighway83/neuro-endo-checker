// tailwind.config.ts — 修正済み（そのまま置換コピペ用）
// ポイント: darkMode は 'class' の「文字列」指定にする。型: Config に適合させる。


import type { Config } from "tailwindcss";


const config = {
  darkMode: 'class',              // ← 文字列にする（または ['class', '.dark']）
  content: [
    './app/**/*.{ts,tsx,js,jsx}',
    './components/**/*.{ts,tsx,js,jsx}',
    './pages/**/*.{ts,tsx,js,jsx}', // pages を使っている場合のみ
  ],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;

export default config;

/*
// カスタムセレクタを使う場合の例（置き換え用）
const config: Config = {
darkMode: ["class", ".dark"],
content: [
"./app/**/*.{ts,tsx,js,jsx}",
"./components/**/*.{ts,tsx,js,jsx}",
"./pages/**/*.{ts,tsx,js,jsx}",
],
theme: { extend: {} },
plugins: [],
};
export default config;
*/


