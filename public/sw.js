// Service worker de la Tournée des calendriers : permet d'ouvrir l'application sans réseau.
// - pages : réseau d'abord, copie en cache en secours ;
// - fichiers de l'application (/_next/static) : cache d'abord (ils ne changent jamais) ;
// - Supabase, Mapbox, OpenStreetMap : jamais interceptés (données en direct).
const VERSION = "tournee-v1";
const DE_BASE = ["/", "/equipe", "/sete-bandeau.jpg", "/icone-192.png", "/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(DE_BASE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((rep) => {
          const copie = rep.clone();
          caches.open(VERSION).then((c) => c.put(url.pathname, copie));
          return rep;
        })
        .catch(async () => {
          const c = await caches.open(VERSION);
          // Hors réseau : la page demandée si elle est en cache, sinon la page équipe ou l'accueil.
          return (await c.match(url.pathname)) || (await c.match("/equipe")) || (await c.match("/")) || Response.error();
        }),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.open(VERSION).then(async (c) => {
        const deja = await c.match(req);
        if (deja) return deja;
        const rep = await fetch(req);
        if (rep.ok) c.put(req, rep.clone());
        return rep;
      }),
    );
    return;
  }

  // Autres fichiers du site (photo, icônes…) : cache, mis à jour en arrière-plan.
  e.respondWith(
    caches.open(VERSION).then(async (c) => {
      const deja = await c.match(req);
      const frais = fetch(req).then((rep) => { if (rep.ok) c.put(req, rep.clone()); return rep; }).catch(() => deja);
      return deja || frais;
    }),
  );
});
