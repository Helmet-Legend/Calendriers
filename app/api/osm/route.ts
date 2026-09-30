import { NextResponse, type NextRequest } from "next/server";

/**
 * Recherche des rues d'un secteur dans OpenStreetMap (API Overpass), faite côté serveur :
 * plus fiable depuis un téléphone (un seul appel, pas de souci de CORS) et vérifiable.
 * Entrée : contour du secteur [[lng, lat], ...] (POST JSON { contour } ou GET ?c=lng,lat;lng,lat…).
 * Sortie : { rues: [{ nom, trace: [[[lng, lat], ...], ...] }] } pour les rues nommées ayant au
 * moins un point dans le secteur.
 */

export const maxDuration = 60;

type LngLat = [number, number];
type Reponse = { remark?: string; elements?: { tags?: { name?: string }; geometry?: { lat: number; lon: number }[] }[] };

const TYPES = "residential|living_street|pedestrian|unclassified|tertiary|secondary|primary|service|road";
const EN_COURSE = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const SECOURS = ["https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
const DELAI_MS = 25000;
const cache = new Map<string, { a: number; rues: unknown }>();

function dedans([x, y]: LngLat, poly: LngLat[]): boolean {
  let d = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

function valider(c: unknown): LngLat[] | null {
  if (!Array.isArray(c) || c.length < 3 || c.length > 200) return null;
  const pts = c.map((p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [NaN, NaN]) as LngLat);
  if (pts.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90)) return null;
  const lngs = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
  // Garde-fou : un secteur fait au plus quelques kilomètres de côté.
  if (Math.max(...lngs) - Math.min(...lngs) > 0.2 || Math.max(...lats) - Math.min(...lats) > 0.2) return null;
  return pts;
}

async function interroger(url: string, requete: string, signal: AbortSignal): Promise<Reponse> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "tournee-calendriers/1.0 (Vercel)" },
    body: "data=" + encodeURIComponent(requete),
    signal: AbortSignal.any([signal, AbortSignal.timeout(DELAI_MS)]),
    cache: "no-store",
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`${new URL(url).host} : HTTP ${r.status} ${texte.slice(0, 200)}`);
  const j = JSON.parse(texte) as Reponse;
  if (j.remark && /error|timed out|out of memory/i.test(j.remark)) throw new Error(`${new URL(url).host} : ${j.remark}`);
  return j;
}

async function auPlusRapide(serveurs: string[], requete: string): Promise<Reponse> {
  const ctrl = new AbortController();
  try {
    return await Promise.any(serveurs.map((u) => interroger(u, requete, ctrl.signal)));
  } finally {
    ctrl.abort();
  }
}

async function chercher(contour: LngLat[]) {
  const cle = contour.map(([x, y]) => `${x.toFixed(5)},${y.toFixed(5)}`).join(";");
  const deja = cache.get(cle);
  if (deja && Date.now() - deja.a < 3600_000) return deja.rues;
  const lngs = contour.map((p) => p[0]), lats = contour.map((p) => p[1]);
  const bbox = [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)].map((v) => v.toFixed(6)).join(",");
  const requete = `[out:json][timeout:25];way["highway"~"^(${TYPES})$"]["name"](${bbox});out geom;`;
  let j: Reponse;
  try {
    j = await auPlusRapide(EN_COURSE, requete);
  } catch (e) {
    console.warn("Overpass (principaux) :", e instanceof AggregateError ? e.errors.map(String) : String(e));
    j = await auPlusRapide(SECOURS, requete);
  }
  const rues = new Map<string, { nom: string; trace: LngLat[][] }>();
  for (const e of j.elements ?? []) {
    const nom = e.tags?.name?.trim();
    const ligne = (e.geometry ?? []).map((g): LngLat => [Math.round(g.lon * 1e6) / 1e6, Math.round(g.lat * 1e6) / 1e6]);
    if (!nom || !ligne.some((p) => dedans(p, contour))) continue;
    const r = rues.get(nom) ?? rues.set(nom, { nom, trace: [] }).get(nom)!;
    r.trace.push(ligne);
  }
  const res = [...rues.values()];
  cache.set(cle, { a: Date.now(), rues: res });
  return res;
}

async function repondre(c: unknown) {
  const contour = valider(c);
  if (!contour) return NextResponse.json({ erreur: "contour invalide" }, { status: 400 });
  try {
    return NextResponse.json({ rues: await chercher(contour) });
  } catch (e) {
    const detail = e instanceof AggregateError ? e.errors.map(String) : [String(e)];
    console.error("Overpass indisponible :", detail);
    return NextResponse.json({ erreur: "OpenStreetMap indisponible", detail }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const corps = await req.json().catch(() => null);
  return repondre(corps?.contour);
}

export async function GET(req: NextRequest) {
  const c = (req.nextUrl.searchParams.get("c") ?? "").split(";").map((p) => p.split(",").map(Number));
  return repondre(c);
}
