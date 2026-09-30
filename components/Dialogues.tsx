"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ruesDansZone } from "@/lib/osm";
import { noterRue } from "@/lib/fileAttente";
import { eur, ilya, messageErreur, montant } from "@/lib/format";
import { agreger, avancement, distance, prixMoyen } from "@/lib/agregats";
import { COULEURS, ETATS, type Config, type Equipe, type Etat, type Historique, type LngLat, type Rue, type Secteur } from "@/lib/types";
import { Boutons, Modal, toast } from "./ui";
import { libelle } from "./Carte";

/** Exécute une écriture Supabase et signale l'échec ; renvoie false pour garder le dialogue ouvert. */
export async function ecrire(f: () => PromiseLike<{ error: unknown }>): Promise<boolean> {
  try {
    const { error } = await f();
    if (error) throw error;
    return true;
  } catch (e) {
    toast(messageErreur(e));
    return false;
  }
}

const saisie = (n: number) => (n ? String(n).replace(".", ",") : "");

// ---------------------------------------------------------------- rue

export function DialogueRue({ rue, secteur, ruesSecteur, equipes, onClose }: {
  rue: Rue; secteur: Secteur; ruesSecteur: Rue[]; equipes: Equipe[]; onClose: () => void;
}) {
  const [etat, setEtat] = useState<Etat>(rue.etat);
  const [arret, setArret] = useState(rue.arret);
  const [note, setNote] = useState(rue.note);
  const [vendus, setVendus] = useState(String(rue.vendus));
  const [especes, setEspeces] = useState(saisie(rue.especes));
  const [cheques, setCheques] = useState(saisie(rue.cheques));
  const [histo, setHisto] = useState<Historique[] | null>(null);

  useEffect(() => {
    supabase.from("historique").select("*").eq("rue_id", rue.id).order("a", { ascending: false }).limit(8)
      .then(({ data }) => setHisto((data as Historique[]) ?? []));
  }, [rue.id]);

  // Avancement du secteur, recalculé avec l'état choisi pour cette rue.
  const avant = avancement(ruesSecteur);
  const apres = avancement(ruesSecteur, (r) => (r.id === rue.id ? etat : r.etat));
  const total = apres.total, faitesAvant = avant.faites, faitesApres = apres.faites;
  const pctAvant = avant.pct, pctApres = apres.pct;

  const pas = (d: number) => setVendus(String(Math.max(0, (parseInt(vendus) || 0) + d)));
  const nomEquipe = (id: string | null) => equipes.find((e) => e.id === id)?.nom ?? "admin";

  const enregistrer = async () => {
    const r = await noterRue(rue.id, {
      etat, arret: arret.trim().slice(0, 80), note: note.trim().slice(0, 300),
      vendus: Math.round(montant(vendus)), especes: montant(especes), cheques: montant(cheques),
    });
    if (typeof r === "object") { toast(messageErreur(r.erreur)); return false; }
    if (r === "attente") toast("Pas de réseau : saisie gardée sur le téléphone, envoi automatique au retour du réseau");
    else if (faitesApres !== faitesAvant) toast(`${libelle(secteur.nom)} : ${pctApres} % fait (${faitesApres}/${total} rues)`);
    return true;
  };

  return (
    <Modal onClose={onClose} onSubmit={enregistrer}>
      <h2>{rue.nom}</h2>
      <p className="hint" style={{ margin: "2px 0 0" }}>{libelle(secteur.nom)}</p>
      <div className="avancement" aria-live="polite">
        <div className="av-ligne">
          <span>Avancement du secteur</span>
          <b>
            {pctApres !== pctAvant ? <><s>{pctAvant} %</s> → </> : null}
            {pctApres} %
          </b>
        </div>
        <div className="jauge"><i style={{ width: `${pctApres}%`, background: "var(--done)" }} /></div>
        <span className="hint">
          {faitesApres} rue{faitesApres > 1 ? "s" : ""} faite{faitesApres > 1 ? "s" : ""} sur {total}
          {apres.metresTotal ? ` · ${distance(apres.metresFaits)} sur ${distance(apres.metresTotal)}` : ""}
        </span>
      </div>
      <label>Où en est la rue ?</label>
      <div className="seg">
        {(Object.keys(ETATS) as Etat[]).map((k) => (
          <label key={k}>
            <input type="radio" name="etat" value={k} checked={etat === k} onChange={() => setEtat(k)} />
            {ETATS[k]}
          </label>
        ))}
      </div>
      {etat === "encours" && (
        <>
          <label htmlFor="f-arret">Arrêtée à</label>
          <input id="f-arret" maxLength={80} placeholder="n° 24, ou angle rue Pasteur" value={arret} onChange={(e) => setArret(e.target.value)} />
        </>
      )}
      {etat === "arepasser" && (
        <>
          <label htmlFor="f-note">À repasser <span className="hint">numéros absents, horaires…</span></label>
          <textarea id="f-note" rows={2} maxLength={300} placeholder="n° 3, 7 et 12 absents, repasser samedi matin" value={note} onChange={(e) => setNote(e.target.value)} />
        </>
      )}
      <label htmlFor="f-vendus">Calendriers vendus dans la rue</label>
      <div className="stepper">
        <button type="button" onClick={() => pas(-1)} aria-label="Un de moins">−</button>
        <input id="f-vendus" type="number" inputMode="numeric" min={0} value={vendus} onChange={(e) => setVendus(e.target.value)} />
        <button type="button" onClick={() => pas(1)} aria-label="Un de plus">+</button>
      </div>
      <div className="duo">
        <div>
          <label htmlFor="f-especes">Espèces (€) <span className="hint">facultatif</span></label>
          <input id="f-especes" inputMode="decimal" placeholder="0" value={especes} onChange={(e) => setEspeces(e.target.value)} />
        </div>
        <div>
          <label htmlFor="f-cheques">Chèques (€) <span className="hint">facultatif</span></label>
          <input id="f-cheques" inputMode="decimal" placeholder="0" value={cheques} onChange={(e) => setCheques(e.target.value)} />
        </div>
      </div>
      {histo && histo.length > 0 && (
        <>
          <label>Historique</label>
          <ul className="histo">
            {histo.map((h) => (
              <li key={h.id}>
                {ilya(h.a)} · {nomEquipe(h.equipe_id)} · {ETATS[h.etat]}, {h.vendus} cal., {eur(Number(h.especes) + Number(h.cheques))}
              </li>
            ))}
          </ul>
        </>
      )}
      <Boutons valider="Enregistrer" onClose={onClose} />
    </Modal>
  );
}

