// Service worker: permite abrir la app sin conexión.
// Estrategia network-first: con internet siempre se usa la versión más nueva
// (y se guarda en caché); sin internet se sirve lo guardado.

const CACHE = "horautp-v1";
const ARCHIVOS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icon.svg",
  "css/style.css",
  "js/bits.js",
  "js/entrada.js",
  "js/estado.js",
  "js/exportar.js",
  "js/main.js",
  "js/modelo.js",
  "js/periodos.js",
  "js/preferencias.js",
  "js/solver.js",
  "js/ui.js",
  "js/worker.js",
  "data/ejemplo.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r ?? Response.error())),
  );
});
