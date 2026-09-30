import type { LngLat } from "./types";

// Voies où l'on sonne aux portes : on écarte autoroutes, pistes cyclables, chemins…
const TYPES = "residential|living_street|pedestrian|unclassified|tertiary|secondary|primary|service|road";

/** Noms des rues (OpenStreetMap) ayant au moins un point dans le polygone, triés et dédoublonnés. */
export async function ruesDansZone(contour: LngLat[]): Promise<string[]> {
  const poly = contour.map(([lng, lat]) => `${lat.toFixed(6)} ${lng.toFixed(6)}`).join(" ");
  const requete = `[out:json][timeout:25];way(poly:"${poly}")["highway"~"^(${TYPES})$"]["name"];out tags;`;
  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(requete),
  });
  if (!r.ok) throw new Error(`Overpass ${r.status}`);
  const j = (await r.json()) as { elements?: { tags?: { name?: string } }[] };
  const noms = new Map<string, string>();
  for (const e of j.elements ?? []) {
    const n = e.tags?.name?.trim();
    if (n && !noms.has(n.toLowerCase())) noms.set(n.toLowerCase(), n);
  }
  return [...noms.values()].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}