export function DialogueAjoutRue({ secteur, onClose }: { secteur: Secteur; onClose: () => void }) {
  const [nom, setNom] = useState("");
  return (
    <Modal onClose={onClose} onSubmit={() => nom.trim() ? ecrire(() => supabase.rpc("ajouter_rue", { p_secteur: secteur.id, p_nom: nom.trim() })) : false}>
      <h2>Ajouter une rue</h2>
      <label htmlFor="f-rue">Nom de la rue</label>
      <input id="f-rue" required maxLength={100} placeholder="Rue Victor Hugo" value={nom} onChange={(e) => setNom(e.target.value)} autoFocus />
      <Boutons valider="Ajouter" onClose={onClose} />
    </Modal>
  );
}

// ---------------------------------------------------------------- équipe

export function DialogueEquipe({ equipe, equipes, onClose }: { equipe: Equipe | null; equipes: Equipe[]; onClose: () => void }) {
  const libre = COULEURS.find((c) => !equipes.some((e) => e.couleur === c)) ?? COULEURS[0];
  const [nom, setNom] = useState(equipe?.nom ?? "");
  const [membres, setMembres] = useState(equipe?.membres ?? "");
  const [depart, setDepart] = useState(equipe?.depart ? String(equipe.depart) : "");
  const [couleur, setCouleur] = useState(equipe?.couleur ?? libre);
  const [jeton, setJeton] = useState<string | null>(null);

  useEffect(() => {
    if (!equipe) return;
    supabase.from("jetons_equipe").select("jeton").eq("equipe_id", equipe.id).maybeSingle()
      .then(({ data }) => setJeton(data?.jeton ?? null));
  }, [equipe]);

  const lien = jeton ? `${location.origin}/e/${jeton}` : "";
  const copier = async () => {
    try {
      if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) await navigator.share({ title: `Tournée — ${nom}`, url: lien });
      else { await navigator.clipboard.writeText(lien); toast("Lien copié"); }
    } catch { /* partage annulé */ }
  };
  const renouveler = async () => {
    if (!equipe || !confirm("Créer un nouveau lien ? L'ancien ne permettra plus de rejoindre l'équipe, et les téléphones déjà connectés seront déconnectés.")) return;
    const nouveau = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    if (await ecrire(() => supabase.from("jetons_equipe").update({ jeton: nouveau }).eq("equipe_id", equipe.id))) {
      await supabase.from("membres_equipe").delete().eq("equipe_id", equipe.id);
      setJeton(nouveau);
      toast("Nouveau lien créé");
    }
  };

  const enregistrer = () => {
    if (!nom.trim()) return false;
    const data = { nom: nom.trim(), membres: membres.trim(), depart: Math.round(montant(depart)), couleur };
    return ecrire(() => equipe ? supabase.from("equipes").update(data).eq("id", equipe.id) : supabase.from("equipes").insert(data));
  };

  return (
    <Modal onClose={onClose} onSubmit={enregistrer}>
      <h2>{equipe ? "Modifier l'équipe" : "Nouvelle équipe"}</h2>
      <label htmlFor="f-nom">Nom</label>
      <input id="f-nom" required maxLength={60} placeholder="Binôme 1" value={nom} onChange={(e) => setNom(e.target.value)} />
      <label htmlFor="f-mem">Membres <span className="hint">(facultatif)</span></label>
      <input id="f-mem" maxLength={120} placeholder="Léa, Karim" value={membres} onChange={(e) => setMembres(e.target.value)} />
      <label htmlFor="f-dep">Calendriers au départ</label>
      <input id="f-dep" type="number" inputMode="numeric" min={0} placeholder="120" value={depart} onChange={(e) => setDepart(e.target.value)} />
      <label>Couleur sur la carte</label>
      <div className="colors">
        {COULEURS.map((c) => (
          <label key={c} style={{ background: c }} aria-label={`Couleur ${c}`}>
            <input type="radio" name="col" checked={couleur === c} onChange={() => setCouleur(c)} />
          </label>
        ))}
      </div>
      {equipe && (
        <>
          <label htmlFor="f-lien">Lien d&apos;accès de l&apos;équipe</label>
          <div className="copie">
            <input id="f-lien" readOnly value={lien || "…"} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn small" onClick={copier} disabled={!lien}>Partager</button>
          </div>
          <p className="hint">
            Envoyez ce lien à l&apos;équipe (SMS, WhatsApp). Il suffit de l&apos;ouvrir une fois sur chaque téléphone.{" "}
            <button type="button" className="btn lien" onClick={renouveler}>Créer un nouveau lien</button>
          </p>
        </>
      )}
      <Boutons valider={equipe ? "Enregistrer" : "Créer"} onClose={onClose} />
    </Modal>
  );
}

