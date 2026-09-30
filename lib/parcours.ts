import type { LngLat, Rue } from "./types";

/**
 * Ordre de passage des rues d'un secteur, sans GPS obligatoire : on part d'une rue (ou d'un
 * point), on la parcourt jusqu'à son autre bout, puis on enchaîne sur la rue non faite la plus
 * proche, et ainsi de suite. Les rues sans tracé connu sont placées à la fin.
 */

export type Depart = { rue: string } | { point: LngLat } | null;

// Distance approchée en mètres (suffisante à l'échelle d'une ville).
function dist([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const x = ((lng2 - lng1) * Math.PI) / 180 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  const y = ((lat2 - lat1) * Math.PI) / 180;
  return Math.sqrt(x * x + y * y) * 6371008.8;
}

const points = (r: Rue): LngLat[] => (r.trace ?? []).flat();

/** Point de la rue le plus proche de `p`. */
function plusProche(r: Rue, p: LngLat): { pt: LngLat; d: number } {
  let meilleur = { pt: points(r)[0], d: Infinity };
  for (const q of points(r)) {
    const d = dist(p, q);
    if (d < meilleur.d) meilleur = { pt: q, d };
  }
  return meilleur;
}

/** Point de la rue le plus éloigné de l'entrée : là où l'on ressort après l'avoir faite. */
function sortie(r: Rue, entree: LngLat): LngLat {
  let loin = entree, dmax = -1;
  for (const q of points(r)) {
    const d = dist(entree, q);
    if (d > dmax) { dmax = d; loin = q; }
  }
  return loin;
}

/** Milieu approximatif de la rue (pour y poser le numéro d'étape sur la carte). */
export function milieu(r: Rue): LngLat | null {
  const lignes = r.trace ?? [];
  if (!lignes.length) return null;
  const l = lignes.reduce((a, b) => (b.length > a.length ? b : a));
  return l[Math.floor(l.length / 2)];
}

/** Départ proposé quand l'équipe n'en a pas choisi : la rue commencée, sinon la dernière notée. */
export function departParDefaut(rues: Rue[]): Depart {
  const commencee = rues.find((r) => r.etat === "encours");
  if (commencee) return { rue: commencee.id };
  const notees = rues.filter((r) => r.maj_a && r.etat !== "afaire" && points(r).length)
    .sort((a, b) => Date.parse(b.maj_a!) - Date.parse(a.maj_a!));
  if (notees[0]) {
    const r = notees[0], pts = points(r);
    return { point: pts[pts.length - 1] }; // on repart du bout de la dernière rue notée
  }
  return null;
}

export interface Etape { rue: Rue; n: number }

/**
 * Rues restantes (pas « faites ») dans l'ordre de passage, numérotées à partir de 1.
 * Renvoie aussi les rues faites, à part.
 */
export function ordonner(rues: Rue[], depart: Depart): { etapes: Etape[]; faites: Rue[] } {
  const faites = rues.filter((r) => r.etat === "faite");
  const reste = rues.filter((r) => r.etat !== "faite");
  const avecTrace = reste.filter((r) => points(r).length);
  const sansTrace = reste.filter((r) => !points(r).length);
  const ordre: Rue[] = [];
  let pos: LngLat | null = null;

  // Point de départ
  if (depart && "rue" in depart) {
    const r = avecTrace.find((x) => x.id === depart.rue);
    if (r) {
      ordre.push(r);
      avecTrace.splice(avecTrace.indexOf(r), 1);
      const pts = points(r);
      pos = sortie(r, pts[0]);
    }
  } else if (depart && "point" in depart) pos = depart.point;

  // Sans départ connu : on commence par la rue la plus à l'ouest (un bord du secteur).
  if (!pos && avecTrace.length) {
    const r = avecTrace.reduce((a, b) => (Math.min(...points(b).map((p) => p[0])) < Math.min(...points(a).map((p) => p[0])) ? b : a));
    ordre.push(r);
    avecTrace.splice(avecTrace.indexOf(r), 1);
    const ouest = points(r).reduce((a, b) => (b[0] < a[0] ? b : a));
    pos = sortie(r, ouest);
  }

  // Plus proche voisin
  while (avecTrace.length && pos) {
    let meilleur = 0, entree = plusProche(avecTrace[0], pos);
    for (let i = 1; i < avecTrace.length; i++) {
      const c = plusProche(avecTrace[i], pos);
      if (c.d < entree.d) { meilleur = i; entree = c; }
    }
    const r = avecTrace.splice(meilleur, 1)[0];
    ordre.push(r);
    pos = sortie(r, entree.pt);
  }

  return { etapes: [...ordre, ...sansTrace].map((rue, i) => ({ rue, n: i + 1 })), faites };
}
