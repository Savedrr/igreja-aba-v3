/* Igreja ABA — Service Worker v3 */
const CACHE = "igrejaaba-v3";

// Apenas assets estáticos seguros para cache (nunca HTML/páginas autenticadas)
const ASSETS = [
  "/static/css/app.css",
  "/static/js/app.js",
  "/static/favicon.ico"
];

// Instala e faz cache só dos assets estáticos
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {})
  );
});

// Ativa e limpa TODOS os caches antigos
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // NUNCA intercepta: API, métodos não-GET, navegação de páginas (HTML)
  if (e.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;
  // Deixa o navegador lidar com navegação de páginas (evita servir HTML errado/sem login)
  if (e.request.mode === "navigate") return;
  if (e.request.destination === "document") return;

  // Só trata assets estáticos com estratégia "rede primeiro, cache de apoio"
  if (url.pathname.startsWith("/static/")) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Só cacheia respostas válidas (status 200)
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
});
