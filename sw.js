// Red primero: con internet siempre la versión nueva; sin red (o lenta), la
// copia guardada. Las peticiones saltan el caché HTTP: si no, GitHub Pages
// (max-age=600) daría archivos viejos aunque el SW sea nuevo.

const CACHE = "horautp-v52";
const ORIGEN = `${location.origin}/`;
const ARCHIVOS = [
  "./",
  "index.html",
  "css/style.css",
  "js/ajustes.js",
  "js/bits.js",
  "js/busqueda.js",
  "js/calendario.js",
  "js/carrusel.js",
  "js/deshacer.js",
  "js/dom.js",
  "js/elecciones.js",
  "js/entrada.js",
  "js/estado.js",
  "js/filtros.js",
  "js/horario.js",
  "js/inspector.js",
  "js/main.js",
  "js/manual.js",
  "js/materias.js",
  "js/modelo.js",
  "js/periodos.js",
  "js/preferencias.js",
  "js/resorte.js",
  "js/solver.js",
  "js/tema.js",
  "js/ui.js",
  "js/worker.js",
  "data/ejemplo.json",
];

self.addEventListener("install", (e) => {
  const frescos = ARCHIVOS.map((u) => new Request(u, { cache: "reload" }));
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(frescos)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Con red lenta, la copia guardada pasado este tiempo.
const ESPERA_RED = 3000;

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || !req.url.startsWith(ORIGEN)) return;
  // no-cache: pregunta al servidor (304 si no cambió), nunca usa el caché HTTP sin preguntar
  const red = fetch(req, { cache: "no-cache" }).then((res) => {
    if (res.ok) {
      const copia = res.clone();
      e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copia)));
    }
    return res;
  });
  const guardada = () => caches.match(req, { ignoreSearch: true });
  const lenta = new Promise((listo) => { setTimeout(listo, ESPERA_RED); }).then(guardada);
  e.respondWith(
    Promise.race([red, lenta.then((r) => r ?? red)])
      .catch(() => guardada().then((r) => r ?? Response.error())),
  );
  e.waitUntil(red.catch(() => {}));
});
