import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP, Zen_Maru_Gothic } from "next/font/google";
import "./globals.css";

const zen = Zen_Maru_Gothic({ weight: ["700", "900"], subsets: ["latin"], variable: "--font-zen", display: "swap", preload: false });
const noto = Noto_Sans_JP({ weight: ["400", "500", "700"], subsets: ["latin"], variable: "--font-noto", display: "swap", preload: false });

export const metadata: Metadata = {
  title: "こうきのやること",
  description: "次どこ行く？ @tsugi_doko47 の、こうきがやる作業だけをまとめた画面",
  applicationName: "こうきのやること",
  appleWebApp: { capable: true, title: "やること", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192" }], apple: "/apple-touch-icon.png" },
  robots: { index: false, follow: false },
  formatDetection: { telephone: false, date: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1c1e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${zen.variable} ${noto.variable}`}>
      <body>{children}</body>
    </html>
  );
}
