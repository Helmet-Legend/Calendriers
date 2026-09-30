"use client";

import { agreger, avancement, distance } from "@/lib/agregats";
import { eur, lienMaps } from "@/lib/format";
import { ETATS, GRIS, type Equipe, type Rue, type Secteur } from "@/lib/types";
import { Epingle, Progression } from "./ui";

export interface ActionsSecteur {
  ouvrirRue?: (r: Rue) => void;
  ajouterRue?: (s: Secteur) => void;
  modifier?: (s: Secteur) => void;
  redessiner?: (s: Secteur) => void;
  supprimer?: (s: Secteur) => void;
}

function ListeRues({ rues, ville, onRue }: { rues: Rue[]; ville: string; onRue?: (r: Rue) => void }) {
  if (!rues.length) return <p className="hint">Aucune rue pour ce secteur.</p>;
  return (
    <ul className="streets">
      {rues.map((r) => {
        let info = "";
        if (r.etat === "encours" && r.arret) info = "Arrêtée à : " + r.arret;
        if (r.etat === "arepasser") info = "À repasser" + (r.note ? " : " + r.note : "");
        if (r.etat === "faite" && r.repasse) info = "Repasse faite";
        const somme = r.especes + r.cheques;
        return (
          <li key={r.id} className={onRue ? "tap" : ""} onClick={onRue ? () => onRue(r) : undefined}>
            <span className={`chip ${r.etat}`}>{ETATS[r.etat]}</span>
            <span className="n">
              {r.nom}
              {info && <small>{info}</small>}
            </span>
            <span className="fig">
              {r.vendus ? `${r.vendus} cal.` : ""}
              {somme ? (
                <>
                  <br />
                  {eur(somme)}
                </>
              ) : null}
            </span>
            <a className="go" href={lienMaps(r.nom, ville)} target="_blank" rel="noopener" aria-label={`Voir ${r.nom} dans Maps`}
              onClick={(e) => e.stopPropagation()}>
              <Epingle />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function BlocSecteur({
  secteur, rues, equipe, ville, montrerEquipe, actions,
}: {
  secteur: Secteur;
  rues: Rue[];
  equipe: Equipe | undefined;
  ville: string;
  montrerEquipe: boolean;
  actions: ActionsSecteur;
}) {
  const a = agreger(rues);
  const av = avancement(rues);
  return (
    <>
      <div className="sector-title">
        <h3>
          <span className="swatch" style={{ background: equipe?.couleur ?? GRIS }} />
          {secteur.nom}
        </h3>
        <span className="hint">
          {a.faite}/{a.rues} rues{a.rues ? <> · <strong style={{ color: "var(--ink)" }}>{av.pct} %</strong></> : null}
          {av.metresTotal ? ` (${distance(av.metresFaits)} sur ${distance(av.metresTotal)})` : ""}
        </span>
      </div>
      {montrerEquipe && (
        <div className="line">
          <span>
            Équipe : <strong>{equipe ? equipe.nom : "non attribuée"}</strong>
          </span>
          <span>{a.vendus} cal.</span>
          <span>{eur(a.somme)}</span>
        </div>
      )}
      <Progression a={a} />
      <ListeRues rues={rues} ville={ville} onRue={actions.ouvrirRue} />
      <div className="bar">
        {actions.ajouterRue && (
          <button className="btn small" onClick={() => actions.ajouterRue!(secteur)}>
            Ajouter une rue
          </button>
        )}
        {actions.modifier && (
          <>
            <span className="grow" />
            <button className="btn small" onClick={() => actions.modifier!(secteur)}>Modifier</button>
            <button className="btn small" onClick={() => actions.redessiner!(secteur)}>Redessiner</button>
            <button className="btn small danger" onClick={() => actions.supprimer!(secteur)}>Supprimer</button>
          </>
        )}
      </div>
    </>
  );
}
