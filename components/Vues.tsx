"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { cleNom, ruesOsm } from "@/lib/osm";
import { noterRue } from "@/lib/fileAttente";
import { departParDefaut, milieu, ordonner } from "@/lib/parcours";
import { reglageDe, regler, useReglagesParcours, type Reglage } from "@/lib/useParcours";
import { messageErreur } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { agreger, argentEquipe, argentTotal, avancement, distance, prixMoyen, ruesDe } from "@/lib/agregats";
import { eur, ilya } from "@/lib/format";
import type { Donnees } from "@/lib/useTournee";
import { GRIS, type Config, type Equipe, type LngLat, type Rue, type Secteur } from "@/lib/types";
import { Chevron } from "./icones";
import { BlocSecteur, Coche, ResumeSecteur, lienItineraire, sousTitreRue, type ActionsSecteur } from "./Secteur";
import { DialogueAjoutRue, DialogueEquipe, DialogueFinale, DialogueRue, DialogueSecteur, ecrire } from "./Dialogues";
import { Kpis, Modal, Progression as Barre, toast } from "./ui";
import { exporterRecap, exporterRues } from "@/lib/export";
import { libelle, pastille } from "./Carte";

const Carte = dynamic(() => import("./Carte"), { ssr: false, loading: () => <div className="carte" /> });

type Dialogue =
  | { t: "rue"; rue: Rue }
  | { t: "ajout-rue"; secteur: Secteur }
  | { t: "equipe"; equipe: Equipe | null }
  | { t: "secteur"; secteur: Secteur | null; contour?: LngLat[] }
  | { t: "finale"; equipe: Equipe }
  | null;

/** État partagé par les deux vues : dialogues ouverts et actions sur les secteurs. */
function useActions(d: Donnees, admin: boolean, peutNoter: (s: Secteur) => boolean) {
  const [dialogue, setDialogue] = useState<Dialogue>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const [redessin, setRedessin] = useState<string | null>(null);

  const ruesPar = useMemo(() => {
    const m = new Map<string, Rue[]>();
    for (const r of d.rues) (m.get(r.secteur_id) ?? m.set(r.secteur_id, []).get(r.secteur_id)!).push(r);
    return m;
  }, [d.rues]);
  const ruesDu = (id: string) => ruesPar.get(id) ?? [];

  const actions = (s: Secteur): ActionsSecteur => ({
    ...(peutNoter(s)
      ? {
          ouvrirRue: (rue: Rue) => setDialogue({ t: "rue", rue }),
          marquerFaite: (rue: Rue) => marquerFaite(s, rue),
          ajouterRue: (secteur: Secteur) => setDialogue({ t: "ajout-rue", secteur }),
        }
      : {}),
    ...(admin
      ? {
          modifier: (secteur: Secteur) => setDialogue({ t: "secteur", secteur }),
          redessiner: (secteur: Secteur) => setRedessin(secteur.id),
          supprimer: (secteur: Secteur) => {
            if (!confirm(`Supprimer le secteur « ${secteur.nom} » et tout ce qui a été noté dedans ?`)) return;
            if (selection === secteur.id) setSelection(null);
            ecrire(() => supabase.from("secteurs").delete().eq("id", secteur.id));
          },
        }
      : {}),
  });

  /** Un appui sur ✓ : la rue passe « faite », le reste de sa fiche est conservé. */
  const marquerFaite = async (s: Secteur, rue: Rue) => {
    const rs = ruesDu(s.id);
    const apres = avancement(rs, (r) => (r.id === rue.id ? "faite" : r.etat));
    const avant = { etat: rue.etat, arret: rue.arret, note: rue.note, vendus: rue.vendus, especes: rue.especes, cheques: rue.cheques };
    const res = await noterRue(rue.id, { ...avant, etat: "faite" });
    const annuler = { libelle: "Annuler", faire: () => { noterRue(rue.id, avant).then((r) => typeof r === "object" && toast(messageErreur(r.erreur))); } };
    if (typeof res === "object") toast(messageErreur(res.erreur));
    else if (res === "attente") toast(`${rue.nom} faite (envoi au retour du réseau)`, annuler);
    else toast(`${rue.nom} faite · ${libelle(s.nom)} : ${apres.pct} %`, annuler);
  };

  const onDessin = async (contour: LngLat[], id: string | null) => {
    if (id) {
      if (await ecrire(() => supabase.from("secteurs").update({ contour }).eq("id", id))) setSelection(id);
    } else setDialogue({ t: "secteur", secteur: null, contour });
  };

  const fermer = () => setDialogue(null);
  let rendu = null;
  if (dialogue?.t === "rue") {
    const rue = d.rues.find((r) => r.id === dialogue.rue.id) ?? dialogue.rue;
    const secteur = d.secteurs.find((s) => s.id === rue.secteur_id);
    if (secteur) rendu = <DialogueRue rue={rue} secteur={secteur} ruesSecteur={ruesDu(secteur.id)} equipes={d.equipes} ville={d.config?.ville ?? ""} onClose={fermer} />;
  } else if (dialogue?.t === "ajout-rue") rendu = <DialogueAjoutRue secteur={dialogue.secteur} onClose={fermer} />;
  else if (dialogue?.t === "equipe") rendu = <DialogueEquipe equipe={dialogue.equipe} equipes={d.equipes} onClose={fermer} />;
  else if (dialogue?.t === "finale") {
    const equipe = d.equipes.find((e) => e.id === dialogue.equipe.id) ?? dialogue.equipe;
    rendu = <DialogueFinale equipe={equipe} rues={ruesDe(d.rues, d.secteurs.filter((s) => s.equipe_id === equipe.id))} onClose={fermer} />;
  } else if (dialogue?.t === "secteur")
    rendu = (
      <DialogueSecteur secteur={dialogue.secteur} contour={dialogue.contour} rues={dialogue.secteur ? ruesDu(dialogue.secteur.id) : []}
        equipes={d.equipes} onClose={fermer} onCree={setSelection} />
    );

  return { selection, setSelection, redessin, setRedessin, setDialogue, actions, ruesDu, onDessin, rendu };
}

