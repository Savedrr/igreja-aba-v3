/* Igreja ABA — Service Worker v1 */
const CACHE = "igrejaaba-v1";
const ASSETS = [
  "/",
  "/app",
  "/static/css/app.css",
  "/static/js/app.js",
  "/static/favicon.ico",
  "/static/manifest.json"
];

// Instala e faz cache dos arquivos essenciais
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Ativa e limpa caches antigos
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Intercepta requests: rede primeiro, cache como fallback
self.addEventListener("fetch", e => {
  // Não faz cache de chamadas de API
  if (e.request.url.includes("/api/")) return;
  if (e.request.method !== "GET") return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Atualiza cache com versão nova
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
