"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Agregat } from "@/lib/agregats";

// ---------- toasts

type Ecouteur = (m: string) => void;
const ecouteurs = new Set<Ecouteur>();
export const toast = (m: string) => ecouteurs.forEach((f) => f(m));

export function Toasts() {
  const [msg, setMsg] = useState<string | null>(null);
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
  return msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null;
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

export function Kpis({ a, depart }: { a: Agregat; depart: number }) {
  return (
    <div className="kpis">
      <div className="kpi">
        <b>
          {a.vendus}
          {depart ? ` / ${depart}` : ""}
        </b>
        <span>calendriers vendus</span>
      </div>
      {depart > 0 && (
        <div className="kpi">
          <b>{depart - a.vendus}</b>
          <span>calendriers restants</span>
        </div>
      )}
      <div className="kpi">
        <b>
          {a.faite} / {a.rues}
        </b>
        <span>rues faites</span>
      </div>
      <div className="kpi">
        <b>{a.encours}</b>
        <span>rues commencées</span>
      </div>
      <div className="kpi">
        <b>{a.arepasser}</b>
        <span>rues à repasser</span>
      </div>
    </div>
  );
}

export const Epingle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);
