"use client";

import { agreger, avancement, distance, prixMoyen } from "@/lib/agregats";
import { libelle, pastille } from "./Carte";
import { eur, lienMaps } from "@/lib/format";
import { ETATS, GRIS, type Equipe, type Rue, type Secteur } from "@/lib/types";
import { departParDefaut, ordonner } from "@/lib/parcours";
import { reglageDe, regler, useReglagesParcours } from "@/lib/useParcours";
import { useState } from "react";
import { toast } from "./ui";
import { Epingle, Progression } from "./ui";

export interface ActionsSecteur {
  ouvrirRue?: (r: Rue) => void;
  marquerFaite?: (r: Rue) => void;
  ajouterRue?: (s: Secteur) => void;
  modifier?: (s: Secteur) => void;
  redessiner?: (s: Secteur) => void;
  supprimer?: (s: Secteur) => void;
}

const Coche = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

function ListeRues({ rues, ville, onRue, onFaite, numeros }: {
  rues: Rue[]; ville: string; onRue?: (r: Rue) => void; onFaite?: (r: Rue) => void; numeros?: Map<string, number>;
}) {
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
            {numeros && <span className={`etape ${numeros.get(r.id) === 1 ? "premiere" : ""}`} aria-label={numeros.has(r.id) ? `Étape ${numeros.get(r.id)}` : "Faite"}>{numeros.get(r.id) ?? "✓"}</span>}
            <span className={`chip ${r.etat}`}>{ETATS[r.etat]}</span>
            <span className="n">
              {r.nom}
              {info && <small>{info}</small>}
              {r.enAttente && <small className="en-attente">en attente d&apos;envoi</small>}
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
            {onFaite && (r.etat === "faite" ? (
              <span className="coche faite" title="Rue faite" aria-hidden="true"><Coche /></span>
            ) : (
              <button type="button" className="coche" aria-label={`Marquer ${r.nom} comme faite`} title="Marquer comme faite"
                onClick={(e) => { e.stopPropagation(); onFaite(r); }}>
                <Coche />
              </button>
            ))}
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
  const reglages = useReglagesParcours();
  const reglage = reglageDe(reglages, secteur.id);
  const [gps, setGps] = useState(false);
  const traces = rues.some((r) => r.trace?.length);
  const enParcours = traces && reglage.mode === "parcours";
  const parcours = enParcours ? ordonner(rues, reglage.depart ?? departParDefaut(rues)) : null;
  const liste = parcours ? [...parcours.etapes.map((e) => e.rue), ...parcours.faites] : rues;
  const numeros = parcours ? new Map(parcours.etapes.map((e) => [e.rue.id, e.n])) : undefined;
  const departRue = reglage.depart && "rue" in reglage.depart ? reglage.depart.rue : "";

  const partirDIci = () => {
    if (!("geolocation" in navigator)) return toast("Ce téléphone ne donne pas sa position");
    setGps(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGps(false);
        regler(secteur.id, { mode: "parcours", depart: { point: [p.coords.longitude, p.coords.latitude] } });
        toast("Parcours recalculé depuis votre position");
      },
      (e) => {
        setGps(false);
        toast(e.code === e.PERMISSION_DENIED ? "Localisation refusée : autorisez-la dans les réglages du téléphone" : "Position introuvable, réessayez dehors");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

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
      <div className="line">
        {montrerEquipe && (
          <span>
            Équipe : <strong>{equipe ? equipe.nom : "non attribuée"}</strong>
          </span>
        )}
        <span><strong>{a.vendus}</strong> cal. vendus</span>
        <span><strong>{eur(a.somme)}</strong> récoltés</span>
      </div>
      <Progression a={a} />
      {traces && rues.length > 1 && (
        <div className="barre-parcours">
          <div className="seg-mini" role="group" aria-label="Ordre des rues">
            <button type="button" aria-pressed={enParcours} onClick={() => regler(secteur.id, { mode: "parcours" })}>Ordre de passage</button>
            <button type="button" aria-pressed={!enParcours} onClick={() => regler(secteur.id, { mode: "alpha" })}>Liste</button>
          </div>
          {enParcours && (
            <>
              <button type="button" className="btn small" onClick={partirDIci} disabled={gps}>
                {gps ? "Localisation…" : "Partir d'ici"}
              </button>
              <label className="depart">
                <span>Départ</span>
                <select value={departRue} onChange={(e) => regler(secteur.id, { depart: e.target.value ? { rue: e.target.value } : null })}>
                  <option value="">{reglage.depart && "point" in reglage.depart ? "Ma position" : "Automatique"}</option>
                  {rues.filter((r) => r.etat !== "faite" && r.trace?.length).sort((x, y) => x.nom.localeCompare(y.nom, "fr")).map((r) => (
                    <option key={r.id} value={r.id}>{r.nom}</option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
      )}
      <ListeRues rues={liste} ville={ville} onRue={actions.ouvrirRue} onFaite={actions.marquerFaite} numeros={numeros} />
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

/** Résumé d'un secteur choisi : progression, calendriers et argent récolté. */
export function ResumeSecteur({ secteur, rues, equipe, onFermer }: {
  secteur: Secteur; rues: Rue[]; equipe: Equipe | undefined; onFermer?: () => void;
}) {
  const a = agreger(rues);
  const av = avancement(rues);
  const c = equipe?.couleur ?? GRIS;
  const prix = prixMoyen(a.somme, a.vendus);
  return (
    <section className="carte-blanche bloc resume" aria-label={`Résumé du ${libelle(secteur.nom)}`}>
      <div className="resume-tete">
        <span className="pastille" style={{ background: c }}>{pastille(secteur.nom)}</span>
        <div style={{ flexGrow: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0 }}>{libelle(secteur.nom)}</h2>
          <span className="hint">{equipe ? equipe.nom : "Pas encore attribué"}</span>
        </div>
        {onFermer && <button type="button" className="btn small" onClick={onFermer}>Fermer</button>}
      </div>
      <div className="resume-pct">
        <b>{a.rues ? `${av.pct} %` : "—"}</b>
        <span>parcouru</span>
      </div>
      <div className="jauge" style={{ height: 10 }}><i style={{ width: `${av.pct}%`, background: c }} /></div>
      <p className="hint" style={{ margin: "6px 0 0" }}>
        {a.faite}/{a.rues} rues faites{av.metresTotal ? ` · ${distance(av.metresFaits)} sur ${distance(av.metresTotal)}` : ""}
        {a.encours ? ` · ${a.encours} commencée${a.encours > 1 ? "s" : ""}` : ""}
        {a.arepasser ? ` · ${a.arepasser} à repasser` : ""}
      </p>
      <dl className="resume-chiffres">
        <div><dt>Calendriers vendus</dt><dd>{a.vendus}</dd></div>
        <div><dt>Argent récolté</dt><dd>{eur(a.somme)}</dd></div>
        <div><dt>Espèces / chèques</dt><dd className="petit">{eur(a.especes)} / {eur(a.cheques)}</dd></div>
        <div><dt>Moyenne par calendrier</dt><dd>{prix === null ? "—" : eur(prix)}</dd></div>
      </dl>
    </section>
  );
}
