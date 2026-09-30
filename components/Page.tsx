"use client";

import type { ReactNode } from "react";
import type { Donnees } from "@/lib/useTournee";
import { Aide, Barres, Calendrier, Groupe, Repere } from "./icones";
import { Installation } from "./Installation";

/** Titre du bandeau : le premier mot en blanc, la suite en bleu. */
function Titre({ texte }: { texte: string }) {
  const i = texte.indexOf(" ");
  if (i < 0) return <h1>{texte}</h1>;
  return (
    <h1>
      {texte.slice(0, i)} <span>{texte.slice(i + 1)}</span>
    </h1>
  );
}

export function sousTitre(d?: Donnees) {
  if (!d?.pret) return d ? "Chargement…" : "";
  const c = d.config;
  return `${d.equipes.length} équipe${d.equipes.length > 1 ? "s" : ""}, ${d.secteurs.length} secteur${d.secteurs.length > 1 ? "s" : ""}` + (c?.ville ? ` à ${c.ville}` : "");
}

/**
 * Cadre commun : menu latéral (responsables seulement), bandeau photo, contenu.
 */
export function Cadre({
  d, actions, menu, onAide, etroit, children,
}: {
  d?: Donnees;
  actions?: ReactNode;
  menu?: boolean;
  onAide?: () => void;
  etroit?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="app" id="haut">
      {menu && (
        <nav className="side" aria-label="Navigation principale">
          <div className="logo"><Calendrier size={40} /></div>
          <a href="#haut" aria-current="page"><Calendrier size={32} />Tournée</a>
          <a href="#equipes"><Groupe size={32} />Équipes</a>
          <a href="#secteurs"><Repere size={32} />Secteurs</a>
          <a href="#progression"><Barres size={32} />Statistiques</a>
          <div className="espace" />
          <button type="button" onClick={onAide}><Aide size={30} />Aide</button>
        </nav>
      )}
      <div className="col">
        <header className="banner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="photo" src="/sete-bandeau.jpg" alt="" />
          <div className="fondu" aria-hidden="true" />
          <div className="textes">
            <Titre texte={d?.config?.titre || "Tournée des calendriers"} />
            <p>{sousTitre(d)}</p>
          </div>
          {actions && <div className="actions">{actions}</div>}
        </header>
        <main className="contenu">
          <Installation />
          {d?.pret && !d.enLigne && <div className="horsligne">Connexion perdue : les chiffres affichés ne sont peut-être plus à jour.</div>}
          {d && d.attente > 0 && (
            <div className="attente" role="status">
              {d.attente} saisie{d.attente > 1 ? "s" : ""} gardée{d.attente > 1 ? "s" : ""} sur ce téléphone, envoi automatique dès le retour du réseau.
            </div>
          )}
          {etroit ? <div className="etroit" style={{ display: "flex", flexDirection: "column", gap: 16 }}>{children}</div> : children}
        </main>
      </div>
    </div>
  );
}
