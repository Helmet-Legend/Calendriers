"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { agreger } from "@/lib/agregats";
import { eur, ilya } from "@/lib/format";
import type { Donnees } from "@/lib/useTournee";
import type { Config, Equipe, LngLat, Rue, Secteur } from "@/lib/types";
import { BlocSecteur, type ActionsSecteur } from "./Secteur";
import { DialogueAjoutRue, DialogueEquipe, DialogueRue, DialogueSecteur, ecrire } from "./Dialogues";
import { Kpis, Progression } from "./ui";

const Carte = dynamic(() => import("./Carte"), { ssr: false, loading: () => <div className="carte" /> });

type Dialogue =
  | { t: "rue"; rue: Rue }
  | { t: "ajout-rue"; secteur: Secteur }
  | { t: "equipe"; equipe: Equipe | null }
  | { t: "secteur"; secteur: Secteur | null; contour?: LngLat[] }
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
    ...(peutNoter(s) ? { ouvrirRue: (rue: Rue) => setDialogue({ t: "rue", rue }), ajouterRue: (secteur: Secteur) => setDialogue({ t: "ajout-rue", secteur }) } : {}),
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
    if (secteur) rendu = <DialogueRue rue={rue} secteur={secteur} equipes={d.equipes} onClose={fermer} />;
  } else if (dialogue?.t === "ajout-rue") rendu = <DialogueAjoutRue secteur={dialogue.secteur} onClose={fermer} />;
  else if (dialogue?.t === "equipe") rendu = <DialogueEquipe equipe={dialogue.equipe} equipes={d.equipes} onClose={fermer} />;
  else if (dialogue?.t === "secteur")
    rendu = (
      <DialogueSecteur secteur={dialogue.secteur} contour={dialogue.contour} rues={dialogue.secteur ? ruesDu(dialogue.secteur.id) : []}
        equipes={d.equipes} onClose={fermer} onCree={setSelection} />
    );

  return { selection, setSelection, redessin, setRedessin, setDialogue, actions, ruesDu, onDessin, rendu };
}

const cadrer = (c: { lng: number; lat: number; zoom: number }) =>
  ecrire(() => supabase.from("config").update({ centre_lng: c.lng, centre_lat: c.lat, zoom: c.zoom }).eq("id", 1));

// ---------------------------------------------------------------- vue d'ensemble (admins)