/**
 * Récupère une fois le tracé OpenStreetMap des rues qui n'en ont pas encore,
 * pour pouvoir les surligner sur la carte. Rue introuvable → tracé vide (pas de nouvel essai).
 */
function useTraces(d: Donnees, equipeId?: string) {
  const tentes = useRef(new Set<string>());
  useEffect(() => {
    const aFaire = d.secteurs.filter((s) =>
      (!equipeId || s.equipe_id === equipeId) && s.contour.length >= 3 && !tentes.current.has(s.id) && d.rues.some((r) => r.secteur_id === s.id && r.trace === null));
    if (!aFaire.length) return;
    aFaire.forEach((s) => tentes.current.add(s.id));
    (async () => {
      for (const s of aFaire) {
        try {
          const osm = await ruesOsm(s.contour);
          for (const r of d.rues.filter((x) => x.secteur_id === s.id && x.trace === null)) {
            const trouvee = osm.get(cleNom(r.nom));
            await supabase.rpc("definir_trace", { p_rue: r.id, p_trace: trouvee?.trace ?? [] });
          }
        } catch {
          tentes.current.delete(s.id); // OpenStreetMap indisponible : on réessaiera plus tard
        }
      }
    })();
  }, [d.secteurs, d.rues, equipeId]);
}

/** Numéros d'étape à poser sur la carte pour les secteurs affichés en « ordre de passage ». */
function etapesCarte(secteurs: Secteur[], ruesDu: (id: string) => Rue[], reglages: Record<string, Reglage>) {
  const res: { n: number; pos: LngLat }[] = [];
  for (const s of secteurs) {
    const rs = ruesDu(s.id);
    const r = reglageDe(reglages, s.id);
    if (r.mode !== "parcours" || !rs.some((x) => x.trace?.length)) continue;
    for (const e of ordonner(rs, r.depart ?? departParDefaut(rs)).etapes) {
      const pos = milieu(e.rue);
      if (pos) res.push({ n: e.n, pos });
    }
  }
  return res;
}

