// Offline, stale-while-revalidate.

const CACHE = "horautp-v37";
const ORIGEN = `${location.origin}/`;
const ARCHIVOS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/style.css",
  "js/agentes.js",
  "js/ajustes.js",
  "js/atajos.js",
  "js/bits.js",
  "js/calendario.js",
  "js/dom.js",
  "js/entrada.js",
  "js/estado.js",
  "js/main.js",
  "js/modelo.js",
  "js/periodos.js",
  "js/preferencias.js",
  "js/solver.js",
  "js/tema.js",
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
  if (req.method !== "GET" || !req.url.startsWith(ORIGEN)) return;
  const red = fetch(req);
  e.waitUntil(red.then((res) => {
    if (!res.ok) return;
    const copia = res.clone();
    return caches.open(CACHE).then((c) => c.put(req, copia));
  }).catch(() => {}));
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r ?? red).catch(() => Response.error()));
});