export function VueEnsemble({ d, config }: { d: Donnees; config: Config }) {
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set());
  const a = useActions(d, true, () => true);
  const total = agreger(d.rues);
  const depart = d.equipes.reduce((t, e) => t + (Number(e.depart) || 0), 0);
  const choisi = d.secteurs.find((s) => s.id === a.selection);
  const equipe = (id: string | null) => d.equipes.find((e) => e.id === id);
  const basculer = (id: string) => setOuvertes((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const orphelins = d.secteurs.filter((s) => !equipe(s.equipe_id));

  return (
    <>
      <div className="hero">
        <span className="num">{eur(total.somme)}</span>
        <span className="muted">collectés sur la tournée ({eur(total.especes)} en espèces, {eur(total.cheques)} en chèques)</span>
      </div>
      <Kpis a={total} depart={depart} />
      <Carte config={config} equipes={d.equipes} secteurs={d.secteurs} rues={d.rues} selection={a.selection} onSelect={a.setSelection}
        admin onDessin={a.onDessin} onCadrage={cadrer} redessin={a.redessin} onRedessinFini={() => a.setRedessin(null)} />
      {choisi ? (
        <div className="card" style={{ marginTop: 12 }}>
          <BlocSecteur secteur={choisi} rues={a.ruesDu(choisi.id)} equipe={equipe(choisi.equipe_id)} ville={config.ville} montrerEquipe actions={a.actions(choisi)} />
        </div>
      ) : d.secteurs.length ? (
        <p className="hint">Touchez un secteur sur la carte pour voir ses rues.</p>
      ) : (
        <p className="hint">Commencez par « Dessiner un secteur » : touchez la carte pour poser ses coins.</p>
      )}

      <div className="bar" style={{ marginTop: 22 }}>
        <h2 className="grow">Équipes</h2>
        <button className="btn primary" onClick={() => a.setDialogue({ t: "equipe", equipe: null })}>Nouvelle équipe</button>
      </div>
      {!d.equipes.length && (
        <div className="empty">
          <strong>Aucune équipe</strong>Créez vos binômes et trinômes avec leur nombre de calendriers au départ, puis envoyez-leur leur lien.
        </div>
      )}
      {d.equipes.map((t) => {
        const secs = d.secteurs.filter((s) => s.equipe_id === t.id);
        const ta = agreger(secs.flatMap((s) => a.ruesDu(s.id)));
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
              <div className="num" style={{ fontSize: "1.4rem", whiteSpace: "nowrap" }}>{eur(ta.somme)}</div>
            </div>
            <div className="line">
              <span><strong>{ta.vendus}</strong>{dep ? ` / ${dep}` : ""} cal. vendus</span>
              {dep > 0 && <span><strong>{dep - ta.vendus}</strong> restants</span>}
              <span><strong>{ta.faite}/{ta.rues}</strong> rues</span>
              {ta.arepasser > 0 && <span style={{ color: "var(--redo)" }}><strong style={{ color: "inherit" }}>{ta.arepasser}</strong> à repasser</span>}
              <span style={muette ? { color: "var(--danger)" } : undefined}>{muette ? "sans nouvelles " : ""}{ilya(ta.maj || null)}</span>
            </div>
            <Progression a={ta} />
            {ouverte && (
              <>
                {secs.length ? (
                  secs.map((s) => <BlocSecteur key={s.id} secteur={s} rues={a.ruesDu(s.id)} equipe={t} ville={config.ville} montrerEquipe={false} actions={a.actions(s)} />)
                ) : (
                  <p className="hint">Aucun secteur attribué.</p>
                )}
                <div className="bar">
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

export function VueEquipe({ d, config, equipeId, admin }: { d: Donnees; config: Config; equipeId: string; admin: boolean }) {
  const a = useActions(d, false, (s) => admin || s.equipe_id === equipeId);
  const t = d.equipes.find((e) => e.id === equipeId);
  if (!t) return <div className="empty"><strong>Équipe introuvable</strong>Elle a peut-être été supprimée. Demandez un nouveau lien à votre responsable.</div>;
  const secs = d.secteurs.filter((s) => s.equipe_id === t.id);
  const ta = agreger(secs.flatMap((s) => a.ruesDu(s.id)));
  const dep = Number(t.depart) || 0;
  return (
    <>
      <div className="hero">
        <span className="num">{eur(ta.somme)}</span>
        <span className="muted">collectés par {t.nom}</span>
      </div>
      <Kpis a={ta} depart={dep} />
      <Carte config={config} equipes={d.equipes} secteurs={d.secteurs} rues={d.rues} focusEquipe={t.id} selection={a.selection}
        onSelect={(id) => {
          a.setSelection(id);
          if (id) document.getElementById(`secteur-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }} admin={false} />
      {secs.length ? (
        <>
          <p className="hint" style={{ marginTop: 12 }}>Touchez une rue pour noter où vous en êtes.</p>
          {secs.map((s) => (
            <div className="card" key={s.id} id={`secteur-${s.id}`}>
              <BlocSecteur secteur={s} rues={a.ruesDu(s.id)} equipe={t} ville={config.ville} montrerEquipe={false} actions={a.actions(s)} />
            </div>
          ))}
        </>
      ) : (
        <div className="empty" style={{ marginTop: 12 }}><strong>Aucun secteur attribué</strong>Demandez à un admin de vous attribuer un secteur.</div>
      )}
      {a.rendu}
    </>
  );
}
