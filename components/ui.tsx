"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { prixMoyen, type Agregat, type Argent } from "@/lib/agregats";
import { eur } from "@/lib/format";
import { Document, Drapeau, Lecture, Panier, Pieces, Route } from "./icones";

// ---------- toasts

type Ecouteur = (m: string) => void;
const ecouteurs = new Set<Ecouteur>();
export const toast = (m: string) => ecouteurs.forEach((f) => f(m));

export function Toasts() {
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let h: ReturnType<typeof setTimeout>;
    const f: Ecouteur = (m) => {
      setMsg(m);
      clearTimeout(h);
      h = setTimeout(() => setMsg(null), 2800);
    };
    ecouteurs.add(f);
    return () => {
      ecouteurs.delete(f);
      clearTimeout(h);
    };
  }, []);
  // En popover, le message passe dans la « top layer », au-dessus des dialogues ouverts.
  useEffect(() => {
    const el = ref.current;
    if (!el || !("showPopover" in el)) return;
    try {
      if (el.matches(":popover-open")) el.hidePopover();
      if (msg) el.showPopover();
    } catch { /* navigateur sans popover : affichage classique */ }
  }, [msg]);
  return (
    <div ref={ref} popover="manual" className="toast" role="status" style={msg ? undefined : { display: "none" }}>
      {msg}
    </div>
  );
}

// ---------- dialogue modal

/**
 * Dialogue natif. `onSubmit` renvoie false pour garder le dialogue ouvert.
 */
export function Modal({
  children,
  onClose,
  onSubmit,
}: {
  children: ReactNode;
  onClose: () => void;
  onSubmit?: () => Promise<boolean | void> | boolean | void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    if (!onSubmit || envoi) return;
    setEnvoi(true);
    try {
      if ((await onSubmit()) !== false) onClose();
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <dialog ref={ref} onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <form onSubmit={soumettre}>
        <fieldset disabled={envoi} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          {children}
        </fieldset>
      </form>
    </dialog>
  );
}

export function Boutons({ valider, onClose, gauche }: { valider: string; onClose: () => void; gauche?: ReactNode }) {
  return (
    <div className="row">
      {gauche}
      <button type="button" className="btn" onClick={onClose}>
        Annuler
      </button>
      <button type="submit" className="btn primary">
        {valider}
      </button>
    </div>
  );
}

// ---------- indicateurs

export function Progression({ a }: { a: Agregat }) {
  if (!a.rues) return null;
  const w = (n: number) => `${(n / a.rues) * 100}%`;
  return (
    <div className="progress" aria-hidden="true">
      <i style={{ width: w(a.faite), background: "var(--done)" }} />
      <i style={{ width: w(a.encours), background: "var(--signal)" }} />
      <i style={{ width: w(a.arepasser), background: "var(--redo)" }} />
    </div>
  );
}

function Tuile({ icone, fond, couleur, valeur, libelle, pct, barre }: {
  icone: ReactNode; fond: string; couleur: string; valeur: ReactNode; libelle: string; pct: number; barre: string;
}) {
  return (
    <div className="carte-blanche kpi">
      <div className="tuile" style={{ background: fond, color: couleur }}>{icone}</div>
      <b>{valeur}</b>
      <span>{libelle}</span>
      <div className="jauge"><i style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: barre }} /></div>
    </div>
  );
}

export function Kpis({ a, depart, argent, libelle = "collectés sur la tournée" }: {
  a: Agregat; depart: number; argent?: Argent; libelle?: string;
}) {
  const pctRues = (n: number) => (a.rues ? (n / a.rues) * 100 : 0);
  const m = argent ?? { ...a, finale: false };
  const prix = prixMoyen(m.somme, a.vendus);
  return (
    <div className="kpis">
      <div className="carte-blanche kpi-total">
        <Pieces />
        <div>
          <b>{eur(m.somme)}</b>
          <span>{libelle}{m.finale ? " (somme finale déclarée)" : ""}</span>
          <small>{eur(m.especes)} en espèces, {eur(m.cheques)} en chèques</small>
          {prix !== null && <small><strong style={{ fontStyle: "normal" }}>{eur(prix)}</strong> en moyenne par calendrier</small>}
        </div>
      </div>
      <Tuile icone={<Panier />} fond="#DDF3E4" couleur="#1E8A4C" barre="var(--done)" libelle="calendriers vendus"
        valeur={<>{a.vendus}{depart ? ` / ${depart}` : ""}</>} pct={depart ? (a.vendus / depart) * 100 : 0} />
      <Tuile icone={<Document />} fond="#DCE9FC" couleur="#1D5FD1" barre="#6FA8F2" libelle="calendriers restants"
        valeur={depart ? depart - a.vendus : "—"} pct={depart ? ((depart - a.vendus) / depart) * 100 : 0} />
      <Tuile icone={<Route />} fond="#E8E3FC" couleur="var(--violet)" barre="var(--violet)" libelle="rues faites"
        valeur={`${a.faite} / ${a.rues}`} pct={pctRues(a.faite)} />
      <Tuile icone={<Lecture />} fond="#FDE8D6" couleur="#C45A12" barre="var(--redo)" libelle="rues commencées"
        valeur={a.encours} pct={pctRues(a.encours)} />
      <Tuile icone={<Drapeau />} fond="#FCDEDE" couleur="var(--danger)" barre="var(--danger)" libelle="rues à repasser"
        valeur={a.arepasser} pct={pctRues(a.arepasser)} />
    </div>
  );
}

export { Epingle } from "./icones";
