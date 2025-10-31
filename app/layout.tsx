import type { Metadata } from "next";
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";

const geistSans = Geist({ subsets: ["latin"] });
const geistMono = Geist_Mono({ subsets: ["latin"] });

const SITE_URL = "https://neuro-endo-checker-jl5j-five.vercel.app" as const;
const SITE_NAME = "Neuro-Endo Checker" as const;
const SITE_TITLE = "Neuro-Endo Checker｜脳血管内治療デバイス適合チェッカー" as const;
const SITE_DESC =
  "カテーテル径・長さ・組合せの適合性を可視化。TRA/DRAやフローダイバータ導入ルートの検討に役立つウェブツール。" as const;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESC,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESC,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESC,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        {/* ▼（任意）Search Console のメタ確認を使う場合は、下を有効化して値を入れてください */}
        {/** <meta name="google-site-verification" content="＜Search Consoleの文字列＞" /> **/}

        {/* JSON-LD（構造化データ） */}
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: SITE_NAME,
              applicationCategory: "MedicalApplication",
              operatingSystem: "Web",
              url: SITE_URL,
              description: SITE_DESC,
            }),
          }}
        />
      </head>
      <body className={`${geistSans.className} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
