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

async function interroger(url: string, requete: string): Promise<{ elements?: { tags?: { name?: string } }[] }> {
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

/** Noms des rues (OpenStreetMap) ayant au moins un point dans le polygone, triés et dédoublonnés. */
export async function ruesDansZone(contour: LngLat[]): Promise<string[]> {
  const poly = contour.map(([lng, lat]) => `${lat.toFixed(6)} ${lng.toFixed(6)}`).join(" ");
  const requete = `[out:json][timeout:25];way(poly:"${poly}")["highway"~"^(${TYPES})$"]["name"];out tags;`;
  let derniere: unknown;
  for (const url of SERVEURS) {
    try {
      const j = await interroger(url, requete);
      const noms = new Map<string, string>();
      for (const e of j.elements ?? []) {
        const n = e.tags?.name?.trim();
        if (n && !noms.has(n.toLowerCase())) noms.set(n.toLowerCase(), n);
      }
      return [...noms.values()].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
    } catch (e) {
      console.warn("Recherche des rues :", e);
      derniere = e;
    }
  }
  throw derniere;
}
