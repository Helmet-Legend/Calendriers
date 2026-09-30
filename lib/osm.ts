import type { LngLat } from "./types";

export type Trace = LngLat[][];
export interface RueOsm { nom: string; trace: Trace }

/** Clé de comparaison des noms : sans accents, casse ni espaces superflus. */
export const cleNom = (n: string) =>
  n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[''`-]/g, " ").replace(/\s+/g, " ").trim();

const cache = new Map<string, Promise<Map<string, RueOsm>>>();

/**
 * Rues nommées (OpenStreetMap) ayant au moins un point dans le polygone, avec leur tracé,
 * indexées par `cleNom`. Résultat mis en cache pour la session.
 */
export function ruesOsm(contour: LngLat[]): Promise<Map<string, RueOsm>> {
  const cle = contour.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(";");
  const deja = cache.get(cle);
  if (deja) return deja;
  // La recherche est faite par le serveur de l'application (voir app/api/osm/route.ts).
  const p = (async () => {
    const ctrl = new AbortController();
    const h = setTimeout(() => ctrl.abort(), 70000);
    try {
      const r = await fetch("/api/osm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contour }),
        signal: ctrl.signal,
      });
      const j = (await r.json().catch(() => ({}))) as { rues?: RueOsm[]; erreur?: string };
      if (!r.ok || !j.rues) throw new Error(j.erreur ?? `HTTP ${r.status}`);
      const rues = new Map<string, RueOsm>();
      for (const x of j.rues) {
        const k = cleNom(x.nom);
        const deja = rues.get(k);
        if (deja) deja.trace.push(...x.trace);
        else rues.set(k, { nom: x.nom, trace: x.trace });
      }
      return rues;
    } finally {
      clearTimeout(h);
    }
  })();
  cache.set(cle, p);
  p.catch(() => cache.delete(cle));
  return p;
}

/** Noms des rues de la zone, triés. */
export async function ruesDansZone(contour: LngLat[]): Promise<string[]> {
  const rues = await ruesOsm(contour);
  return [...rues.values()].map((r) => r.nom).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}
