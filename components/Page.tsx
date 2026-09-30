"use client";

import type { ReactNode } from "react";
import type { Donnees } from "@/lib/useTournee";

export function Entete({ d, droite }: { d?: Donnees; droite?: ReactNode }) {
  const c = d?.config;
  const sous = d?.pret
    ? `${d.equipes.length} équipe${d.equipes.length > 1 ? "s" : ""}, ${d.secteurs.length} secteur${d.secteurs.length > 1 ? "s" : ""}` + (c?.ville ? ` à ${c.ville}` : "")
    : d ? "Chargement…" : "";
  return (
    <>
      <div className="entete">
        <h1>{c?.titre || "Tournée des calendriers"}</h1>
        {droite}
      </div>
      <p className="sub">{sous}</p>
      {d?.pret && !d.enLigne && <div className="horsligne">Connexion perdue : les chiffres affichés ne sont peut-être plus à jour.</div>}
    </>
  );
}
