"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useHorloge, useRole, useTournee } from "@/lib/useTournee";
import { Cadre } from "@/components/Page";
import { VueEnsemble, VueEquipe } from "@/components/Vues";
import { DialogueReglages } from "@/components/Dialogues";
import { ChevronBas, Crayon, Engrenage, Grille, Groupe, Sortie } from "@/components/icones";
import { Modal } from "@/components/ui";
import { Accueil as PageAccueil, retenirProfil } from "@/components/Accueil";

function DialogueAide({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose} onSubmit={() => true}>
      <h2>Aide</h2>
      <ol style={{ paddingLeft: 20, margin: "12px 0 0", display: "flex", flexDirection: "column", gap: 8 }}>
        <li><strong>Réglages</strong> : indiquez le titre et la commune, la carte se centre dessus.</li>
        <li><strong>Nouvelle équipe</strong> : nom, membres, calendriers au départ et couleur.</li>
        <li><strong>Dessiner un secteur</strong> : touchez la carte pour poser ses coins, puis « Terminer ». Les rues de la zone sont proposées automatiquement.</li>
        <li><strong>Lien d&apos;équipe</strong> : dans l&apos;équipe, « Modifier l&apos;équipe et son lien » → « Partager ». Chaque téléphone l&apos;ouvre une fois.</li>
        <li>Les équipes touchent une rue pour noter l&apos;avancement, les ventes et l&apos;argent encaissé. Tout se met à jour ici en direct.</li>
      </ol>
      <div className="row"><button type="submit" className="btn primary">Compris</button></div>
    </Modal>
  );
}

export default function Accueil() {
  const router = useRouter();
  const [role, rafraichir] = useRole();
  const admin = !role.chargement && role.admin;
  const d = useTournee(admin);
  const [onglet, setOnglet] = useState<"tout" | string>("tout");
  const [reglages, setReglages] = useState(false);
  const [aide, setAide] = useState(false);
  const [dessinDemande, setDessinDemande] = useState(0);
  const [dessinActif, setDessinActif] = useState(false);
  const revendique = useRef(false);
  useHorloge();

  const anonyme = !role.chargement && role.session?.user.is_anonymous;
  useEffect(() => {
    if (anonyme && !role.chargement && role.equipeId) router.replace("/equipe");
  }, [anonyme, role, router]);

  // Ce téléphone sert à un responsable : sa carte passera en premier à l'accueil.
  useEffect(() => { if (admin) retenirProfil("responsable"); }, [admin]);

  // Tout premier compte connecté : il devient admin si aucun n'existe encore.
  useEffect(() => {
    if (role.chargement || !role.session || anonyme || role.admin || revendique.current) return;
    revendique.current = true;
    supabase.rpc("revendiquer_admin").then(({ data }) => data && rafraichir());
  }, [role, anonyme, rafraichir]);

  if (role.chargement || (anonyme && role.equipeId)) return <Cadre />;
  if (!role.session || anonyme) return <PageAccueil />;
  const deconnexion = (
    <button type="button" className="btn-verre" onClick={() => {
      try { for (const k of Object.keys(localStorage)) if (k.startsWith("tournee-copie") || k.startsWith("tournee-role-")) localStorage.removeItem(k); } catch { /* rien */ }
      supabase.auth.signOut();
    }}>
      <Sortie /><span className="libelle">Déconnexion</span>
    </button>
  );
  if (!role.admin)
    return (
      <Cadre actions={deconnexion} etroit>
        <div className="empty">
          <strong>Ce compte n&apos;est pas responsable</strong>
          {role.session.user.email} n&apos;est pas dans la liste des admins. Demandez à un admin de vous ajouter depuis les réglages.
        </div>
      </Cadre>
    );

  const actions = (
    <>
      <button type="button" className="btn-verre" onClick={() => setReglages(true)}><Engrenage /><span className="libelle">Réglages</span></button>
      {deconnexion}
    </>
  );
  if (!d.pret || !d.config) return <Cadre d={d} actions={actions} menu onAide={() => setAide(true)} />;
  const equipeVue = onglet === "tout" ? null : d.equipes.find((e) => e.id === onglet);

  return (
    <Cadre d={d} actions={actions} menu onAide={() => setAide(true)}>
      <div className="ligne-onglets">
        <div className="onglets" role="tablist" aria-label="Vues">
          <button type="button" role="tab" aria-selected={onglet === "tout"} onClick={() => setOnglet("tout")}>
            <Grille />Vue d&apos;ensemble
          </button>
          <div className={`choix ${equipeVue ? "actif" : ""}`}>
            <Groupe size={28} />
            <span>{equipeVue ? equipeVue.nom : "Vue d'une équipe…"}</span>
            <ChevronBas />
            <select aria-label="Voir comme une équipe" value={equipeVue ? onglet : ""} onChange={(e) => setOnglet(e.target.value || "tout")}>
              <option value="">Vue d&apos;ensemble</option>
              {d.equipes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          </div>
        </div>
        <button type="button" className="btn-jaune" disabled={dessinActif} onClick={() => { setOnglet("tout"); setDessinDemande((n) => n + 1); }}>
          <Crayon size={28} />Dessiner un secteur
        </button>
      </div>
      {equipeVue ? (
        <VueEquipe key={onglet} d={d} config={d.config} equipeId={onglet} admin />
      ) : (
        <VueEnsemble d={d} config={d.config} dessinDemande={dessinDemande} onDessinActif={setDessinActif}
          onReglages={() => setReglages(true)} onDessiner={() => setDessinDemande((n) => n + 1)} />
      )}
      {reglages && <DialogueReglages config={d.config} moi={role.session.user.email ?? ""} onClose={() => setReglages(false)} />}
      {aide && <DialogueAide onClose={() => setAide(false)} />}
    </Cadre>
  );
}
