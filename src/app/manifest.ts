import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "次どこ行く？ こうきのやること",
    short_name: "やること",
    description: "@tsugi_doko47 の運用で、こうきがやる作業だけをまとめた画面",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3f6f5",
    theme_color: "#1b6972",
    lang: "ja",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
