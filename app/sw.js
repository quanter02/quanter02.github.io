// 조교 도우미 오프라인 실행: 앱 화면은 저장해 두고, 서버 호출은 항상 인터넷으로 보낸다.
const CACHE = "tutor-app-v10";
const SHELL = ["./", "index.html", "manifest.webmanifest", "privacy.html", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // 화면은 새 버전 먼저, 안 되면 저장본
  // 브라우저 캐시(최대 10분)를 건너뛰고 서버에 새 버전이 있는지 먼저 확인
  e.respondWith(fetch(e.request, {cache: "no-cache"}).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});
