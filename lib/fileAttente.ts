"use client";

import { supabase } from "./supabase";
import type { Etat, Rue } from "./types";

/**
 * Notation des rues avec file d'attente hors réseau.
 *
 * Chaque saisie est d'abord appliquée à l'écran (optimiste). Si l'envoi échoue faute de
 * réseau, elle est gardée dans le téléphone (localStorage) et renvoyée automatiquement
 * au retour de la connexion. Les refus du serveur (droits, valeur invalide) ne sont pas
 * mis en attente : ils sont signalés tout de suite.
 */

export interface Notation {
  etat: Etat;
  arret: string;
  note: string;
  vendus: number;
  especes: number;
  cheques: number;
}
interface EnAttente extends Notation { rue: string; a: number }

const CLE = "tournee-file-attente";
let file: EnAttente[] = lire();
const ecouteurs = new Set<() => void>();
const confirmations = new Set<(rue: string, n: Notation) => void>();

function lire(): EnAttente[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(CLE) ?? "[]"); } catch { return []; }
}
function ecrire(f: EnAttente[]) {
  file = f;
  try { localStorage.setItem(CLE, JSON.stringify(f)); } catch { /* stockage indisponible : file en mémoire */ }
  ecouteurs.forEach((e) => e());
}

export const enAttente = () => file;
export function surChangement(f: () => void) { ecouteurs.add(f); return () => { ecouteurs.delete(f); }; }
/** Appelé quand le serveur a accepté une notation (pour l'intégrer aux données sans attendre le temps réel). */
export function surConfirmation(f: (rue: string, n: Notation) => void) { confirmations.add(f); return () => { confirmations.delete(f); }; }

/** Applique les notations en attente aux rues affichées. */
export function avecAttente(rues: Rue[]): (Rue & { enAttente?: boolean })[] {
  if (!file.length) return rues;
  const m = new Map(file.map((x) => [x.rue, x]));
  return rues.map((r) => {
    const x = m.get(r.id);
    return x ? { ...r, etat: x.etat, arret: x.arret, note: x.note, vendus: x.vendus, especes: x.especes, cheques: x.cheques, enAttente: true } : r;
  });
}

const erreurReseau = (e: { code?: string; message?: string } | null) =>
  !!e && (!e.code || e.code === "") && /fetch|network|load failed|timeout|abort/i.test(e.message ?? "fetch");

async function envoyer(rue: string, n: Notation) {
  return supabase.rpc("noter_rue", {
    p_rue: rue, p_etat: n.etat, p_arret: n.arret, p_note: n.note,
    p_vendus: n.vendus, p_especes: n.especes, p_cheques: n.cheques,
  });
}

export type Resultat = "envoye" | "attente" | { erreur: { code?: string; message?: string } };

/** Note une rue : envoi immédiat, ou mise en attente si le téléphone est hors réseau. */
export async function noterRue(rue: string, n: Notation): Promise<Resultat> {
  // La dernière saisie d'une rue remplace les précédentes encore en attente.
  const mettreEnAttente = () => { ecrire([...file.filter((x) => x.rue !== rue), { ...n, rue, a: Date.now() }]); return "attente" as const; };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return mettreEnAttente();
  mettreEnAttente(); // affichage immédiat, retiré dès que le serveur confirme
  try {
    const { error } = await envoyer(rue, n);
    if (!error) {
      ecrire(file.filter((x) => !(x.rue === rue && x.etat === n.etat && x.vendus === n.vendus)));
      confirmations.forEach((f) => f(rue, n));
      return "envoye";
    }
    if (erreurReseau(error)) return "attente";
    ecrire(file.filter((x) => x.rue !== rue));
    return { erreur: error };
  } catch {
    return "attente";
  }
}

let enCours = false;
/** Renvoie les notations en attente (au retour du réseau, au réveil de l'écran…). */
export async function vider(): Promise<void> {
  if (enCours || !file.length || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
  enCours = true;
  try {
    for (const x of [...file]) {
      const { error } = await envoyer(x.rue, x);
      if (error && erreurReseau(error)) break; // toujours hors réseau : on réessaiera
      ecrire(file.filter((y) => !(y.rue === x.rue && y.a === x.a)));
      if (!error) confirmations.forEach((f) => f(x.rue, x));
    }
  } catch {
    /* réseau coupé pendant l'envoi : on réessaiera */
  } finally {
    enCours = false;
  }
}
