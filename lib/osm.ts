import type { LngLat } from "./types";

// Voies où l'on sonne aux portes : on écarte autoroutes, pistes cyclables, chemins…
const TYPES = "residential|living_street|pedestrian|unclassified|tertiary|secondary|primary|service|road";

// Serveurs Overpass publics. Les deux premiers sont interrogés en même temps (le plus
// rapide gagne) ; les suivants ne servent que si les deux premiers échouent.
const EN_COURSE = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const SECOURS = ["https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
const DELAI_MS = 12000;

export type Trace = LngLat[][];
export interface RueOsm { nom: string; trace: Trace }
type Reponse = { remark?: string; elements?: { tags?: { name?: string }; geometry?: { lat: number; lon: number }[] }[] };

/** Clé de comparaison des noms : sans accents, casse ni espaces superflus. */
export const cleNom = (n: string) =>
  n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[''`-]/g, " ").replace(/\s+/g, " ").trim();

/** Le point [lng, lat] est-il dans le polygone ? (lancer de rayon) */
function dedans([x, y]: LngLat, poly: LngLat[]): boolean {
  let d = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

async function interroger(url: string, requete: string, signal: AbortSignal): Promise<Reponse> {
  const delai = AbortSignal.timeout(DELAI_MS);
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(requete),
    signal: AbortSignal.any ? AbortSignal.any([signal, delai]) : delai,
  });
  if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
  const j = (await r.json()) as Reponse;
  // Serveur surchargé : il répond 200 avec une liste vide et une remarque d'erreur.
  if (j.remark && /error|timed out|out of memory/i.test(j.remark)) throw new Error(`${url} : ${j.remark}`);
  return j;
}

/** Interroge plusieurs serveurs en même temps et garde la première réponse valable. */
async function auPlusRapide(serveurs: string[], requete: string): Promise<Reponse> {
  const ctrl = new AbortController();
  try {
    return await Promise.any(serveurs.map((u) => interroger(u, requete, ctrl.signal)));
  } finally {
    ctrl.abort(); // coupe les requêtes plus lentes
  }
}

const cache = new Map<string, Promise<Map<string, RueOsm>>>();

/**
 * Rues nommées (OpenStreetMap) ayant au moins un point dans le polygone, avec leur tracé,
 * indexées par `cleNom`. Résultat mis en cache pour la session.
 */
export function ruesOsm(contour: LngLat[]): Promise<Map<string, RueOsm>> {
  const cle = contour.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(";");
  const deja = cache.get(cle);
  if (deja) return deja;
  // Recherche dans le rectangle englobant (bien plus rapide côté serveur qu'un polygone),
  // puis tri local des rues qui entrent vraiment dans le secteur.
  const lngs = contour.map((p) => p[0]), lats = contour.map((p) => p[1]);
  const bbox = [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)].map((v) => v.toFixed(6)).join(",");
  const requete = `[out:json][timeout:15];way["highway"~"^(${TYPES})$"]["name"](${bbox});out tags geom;`;
  const p = (async () => {
    let j: Reponse;
    try {
      j = await auPlusRapide(EN_COURSE, requete);
    } catch (e) {
      console.warn("Recherche des rues, serveurs principaux :", e);
      j = await auPlusRapide(SECOURS, requete);
    }
    const rues = new Map<string, RueOsm>();
    for (const e of j.elements ?? []) {
      const nom = e.tags?.name?.trim();
      const ligne = (e.geometry ?? []).map((g): LngLat => [Math.round(g.lon * 1e6) / 1e6, Math.round(g.lat * 1e6) / 1e6]);
      if (!nom || !ligne.some((pt) => dedans(pt, contour))) continue;
      const k = cleNom(nom);
      const r = rues.get(k) ?? rues.set(k, { nom, trace: [] }).get(k)!;
      r.trace.push(ligne);
    }
    return rues;
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
