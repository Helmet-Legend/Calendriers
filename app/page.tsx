"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useHorloge, useRole, useTournee } from "@/lib/useTournee";
import { Entete } from "@/components/Page";
import { VueEnsemble, VueEquipe } from "@/components/Vues";
import { DialogueReglages } from "@/components/Dialogues";
import { toast } from "@/components/ui";

function Connexion() {
  const [email, setEmail] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: location.origin } });
    if (error) toast(error.status === 429 ? "Trop de demandes, réessayez dans quelques minutes" : "Envoi impossible, vérifiez l'adresse");
    else setEnvoye(true);
  };
  return (
    <>
      <Entete />
      <div className="card">
        <h2>Connexion des responsables</h2>
        {envoye ? (
          <p>Un lien de connexion a été envoyé à <strong>{email}</strong>. Ouvrez-le sur cet appareil.</p>
        ) : (
          <form onSubmit={envoyer}>
            <label htmlFor="f-email">Adresse e-mail</label>
            <input id="f-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <div className="row"><button type="submit" className="btn primary">Recevoir un lien de connexion</button></div>
          </form>
        )}
      </div>
      <p className="hint">Vous faites partie d&apos;une équipe ? Ouvrez simplement le lien que votre responsable vous a envoyé.</p>
    </>
  );
}

export default function Accueil() {
  const router = useRouter();
  const [role, rafraichir] = useRole();
  const admin = !role.chargement && role.admin;
  const d = useTournee(admin);
  const [onglet, setOnglet] = useState<"tout" | string>("tout");
  const [reglages, setReglages] = useState(false);
  const revendique = useRef(false);
  useHorloge();

  const anonyme = !role.chargement && role.session?.user.is_anonymous;
  useEffect(() => {
    if (anonyme && !role.chargement && role.equipeId) router.replace("/equipe");
  }, [anonyme, role, router]);

  // Tout premier compte connecté : il devient admin si aucun n'existe encore.
  useEffect(() => {
    if (role.chargement || !role.session || anonyme || role.admin || revendique.current) return;
    revendique.current = true;
    supabase.rpc("revendiquer_admin").then(({ data }) => data && rafraichir());
  }, [role, anonyme, rafraichir]);

  if (role.chargement || (anonyme && role.equipeId)) return <Entete />;
  if (!role.session || anonyme) return <Connexion />;
  const deconnexion = <button className="btn small" onClick={() => supabase.auth.signOut()}>Déconnexion</button>;
  if (!role.admin)
    return (
      <>
        <Entete droite={deconnexion} />
        <div className="empty">
          <strong>Ce compte n&apos;est pas responsable</strong>
          {role.session.user.email} n&apos;est pas dans la liste des admins. Demandez à un admin de vous ajouter depuis les réglages.
        </div>
      </>
    );

  if (!d.pret || !d.config) return <Entete d={d} droite={deconnexion} />;
  return (
    <>
      <Entete d={d} droite={<div className="bar" style={{ margin: 0 }}>
        <button className="btn small" onClick={() => setReglages(true)}>Réglages</button>{deconnexion}
      </div>} />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={onglet === "tout"} onClick={() => setOnglet("tout")}>Vue d&apos;ensemble</button>
        <select aria-label="Voir comme une équipe" value={onglet === "tout" ? "" : onglet} onChange={(e) => setOnglet(e.target.value || "tout")}
          style={{ flex: 1, border: 0, background: onglet === "tout" ? "none" : "var(--ink)", color: onglet === "tout" ? "var(--muted)" : "var(--bg)", fontWeight: 600 }}>
          <option value="">Vue d&apos;une équipe…</option>
          {d.equipes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
        </select>
      </div>
      {onglet === "tout" ? <VueEnsemble d={d} config={d.config} /> : <VueEquipe key={onglet} d={d} config={d.config} equipeId={onglet} admin />}
      {reglages && <DialogueReglages config={d.config} moi={role.session.user.email ?? ""} onClose={() => setReglages(false)} />}
    </>
  );
}
