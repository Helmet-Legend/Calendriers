"use client";

import { useSyncExternalStore } from "react";
import type { Depart } from "./parcours";

/**
 * Réglages du parcours par secteur, gardés sur le téléphone : ordre de la liste
 * (« parcours » ou alphabétique) et point de départ choisi.
 */
export interface Reglage { mode: "parcours" | "alpha"; depart: Depart }

const CLE = "tournee-parcours";
const ecouteurs = new Set<() => void>();
let etat: Record<string, Reglage> = {};
let charge = false;

function lire() {
  if (charge || typeof window === "undefined") return;
  charge = true;
  try { etat = JSON.parse(localStorage.getItem(CLE) ?? "{}"); } catch { etat = {}; }
}

export function reglagesParcours(): Record<string, Reglage> {
  lire();
  return etat;
}

export function regler(secteur: string, r: Partial<Reglage>) {
  lire();
  const avant: Reglage = etat[secteur] ?? { mode: "parcours", depart: null };
  etat = { ...etat, [secteur]: { ...avant, ...r } };
  try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch { /* stockage indisponible */ }
  ecouteurs.forEach((f) => f());
}

const s = (f: () => void) => { ecouteurs.add(f); return () => { ecouteurs.delete(f); }; };
const vide: Record<string, Reglage> = {};
export const useReglagesParcours = () => useSyncExternalStore(s, reglagesParcours, () => vide);
export const reglageDe = (tous: Record<string, Reglage>, secteur: string): Reglage => tous[secteur] ?? { mode: "parcours", depart: null };
