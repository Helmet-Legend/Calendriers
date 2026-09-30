import type { LngLat } from "./types";

// Voies où l'on sonne aux portes : on écarte autoroutes, pistes cyclables, chemins…
const TYPES = "residential|living_street|pedestrian|unclassified|tertiary|secondary|primary|service|road";

// Serveurs Overpass publics, essayés dans l'ordre (le principal est souvent saturé).
const SERVEURS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

export type Trace = LngLat[][];
export interface RueOsm { nom: string; trace: Trace }
type Reponse = { elements?: { tags?: { name?: string }; geometry?: { lat: number; lon: number }[] }[] };

/** Clé de comparaison des noms : sans accents, casse ni espaces superflus. */
export const cleNom = (n: string) =>
  n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[''`-]/g, " ").replace(/\s+/g, " ").trim();

async function interroger(url: string, requete: string): Promise<Reponse> {
  const ctrl = new AbortController();
  const h = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(requete),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(h);
  }
}

const cache = new Map<string, Promise<Map<string, RueOsm>>>();

/**
 * Rues nommées (OpenStreetMap) ayant au moins un point dans le polygone, avec leur tracé,
 * indexées par `cleNom`. Résultat mis en cache pour la session.
 */
export function ruesOsm(contour: LngLat[]): Promise<Map<string, RueOsm>> {
  const poly = contour.map(([lng, lat]) => `${lat.toFixed(6)} ${lng.toFixed(6)}`).join(" ");
  const deja = cache.get(poly);
  if (deja) return deja;
  const requete = `[out:json][timeout:25];way(poly:"${poly}")["highway"~"^(${TYPES})$"]["name"];out geom;`;
  const p = (async () => {
    let derniere: unknown;
    for (const url of SERVEURS) {
      try {
        const j = await interroger(url, requete);
        const rues = new Map<string, RueOsm>();
        for (const e of j.elements ?? []) {
          const nom = e.tags?.name?.trim();
          if (!nom) continue;
          const k = cleNom(nom);
          const r = rues.get(k) ?? rues.set(k, { nom, trace: [] }).get(k)!;
          if (e.geometry?.length) r.trace.push(e.geometry.map((g) => [Math.round(g.lon * 1e6) / 1e6, Math.round(g.lat * 1e6) / 1e6]));
        }
        return rues;
      } catch (e) {
        console.warn("Recherche des rues :", e);
        derniere = e;
      }
    }
    throw derniere;
  })();
  cache.set(poly, p);
  p.catch(() => cache.delete(poly));
  return p;
}

/** Noms des rues de la zone, triés. */
export async function ruesDansZone(contour: LngLat[]): Promise<string[]> {
  const rues = await ruesOsm(contour);
  return [...rues.values()].map((r) => r.nom).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}