// ---------------------------------------------------------------- secteur

export function DialogueSecteur({
  secteur, contour, rues, equipes, onClose, onCree,
}: {
  secteur: Secteur | null;
  contour?: LngLat[];
  rues: Rue[];
  equipes: Equipe[];
  onClose: () => void;
  onCree?: (id: string) => void;
}) {
  const [nom, setNom] = useState(secteur?.nom ?? "");
  const [equipeId, setEquipeId] = useState(secteur?.equipe_id ?? "");
  const [liste, setListe] = useState(rues.map((r) => r.nom).join("\n"));
  const [recherche, setRecherche] = useState(false);
  const [statut, setStatut] = useState("");
  const zone = contour ?? secteur?.contour ?? [];

  const remplir = async () => {
    if (zone.length < 3 || recherche) return;
    setRecherche(true);
    setStatut("Recherche des rues de la zone sur OpenStreetMap…");
    try {
      const trouvees = await ruesDansZone(zone);
      const actuelles = liste.split("\n").map((x) => x.trim()).filter(Boolean);
      const connues = new Set(actuelles.map((x) => x.toLowerCase()));
      const ajout = trouvees.filter((n) => !connues.has(n.toLowerCase()));
      setListe([...actuelles, ...ajout].join("\n"));
      setStatut(ajout.length ? `${ajout.length} rue${ajout.length > 1 ? "s" : ""} ajoutée${ajout.length > 1 ? "s" : ""} depuis la carte.` : "Aucune nouvelle rue trouvée dans la zone.");
    } catch {
      setStatut("Impossible de récupérer les rues (serveurs OpenStreetMap indisponibles). Réessayez dans un instant.");
    } finally {
      setRecherche(false);
    }
  };

  // Nouveau secteur dessiné : on pré-remplit directement la liste.
  useEffect(() => {
    if (!secteur && contour && contour.length >= 3) remplir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enregistrer = async () => {
    if (!nom.trim()) return false;
    if (recherche) return false;
    const noms = liste.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 300);
    const data = { nom: nom.trim(), equipe_id: equipeId || null, ...(contour ? { contour } : {}) };
    let id = secteur?.id;
    if (secteur) {
      if (!(await ecrire(() => supabase.from("secteurs").update(data).eq("id", secteur.id)))) return false;
    } else {
      const { data: cree, error } = await supabase.from("secteurs").insert(data).select("id").single();
      if (error) return ecrire(async () => ({ error }));
      id = cree.id as string;
    }
    // Rapprochement des rues : on garde le suivi des rues conservées (même nom).
    const restantes = [...rues];
    const garder: { id: string; ordre: number }[] = [];
    const nouvelles: { secteur_id: string; nom: string; ordre: number }[] = [];
    noms.forEach((n, i) => {
      const k = restantes.findIndex((r) => r.nom === n);
      if (k >= 0) garder.push({ id: restantes.splice(k, 1)[0].id, ordre: i });
      else nouvelles.push({ secteur_id: id!, nom: n, ordre: i });
    });
    const ok = await ecrire(async () => {
      if (restantes.length) {
        const r = await supabase.from("rues").delete().in("id", restantes.map((r) => r.id));
        if (r.error) return r;
      }
      for (const g of garder) {
        const r = await supabase.from("rues").update({ ordre: g.ordre }).eq("id", g.id);
        if (r.error) return r;
      }
      return nouvelles.length ? supabase.from("rues").insert(nouvelles) : { error: null };
    });
    if (ok && id && !secteur) onCree?.(id);
    return ok;
  };

  return (
    <Modal onClose={onClose} onSubmit={enregistrer}>
      <h2>{secteur ? "Modifier le secteur" : "Nouveau secteur"}</h2>
      <label htmlFor="f-nom">Nom du secteur</label>
      <input id="f-nom" required maxLength={40} placeholder="Secteur A" value={nom} onChange={(e) => setNom(e.target.value)} />
      <label htmlFor="f-eq">Équipe</label>
      <select id="f-eq" value={equipeId} onChange={(e) => setEquipeId(e.target.value)}>
        <option value="">Pas encore attribué</option>
        {equipes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
      </select>
      <label htmlFor="f-rues">Rues du secteur <span className="hint">une par ligne</span></label>
      {zone.length >= 3 && (
        <div className="bar" style={{ marginTop: 0 }}>
          <button type="button" className="btn small" onClick={remplir} disabled={recherche}>
            {recherche ? "Recherche des rues…" : "Remplir depuis la carte"}
          </button>
          <span className="hint">ajoute les rues de la zone, vérifiez ensuite la liste</span>
        </div>
      )}
      {statut && <p className="hint" role="status" style={{ margin: "0 0 8px", fontWeight: 600 }}>{statut}</p>}
      <textarea id="f-rues" rows={10} placeholder={"Rue Victor Hugo\nAvenue Jean Jaurès\nImpasse des Lilas"} value={liste} onChange={(e) => setListe(e.target.value)} />
      <p className="hint">Rues d&apos;OpenStreetMap ayant au moins un bout dans la zone : retirez celles qui ne font que la longer.</p>
      {secteur && <p className="hint">Retirer une rue de la liste efface aussi ce qui a été noté pour elle.</p>}
      <Boutons valider={recherche ? "Recherche des rues…" : secteur ? "Enregistrer" : "Créer le secteur"} onClose={onClose} />
    </Modal>
  );
}

// ---------------------------------------------------------------- réglages

async function geocoder(ville: string): Promise<{ lng: number; lat: number } | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token || !ville) return null;
  try {
    const r = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(ville)}&country=fr&types=place,locality&language=fr&limit=1&access_token=${token}`);
    const j = await r.json();
    const c = j.features?.[0]?.geometry?.coordinates;
    return c ? { lng: c[0], lat: c[1] } : null;
  } catch {
    return null;
  }
}

export function DialogueReglages({ config, moi, onClose }: { config: Config; moi: string; onClose: () => void }) {
  const [titre, setTitre] = useState(config.titre);
  const [ville, setVille] = useState(config.ville);
  const [admins, setAdmins] = useState<string[]>([]);
  const [nouvel, setNouvel] = useState("");

  const chargerAdmins = () =>
    supabase.from("admins").select("email").order("ajoute_a").then(({ data }) => setAdmins((data ?? []).map((a) => a.email as string)));
  useEffect(() => { chargerAdmins(); }, []);

  const ajouter = async () => {
    const email = nouvel.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Adresse e-mail invalide");
    if (await ecrire(() => supabase.from("admins").insert({ email }))) { setNouvel(""); chargerAdmins(); }
  };
  const retirer = async (email: string) => {
    if (!confirm(`Retirer ${email} des admins ?`)) return;
    if (await ecrire(() => supabase.from("admins").delete().eq("email", email))) chargerAdmins();
  };

  const enregistrer = async () => {
    const data: Partial<Config> = { titre: titre.trim() || "Tournée des calendriers", ville: ville.trim() };
    if (data.ville && data.ville !== config.ville) {
      const c = await geocoder(data.ville);
      if (c) Object.assign(data, { centre_lng: c.lng, centre_lat: c.lat, zoom: 14 });
      else toast("Commune introuvable sur la carte");
    }
    return ecrire(() => supabase.from("config").update(data).eq("id", 1));
  };

  return (
    <Modal onClose={onClose} onSubmit={enregistrer}>
      <h2>Réglages</h2>
      <label htmlFor="f-titre">Titre</label>
      <input id="f-titre" maxLength={60} placeholder="Tournée des calendriers 2027" value={titre} onChange={(e) => setTitre(e.target.value)} />
      <label htmlFor="f-ville">Commune <span className="hint">centre la carte et complète les liens Maps</span></label>
      <input id="f-ville" maxLength={60} placeholder="Villeurbanne" value={ville} onChange={(e) => setVille(e.target.value)} />
      <label>Admins</label>
      <ul className="liste-admins">
        {admins.map((a) => (
          <li key={a}>
            <span>{a}</span>
            {a !== moi && <button type="button" className="btn small danger" onClick={() => retirer(a)}>Retirer</button>}
          </li>
        ))}
      </ul>
      <div className="copie" style={{ marginTop: 8 }}>
        <input type="email" placeholder="e-mail d'un nouvel admin" value={nouvel} onChange={(e) => setNouvel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ajouter(); } }} />
        <button type="button" className="btn small" onClick={ajouter}>Ajouter</button>
      </div>
      <p className="hint">Le nouvel admin se connecte ensuite avec cette adresse sur la page d&apos;accueil.</p>
      <Boutons valider="Enregistrer" onClose={onClose} />
    </Modal>
  );
}

// ---------------------------------------------------------------- somme finale d'une équipe

export function DialogueFinale({ equipe, rues, onClose }: { equipe: Equipe; rues: Rue[]; onClose: () => void }) {
  const [especes, setEspeces] = useState(equipe.finale_especes === null ? "" : saisie(equipe.finale_especes) || "0");
  const [cheques, setCheques] = useState(equipe.finale_cheques === null ? "" : saisie(equipe.finale_cheques) || "0");
  const a = agreger(rues);
  const total = montant(especes) + montant(cheques);
  const prix = prixMoyen(total, a.vendus);
  const declarer = (e: number | null, c: number | null) =>
    ecrire(() => supabase.rpc("declarer_somme_finale", { p_equipe: equipe.id, p_especes: e, p_cheques: c }));

  return (
    <Modal onClose={onClose} onSubmit={() => (especes.trim() || cheques.trim() ? declarer(montant(especes), montant(cheques)) : declarer(null, null))}>
      <h2>Somme finale — {equipe.nom}</h2>
      <p className="hint" style={{ margin: "4px 0 0" }}>
        Facultatif. L&apos;argent réellement remis en fin de tournée : il remplace le total noté rue par rue et sert aux statistiques.
      </p>
      <div className="duo">
        <div>
          <label htmlFor="f-fesp">Espèces (€)</label>
          <input id="f-fesp" inputMode="decimal" placeholder="0" value={especes} onChange={(e) => setEspeces(e.target.value)} />
        </div>
        <div>
          <label htmlFor="f-fchq">Chèques (€)</label>
          <input id="f-fchq" inputMode="decimal" placeholder="0" value={cheques} onChange={(e) => setCheques(e.target.value)} />
        </div>
      </div>
      <div className="avancement">
        <div className="av-ligne"><span>Total déclaré</span><b>{eur(total)}</b></div>
        <span className="hint">
          {a.vendus} calendrier{a.vendus > 1 ? "s" : ""} vendu{a.vendus > 1 ? "s" : ""}
          {prix !== null ? ` · ${eur(prix)} en moyenne par calendrier` : ""}
          {a.somme ? ` · ${eur(a.somme)} noté rue par rue` : ""}
        </span>
      </div>
      <Boutons valider="Enregistrer" onClose={onClose}
        gauche={equipe.finale_a ? (
          <button type="button" className="btn danger" style={{ marginRight: "auto" }}
            onClick={async () => { if (await declarer(null, null)) onClose(); }}>Effacer</button>
        ) : undefined} />
    </Modal>
  );
}