const cadrer = (c: { lng: number; lat: number; zoom: number }) =>
  ecrire(() => supabase.from("config").update({ centre_lng: c.lng, centre_lat: c.lat, zoom: c.zoom }).eq("id", 1));

// ---------------------------------------------------------------- blocs de la colonne de droite

function ListeSecteurs({ d, ruesDu, selection, onSelect }: {
  d: Donnees; ruesDu: (id: string) => Rue[]; selection: string | null; onSelect: (id: string) => void;
}) {
  const couleur = (s: Secteur) => d.equipes.find((e) => e.id === s.equipe_id)?.couleur ?? GRIS;
  return (
    <section className="carte-blanche bloc" id="secteurs">
      <h2>Secteurs</h2>
      {!d.secteurs.length && <p className="hint" style={{ margin: 0 }}>Aucun secteur pour l&apos;instant.</p>}
      <ul className="liste-secteurs">
        {d.secteurs.map((s) => {
          const rs = ruesDu(s.id);
          const pct = rs.length ? avancement(rs).pct : 0;
          const c = couleur(s);
          return (
            <li key={s.id}>
              <button type="button" aria-pressed={selection === s.id} onClick={() => onSelect(s.id)}>
                <span className="pastille" style={{ background: c, color: c === "#F5C22E" ? "var(--ink)" : "#fff" }}>{pastille(s.nom)}</span>
                <span className="milieu">
                  <span className="nom">{libelle(s.nom)}</span>
                  <span className="jauge" style={{ marginTop: 0 }}><i style={{ width: `${pct}%`, background: c }} /></span>
                </span>
                <span className="val">{rs.length ? `${pct} %` : "—"}</span>
                <Chevron />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Progression({ a, depart, rues }: { a: ReturnType<typeof agreger>; depart: number; rues: Rue[] }) {
  const pct = depart ? Math.min(100, Math.round((a.vendus / depart) * 100)) : avancement(rues).pct;
  const tour = 2 * Math.PI * 52;
  return (
    <section className="carte-blanche bloc" id="progression">
      <h2>Progression globale</h2>
      <div className="donut">
        <div className="cercle">
          <svg width="128" height="128" viewBox="0 0 128 128" aria-hidden="true">
            <circle cx="64" cy="64" r="52" fill="none" stroke="#D7E6FA" strokeWidth="14" />
            <circle cx="64" cy="64" r="52" fill="none" stroke="var(--done)" strokeWidth="14" strokeDasharray={`${(pct / 100) * tour} ${tour}`} transform="rotate(-90 64 64)" />
          </svg>
          <div className="centre"><b>{pct} %</b><span>{depart ? "vendus" : "terminé"}</span></div>
        </div>
        <ul className="legende">
          <li><i style={{ background: "var(--done)" }} /><span>Vendus</span><b>{a.vendus}</b></li>
          {depart > 0 && <li><i style={{ background: "#6FA8F2" }} /><span>Restants</span><b>{depart - a.vendus}</b></li>}
          <li><i style={{ background: "var(--violet)" }} /><span>Rues faites</span><b>{a.faite}</b></li>
          <li><i style={{ background: "var(--signal)" }} /><span>Commencées</span><b>{a.encours}</b></li>
          <li><i style={{ background: "var(--repasser)" }} /><span>À repasser</span><b>{a.arepasser}</b></li>
        </ul>
      </div>
    </section>
  );
}

/** Pas-à-pas de mise en route, affiché tant qu'il reste une étape (masquable). */
function Demarrage({ d, config, onReglages, onEquipe, onDessiner }: {
  d: Donnees; config: Config; onReglages: () => void; onEquipe: () => void; onDessiner: () => void;
}) {
  const [masque, setMasque] = useState(() => { try { return localStorage.getItem("tournee-demarrage-masque") === "1"; } catch { return false; } });
  const etapes = [
    { fait: !!config.ville, texte: "Indiquer la commune (la carte se centre dessus)", action: "Réglages", faire: onReglages },
    { fait: d.equipes.length > 0, texte: "Créer les équipes (binômes, trinômes)", action: "Nouvelle équipe", faire: onEquipe },
    { fait: d.secteurs.length > 0, texte: "Dessiner les secteurs sur la carte", action: "Dessiner", faire: onDessiner },
    { fait: d.secteurs.length > 0 && d.secteurs.every((s) => d.rues.some((r) => r.secteur_id === s.id)), texte: "Vérifier que chaque secteur a ses rues" },
    { fait: d.secteurs.length > 0 && d.secteurs.every((s) => s.equipe_id), texte: "Attribuer chaque secteur à une équipe (« Modifier » sur le secteur)" },
    { fait: false, texte: "Envoyer à chaque équipe son lien : « Modifier l'équipe et son lien » → Partager", optionnel: true },
  ];
  const restantes = etapes.filter((e) => !e.fait && !e.optionnel).length;
  if (masque || restantes === 0) return null;
  return (
    <section className="carte-blanche demarrage" aria-label="Mise en route">
      <div className="bar" style={{ margin: 0 }}>
        <h2 className="grow" style={{ fontSize: "1.3rem" }}>Mise en route · {etapes.length - 1 - restantes}/{etapes.length - 1}</h2>
        <button type="button" className="btn small" onClick={() => { setMasque(true); try { localStorage.setItem("tournee-demarrage-masque", "1"); } catch { /* rien */ } }}>Masquer</button>
      </div>
      <ol>
        {etapes.map((e, i) => (
          <li key={i} className={e.fait ? "fait" : ""}>
            <span className="puce">{e.fait ? "✓" : i + 1}</span>
            <span className="texte">{e.texte}</span>
            {!e.fait && e.faire && <button type="button" className="btn small" onClick={e.faire}>{e.action}</button>}
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------- vue d'ensemble (admins)

export function VueEnsemble({ d, config, dessinDemande, onDessinActif, onReglages, onDessiner }: {
  d: Donnees; config: Config; dessinDemande: number; onDessinActif: (actif: boolean) => void;
  onReglages?: () => void; onDessiner?: () => void;
}) {
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set());
  const [exporter, setExport] = useState(false);
  const a = useActions(d, true, () => true);
  const reglages = useReglagesParcours();
  useTraces(d);
  const total = agreger(d.rues);
  const depart = d.equipes.reduce((t, e) => t + (Number(e.depart) || 0), 0);
  const choisi = d.secteurs.find((s) => s.id === a.selection);
  const equipe = (id: string | null) => d.equipes.find((e) => e.id === id);
  const basculer = (id: string) => setOuvertes((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const orphelins = d.secteurs.filter((s) => !equipe(s.equipe_id));
  const choisir = (id: string) => {
    a.setSelection(id);
    setTimeout(() => document.getElementById("detail-secteur")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  };

  return (
    <>
      <Demarrage d={d} config={config} onReglages={onReglages ?? (() => {})} onDessiner={onDessiner ?? (() => {})}
        onEquipe={() => a.setDialogue({ t: "equipe", equipe: null })} />
      <Kpis a={total} depart={depart} argent={argentTotal(d.equipes, d.secteurs, d.rues)} />
      <div className="zone-carte">
        <div className="gauche">
          <Carte config={config} equipes={d.equipes} secteurs={d.secteurs} rues={d.rues} selection={a.selection} onSelect={a.setSelection}
            admin onDessin={a.onDessin} onCadrage={cadrer} dessinDemande={dessinDemande} onDessinActif={onDessinActif}
            etapes={etapesCarte(d.secteurs.filter((s) => s.id === a.selection), a.ruesDu, reglages)}
            redessin={a.redessin} onRedessinFini={() => a.setRedessin(null)} />
          {choisi ? (
            <div className="card" id="detail-secteur">
              <BlocSecteur secteur={choisi} rues={a.ruesDu(choisi.id)} equipe={equipe(choisi.equipe_id)} ville={config.ville} montrerEquipe actions={a.actions(choisi)} />
            </div>
          ) : (
            <p className="hint" style={{ margin: 0 }}>
              {d.secteurs.length ? "Touchez un secteur sur la carte pour voir ses rues." : "Commencez par « Dessiner un secteur » : touchez la carte pour poser ses coins."}
            </p>
          )}
        </div>
        <div className="droite">
          {choisi && <ResumeSecteur secteur={choisi} rues={a.ruesDu(choisi.id)} equipe={equipe(choisi.equipe_id)} onFermer={() => a.setSelection(null)} />}
          <ListeSecteurs d={d} ruesDu={a.ruesDu} selection={a.selection} onSelect={choisir} />
          <Progression a={total} depart={depart} rues={d.rues} />
        </div>
      </div>

      <div className="titre-section" id="equipes">
        <h2>Équipes</h2>
        <button className="btn" onClick={() => setExport(true)}>Exporter les résultats</button>
        <button className="btn primary" onClick={() => a.setDialogue({ t: "equipe", equipe: null })}>Nouvelle équipe</button>
      </div>
      {exporter && (
        <Modal onClose={() => setExport(false)}>
          <h2>Exporter les résultats</h2>
          <p className="hint" style={{ margin: "6px 0 14px" }}>Fichiers à ouvrir avec Excel, LibreOffice ou Google Sheets.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button type="button" className="btn primary" style={{ justifyContent: "center", minHeight: 48 }}
              onClick={() => exporterRecap(config, d.equipes, d.secteurs, d.rues)}>
              Récapitulatif par équipe et par secteur
            </button>
            <button type="button" className="btn" style={{ justifyContent: "center", minHeight: 48 }}
              onClick={() => exporterRues(config, d.equipes, d.secteurs, d.rues)}>
              Détail rue par rue
            </button>
          </div>
          <div className="row"><button type="button" className="btn" onClick={() => setExport(false)}>Fermer</button></div>
        </Modal>
      )}
      {!d.equipes.length && (
        <div className="empty">
          <strong>Aucune équipe</strong>Créez vos binômes et trinômes avec leur nombre de calendriers au départ, puis envoyez-leur leur lien.
        </div>
      )}
      {d.equipes.map((t) => {
        const secs = d.secteurs.filter((s) => s.equipe_id === t.id);
        const ta = agreger(secs.flatMap((s) => a.ruesDu(s.id)));
        const argent = argentEquipe(t, ta);
        const prix = prixMoyen(argent.somme, ta.vendus);
        const dep = Number(t.depart) || 0;
        const ouverte = ouvertes.has(t.id);
        const muette = ta.maj > 0 && ta.faite < ta.rues && Date.now() - ta.maj > 45 * 60000;
        return (
          <section className="card" key={t.id}>
            <div className="team-head" role="button" tabIndex={0} aria-expanded={ouverte} onClick={() => basculer(t.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); basculer(t.id); } }}>
              <div>
                <h2><span className="swatch" style={{ background: t.couleur }} />{t.nom}</h2>
                {t.membres && <div className="hint">{t.membres}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="num" style={{ fontSize: "1.4rem", whiteSpace: "nowrap" }}>{eur(argent.somme)}</div>
                {argent.finale && <span className="tag">somme finale</span>}
              </div>
            </div>
            <div className="line">
              <span><strong>{ta.vendus}</strong>{dep ? ` / ${dep}` : ""} cal. vendus</span>
              {dep > 0 && <span><strong>{dep - ta.vendus}</strong> restants</span>}
              <span><strong>{ta.faite}/{ta.rues}</strong> rues</span>
              {prix !== null && <span><strong>{eur(prix)}</strong> / calendrier</span>}
              {ta.arepasser > 0 && <span style={{ color: "var(--repasser)" }}><strong style={{ color: "inherit" }}>{ta.arepasser}</strong> à repasser</span>}
              <span style={muette ? { color: "var(--danger)" } : undefined}>{muette ? "sans nouvelles " : ""}{ilya(ta.maj || null)}</span>
            </div>
            <Barre a={ta} />
            {ouverte && (
              <>
                {secs.length ? (
                  secs.map((s) => <BlocSecteur key={s.id} secteur={s} rues={a.ruesDu(s.id)} equipe={t} ville={config.ville} montrerEquipe={false} actions={a.actions(s)} />)
                ) : (
                  <p className="hint">Aucun secteur attribué.</p>
                )}
                <div className="bar">
                  <button className="btn small" onClick={() => a.setDialogue({ t: "finale", equipe: t })}>
                    {argent.finale ? "Modifier la somme finale" : "Déclarer la somme finale"}
                  </button>
                  <span className="grow" />
                  <button className="btn small" onClick={() => a.setDialogue({ t: "equipe", equipe: t })}>Modifier l&apos;équipe et son lien</button>
                  <button className="btn small danger" onClick={() => {
                    if (confirm(`Supprimer l'équipe « ${t.nom} » ? Ses secteurs resteront, sans équipe.`))
                      ecrire(() => supabase.from("equipes").delete().eq("id", t.id));
                  }}>Supprimer</button>
                </div>
              </>
            )}
          </section>
        );
      })}
      {orphelins.length > 0 && (
        <p className="hint">
          Secteurs sans équipe : {orphelins.map((s) => s.nom).join(", ")}. Touchez-les sur la carte puis « Modifier » pour les attribuer.
        </p>
      )}
      {a.rendu}
    </>
  );
}

// ---------------------------------------------------------------- vue équipe

/** Résumé compact de l'équipe (remplace les 6 compteurs sur la page équipe). */
function ResumeEquipe({ t, rues, argent }: { t: Equipe; rues: Rue[]; argent: ReturnType<typeof argentEquipe> }) {
  const a = agreger(rues);
  const av = avancement(rues);
  const dep = Number(t.depart) || 0;
  return (
    <section className="carte-blanche resume-equipe" aria-label="Résumé de l'équipe">
      <div className="argent">{eur(argent.somme)}</div>
      <div className="chiffres">
        <span><strong>{a.vendus}</strong>{dep ? ` / ${dep}` : ""} cal.</span>
        <span><strong>{a.faite}</strong>/{a.rues} rues</span>
        {a.arepasser > 0 && <span style={{ color: "var(--repasser)" }}><strong style={{ color: "inherit" }}>{a.arepasser}</strong> à repasser</span>}
      </div>
      <div className="jauge"><i style={{ width: `${av.pct}%`, background: "var(--done)" }} /></div>
      <div className="legende-pct">
        {av.pct} % parcouru{av.metresTotal ? ` · ${distance(av.metresFaits)} sur ${distance(av.metresTotal)}` : ""}
        {argent.finale ? " · somme finale déclarée" : ""}
      </div>
    </section>
  );
}

/** La prochaine rue à faire, selon l'ordre de passage, avec les gestes principaux en gros. */
function ProchaineRue({ secs, ruesDu, reglages, ville, onFaite, onOuvrir }: {
  secs: Secteur[]; ruesDu: (id: string) => Rue[]; reglages: Record<string, Reglage>; ville: string;
  onFaite: (s: Secteur, r: Rue) => void; onOuvrir: (r: Rue) => void;
}) {
  for (const s of secs) {
    const rs = ruesDu(s.id);
    const r = reglageDe(reglages, s.id);
    const { etapes } = ordonner(rs, r.depart ?? departParDefaut(rs));
    const e = etapes[0];
    if (!e) continue;
    const suivante = etapes[1]?.rue;
    return (
      <section className="carte-blanche prochaine" aria-label="Prochaine rue">
        <div className="surtitre">Prochaine rue · {libelle(s.nom)} · {etapes.length} restante{etapes.length > 1 ? "s" : ""}</div>
        <h2>{e.rue.nom}</h2>
        <p className="info">{sousTitreRue(e.rue)}</p>
        <div className="actions-rue">
          <button type="button" className="btn vert" onClick={() => onFaite(s, e.rue)}><Coche size={22} /> Rue faite</button>
          <button type="button" className="btn" onClick={() => onOuvrir(e.rue)}>Noter les ventes</button>
          <a className="btn" href={lienItineraire(e.rue.nom, ville)} target="_blank" rel="noopener">Y aller</a>
        </div>
        {suivante && (
          <button type="button" className="btn lien passer" onClick={() => regler(s.id, { mode: "parcours", depart: { rue: suivante.id } })}>
            Passer cette rue pour l&apos;instant (suivante : {suivante.nom})
          </button>
        )}
      </section>
    );
  }
  if (!secs.length) return null;
  return <p className="bravo">Toutes vos rues sont faites. Bravo et merci !</p>;
}

export function VueEquipe({ d, config, equipeId, admin }: { d: Donnees; config: Config; equipeId: string; admin: boolean }) {
  const a = useActions(d, false, (s) => admin || s.equipe_id === equipeId);
  useTraces(d, equipeId);
  const reglages = useReglagesParcours();
  const [onglet, setOnglet] = useState<"rues" | "carte">("rues");
  const t = d.equipes.find((e) => e.id === equipeId);
  if (!t) return <div className="empty"><strong>Équipe introuvable</strong>Elle a peut-être été supprimée. Demandez un nouveau lien à votre responsable.</div>;
  const secs = d.secteurs.filter((s) => s.equipe_id === t.id);
  const ruesEquipe = secs.flatMap((s) => a.ruesDu(s.id));
  const ta = agreger(ruesEquipe);
  const argent = argentEquipe(t, ta);
  return (
    <>
      <ResumeEquipe t={t} rues={ruesEquipe} argent={argent} />
      {secs.length > 0 && (
        <ProchaineRue secs={secs} ruesDu={a.ruesDu} reglages={reglages} ville={config.ville}
          onFaite={(s, r) => a.actions(s).marquerFaite?.(r)} onOuvrir={(r) => a.actions(secs.find((s) => s.id === r.secteur_id)!).ouvrirRue?.(r)} />
      )}
      <div className="onglets-equipe" role="tablist" aria-label="Affichage">
        <button type="button" role="tab" aria-selected={onglet === "rues"} onClick={() => setOnglet("rues")}>Rues</button>
        <button type="button" role="tab" aria-selected={onglet === "carte"} onClick={() => setOnglet("carte")}>Carte</button>
      </div>
      {onglet === "carte" ? (
        <Carte config={config} equipes={d.equipes} secteurs={d.secteurs} rues={d.rues} focusEquipe={t.id} selection={a.selection}
          etapes={etapesCarte(secs, a.ruesDu, reglages)}
          onSelect={(id) => a.setSelection(id)} admin={false} />
      ) : secs.length ? (
        secs.map((s) => (
          <div className="card" key={s.id} id={`secteur-${s.id}`}>
            <BlocSecteur secteur={s} rues={a.ruesDu(s.id)} equipe={t} ville={config.ville} montrerEquipe={false} actions={a.actions(s)} />
          </div>
        ))
      ) : (
        <div className="empty"><strong>Aucun secteur attribué</strong>Demandez à un responsable de vous attribuer un secteur.</div>
      )}
      <section className="card finale">
        <div style={{ flexGrow: 1, minWidth: 200 }}>
          <h3>Fin de tournée</h3>
          <span className="hint">
            {argent.finale ? `Somme finale déclarée : ${eur(argent.somme)}` : "Facultatif : déclarez l'argent réellement remis pour les statistiques."}
          </span>
        </div>
        <button className="btn" onClick={() => a.setDialogue({ t: "finale", equipe: t })}>
          {argent.finale ? "Modifier la somme finale" : "Déclarer la somme finale"}
        </button>
      </section>
      {a.rendu}
    </>
  );
}
