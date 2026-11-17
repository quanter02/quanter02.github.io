// 오락가락 설치형 실행: 앱 파일은 새 버전 먼저 → 안 되면 저장본.
// 버전이 고정된 손 인식 라이브러리·모델(jsdelivr, storage.googleapis)은 저장본 먼저 → 두 번째 실행부터 빠르게 열림.
// 카메라 영상과 기록은 여기서 다루지 않는다(브라우저 밖으로 보내지 않음).
const CACHE = "chord-app-v1";
const SHELL = ["./", "index.html", "manifest.webmanifest", "core.js?v=5", "shape.js?v=2", "mine.js?v=3", "track.js", "shape_model.json?v=1", "icons/icon-192.png", "icons/icon-512.png"];
const PINNED = ["cdn.jsdelivr.net", "storage.googleapis.com"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("chord-app-") && k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  if (PINNED.includes(u.hostname)) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })));
    return;
  }
  if (u.origin !== location.origin || !u.pathname.startsWith("/chord/")) return;
  e.respondWith(fetch(e.request, {cache: "no-cache"}).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});
