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
