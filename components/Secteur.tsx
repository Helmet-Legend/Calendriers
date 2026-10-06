"use client";

import { agreger, avancement, distance, prixMoyen } from "@/lib/agregats";
import { libelle, pastille } from "./Carte";
import { eur } from "@/lib/format";
import { ETATS, GRIS, type Equipe, type Rue, type Secteur } from "@/lib/types";
import { departParDefaut, ordonner } from "@/lib/parcours";
import { reglageDe, regler, useReglagesParcours } from "@/lib/useParcours";
import { useState } from "react";
import { Progression, toast } from "./ui";

export interface ActionsSecteur {
  ouvrirRue?: (r: Rue) => void;
  marquerFaite?: (r: Rue) => void;
  ajouterRue?: (s: Secteur) => void;
  modifier?: (s: Secteur) => void;
  redessiner?: (s: Secteur) => void;
  supprimer?: (s: Secteur) => void;
}

export const Coche = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

/** Lien d'itinéraire à pied vers une rue (Google Maps, ou l'app Plans sur iPhone via le navigateur). */
export const lienItineraire = (rue: string, ville: string) =>
  "https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=" + encodeURIComponent(rue + (ville ? ", " + ville : ""));

/** Ligne d'information sous le nom d'une rue : état, précision, ventes. */
export function sousTitreRue(r: Rue): string {
  const morceaux: string[] = [ETATS[r.etat]];
  if (r.etat === "encours" && r.arret) morceaux[0] = "Arrêtée au " + r.arret.replace(/^au\s+/i, "");
  if (r.etat === "arepasser" && r.note) morceaux.push(r.note);
  if (r.etat === "faite" && r.repasse) morceaux[0] = "Faite (après repasse)";
  const somme = r.especes + r.cheques;
  if (r.vendus || somme) morceaux.push([r.vendus ? `${r.vendus} cal.` : "", somme ? eur(somme) : ""].filter(Boolean).join(" · "));
  return morceaux.join(" — ");
}

function ListeRues({ rues, onRue, onFaite, numeros }: {
  rues: Rue[]; onRue?: (r: Rue) => void; onFaite?: (r: Rue) => void; numeros?: Map<string, number>;
}) {
  return (
    <ul className="rues">
      {rues.map((r) => {
        const corps = (
          <>
            <span className="rue-nom">{r.nom}</span>
            <span className="rue-sous">
              {sousTitreRue(r)}
              {r.enAttente && <em className="en-attente"> · en attente d&apos;envoi</em>}
            </span>
          </>
        );
        const n = numeros?.get(r.id);
        return (
          <li key={r.id} className={`rue etat-${r.etat}`}>
            {numeros && (n ? <span className={`etape ${n === 1 ? "premiere" : ""}`} aria-label={`Étape ${n}`}>{n}</span> : null)}
            {onRue ? (
              <button type="button" className="rue-corps" onClick={() => onRue(r)} aria-label={`${r.nom} : ${sousTitreRue(r)}. Ouvrir la fiche`}>{corps}</button>
            ) : (
              <div className="rue-corps">{corps}</div>
            )}
            {onFaite && (r.etat === "faite" ? (
              <span className="coche faite" title="Rue faite" aria-hidden="true"><Coche /></span>
            ) : (
              <button type="button" className="coche" aria-label={`Marquer ${r.nom} comme faite`} title="Marquer comme faite" onClick={() => onFaite(r)}>
                <Coche />
              </button>
            ))}
          </li>
        );
      })}
    </ul>
  );
}

export function BlocSecteur({
  secteur, rues, equipe, montrerEquipe, compact, actions,
}: {
  secteur: Secteur;
  rues: Rue[];
  equipe: Equipe | undefined;
  ville?: string;
  montrerEquipe: boolean;
  /** Masque les chiffres du secteur quand un résumé les affiche déjà. */
  compact?: boolean;
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
  const aFaire = parcours ? parcours.etapes.map((e) => e.rue) : rues.filter((r) => r.etat !== "faite");
  const faites = parcours ? parcours.faites : rues.filter((r) => r.etat === "faite");
  const numeros = parcours ? new Map(parcours.etapes.map((e) => [e.rue.id, e.n])) : undefined;
  const departRue = reglage.depart && "rue" in reglage.depart ? reglage.depart.rue : "";
  const libelleDepart = reglage.depart && "point" in reglage.depart ? "depuis votre position"
    : departRue ? (rues.find((r) => r.id === departRue)?.nom ?? "rue choisie") : "automatique";

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
          {libelle(secteur.nom)}
        </h3>
        <span className="pct-secteur">{a.rues ? `${av.pct} %` : ""}</span>
      </div>
      {!compact && (
        <>
          <div className="line">
            {montrerEquipe && <span>Équipe : <strong>{equipe ? equipe.nom : "non attribuée"}</strong></span>}
            <span><strong>{a.faite}/{a.rues}</strong> rues{av.metresTotal ? ` · ${distance(av.metresFaits)} sur ${distance(av.metresTotal)}` : ""}</span>
            <span><strong>{a.vendus}</strong> cal.</span>
            <span><strong>{eur(a.somme)}</strong></span>
          </div>
          <Progression a={a} />
        </>
      )}
      {traces && aFaire.length > 1 && (
        <details className="depart-menu">
          <summary>
            {enParcours ? <>Ordre de passage · départ {libelleDepart}</> : "Liste dans l'ordre de saisie"}
          </summary>
          <div className="depart-options">
            <div className="seg-mini" role="group" aria-label="Ordre des rues">
              <button type="button" aria-pressed={enParcours} onClick={() => regler(secteur.id, { mode: "parcours" })}>Ordre de passage</button>
              <button type="button" aria-pressed={!enParcours} onClick={() => regler(secteur.id, { mode: "alpha" })}>Ordre de saisie</button>
            </div>
            {enParcours && (
              <>
                <button type="button" className="btn small" onClick={partirDIci} disabled={gps}>
                  {gps ? "Localisation…" : "Partir d'où je suis"}
                </button>
                <select aria-label="Commencer par la rue" value={departRue}
                  onChange={(e) => regler(secteur.id, { depart: e.target.value ? { rue: e.target.value } : null })}>
                  <option value="">Départ automatique (là où on s&apos;est arrêté)</option>
                  {aFaire.filter((r) => r.trace?.length).sort((x, y) => x.nom.localeCompare(y.nom, "fr")).map((r) => (
                    <option key={r.id} value={r.id}>Commencer par : {r.nom}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        </details>
      )}
      {!rues.length && <p className="hint">Aucune rue pour ce secteur.</p>}
      {rues.length > 0 && !aFaire.length && <p className="bravo">Toutes les rues de ce secteur sont faites. Bravo !</p>}
      <ListeRues rues={aFaire} onRue={actions.ouvrirRue} onFaite={actions.marquerFaite} numeros={numeros} />
      {faites.length > 0 && (
        <details className="faites">
          <summary>{faites.length} rue{faites.length > 1 ? "s" : ""} faite{faites.length > 1 ? "s" : ""}</summary>
          <ListeRues rues={faites} onRue={actions.ouvrirRue} onFaite={actions.marquerFaite} />
        </details>
      )}
      {(actions.ajouterRue || actions.modifier) && (
        <div className="bar">
          {actions.ajouterRue && (
            <button className="btn small" onClick={() => actions.ajouterRue!(secteur)}>+ Ajouter une rue</button>
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
      )}
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
