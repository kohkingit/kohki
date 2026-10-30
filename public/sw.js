// ホーム画面に追加（PWA）するための最小限の Service Worker。
// シートのデータは常に最新を見たいので、何もキャッシュしない。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
