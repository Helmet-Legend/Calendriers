import type { Rue, Secteur } from "./types";

export interface Agregat {
  rues: number;
  faite: number;
  encours: number;
  arepasser: number;
  vendus: number;
  especes: number;
  cheques: number;
  somme: number;
  maj: number;
}

export function agreger(rues: Rue[]): Agregat {
  const a: Agregat = { rues: 0, faite: 0, encours: 0, arepasser: 0, vendus: 0, especes: 0, cheques: 0, somme: 0, maj: 0 };
  for (const r of rues) {
    a.rues++;
    if (r.etat !== "afaire") a[r.etat]++;
    a.vendus += r.vendus;
    a.especes += Number(r.especes);
    a.cheques += Number(r.cheques);
    if (r.maj_a) a.maj = Math.max(a.maj, Date.parse(r.maj_a));
  }
  a.somme = a.especes + a.cheques;
  return a;
}

export const ruesDe = (rues: Rue[], secteurs: Secteur[]) => {
  const ids = new Set(secteurs.map((s) => s.id));
  return rues.filter((r) => ids.has(r.secteur_id));
};

// ---------- avancement pondéré par la longueur des rues

const RAYON = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Longueur en mètres d'un tracé (plusieurs lignes [lng, lat]). */
export function longueur(trace: [number, number][][] | null | undefined): number {
  let m = 0;
  for (const ligne of trace ?? [])
    for (let i = 1; i < ligne.length; i++) {
      const [lng1, lat1] = ligne[i - 1], [lng2, lat2] = ligne[i];
      const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
      m += 2 * RAYON * Math.asin(Math.sqrt(a));
    }
  return m;
}

export interface Avancement {
  /** Pourcentage de la longueur des rues déjà faite. */
  pct: number;
  faites: number;
  total: number;
  metresFaits: number;
  metresTotal: number;
}

/**
 * Avancement d'un ensemble de rues, pondéré par leur longueur. Une rue sans tracé connu
 * compte pour la longueur moyenne des autres (ou 1 si aucune n'a de tracé : simple comptage).
 * `etatDe` permet de simuler un changement d'état avant enregistrement.
 */
export function avancement(rues: Rue[], etatDe: (r: Rue) => Rue["etat"] = (r) => r.etat): Avancement {
  const longs = rues.map((r) => longueur(r.trace));
  const connues = longs.filter((l) => l > 0);
  const defaut = connues.length ? connues.reduce((t, l) => t + l, 0) / connues.length : 1;
  let total = 0, faits = 0, faites = 0;
  rues.forEach((r, i) => {
    const l = longs[i] > 0 ? longs[i] : defaut;
    total += l;
    if (etatDe(r) === "faite") { faits += l; faites++; }
  });
  const pct = total ? Math.round((faits / total) * 100) : 0;
  return { pct: faites < rues.length ? Math.min(pct, 99) : pct, faites, total: rues.length, metresFaits: connues.length ? faits : 0, metresTotal: connues.length ? total : 0 };
}

/** « 1,2 km » ou « 350 m ». */
export const distance = (m: number) =>
  m >= 1000 ? `${(m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`;
