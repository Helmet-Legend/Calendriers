"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "./ui";

/** Dernier profil utilisé sur ce téléphone : sa carte passe en premier à l'accueil. */
export const CLE_PROFIL = "tournee-profil";
export type Profil = "responsable" | "equipe";
export function retenirProfil(p: Profil) {
  try { localStorage.setItem(CLE_PROFIL, p); } catch { /* stockage indisponible */ }
}

const Cle = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1D5FD1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3M15 8l2 2" />
  </svg>
);
const Equipe = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1E8A4C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.2c2.7.2 4.5 2 4.5 4.8" />
  </svg>
);
const Bulle = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z" />
  </svg>
);

/** Formulaire de connexion des responsables (lien magique par e-mail). */
function CarteResponsable() {
  const [email, setEmail] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: location.origin } });
    setEnvoi(false);
    if (error) toast(error.status === 429 ? "Trop de demandes, réessayez dans quelques minutes" : "Envoi impossible, vérifiez l'adresse");
    else { setEnvoye(true); retenirProfil("responsable"); }
  };
  return (
    <section className="accueil-carte" aria-labelledby="titre-responsable">
      <div className="accueil-tete">
        <span className="accueil-icone" style={{ background: "#DCE9FC" }}><Cle /></span>
        <div>
          <h2 id="titre-responsable">Je suis responsable</h2>
          <span className="hint">Organiser la tournée et suivre les équipes</span>
        </div>
      </div>
      {envoye ? (
        <p className="accueil-ok">
          C&apos;est envoyé ! Ouvrez l&apos;e-mail reçu à <strong>{email}</strong> et touchez le lien, sur cet appareil.
          Pensez à regarder dans les courriers indésirables.
        </p>
      ) : (
        <form onSubmit={envoyer} className="accueil-form">
          <label htmlFor="f-email">Votre adresse e-mail</label>
          <input id="f-email" type="email" required autoComplete="email" inputMode="email" placeholder="prenom.nom@exemple.fr"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" className="btn primary accueil-bouton" disabled={envoi}>
            {envoi ? "Envoi…" : "Recevoir mon lien de connexion"}
          </button>
          <span className="hint">Pas de mot de passe : un lien arrive par e-mail, il suffit de l&apos;ouvrir sur cet appareil.</span>
        </form>
      )}
    </section>
  );
}

/** Extrait le jeton d'un lien d'équipe collé (adresse complète ou jeton seul). */
export function jetonDuLien(texte: string): string | null {
  const m = texte.trim().match(/(?:\/e\/)?([0-9a-f]{32})\b/i);
  return m ? m[1].toLowerCase() : null;
}

/** Champ « Coller mon lien » pour qui a perdu son SMS ou ouvre le site directement. */
export function CollerLien() {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [lien, setLien] = useState("");
  const valider = (e: React.FormEvent) => {
    e.preventDefault();
    const j = jetonDuLien(lien);
    if (!j) return toast("Ce n'est pas un lien d'équipe. Copiez le lien complet reçu par SMS.");
    router.push(`/e/${j}`);
  };
  if (!ouvert)
    return <button type="button" className="btn lien" onClick={() => setOuvert(true)}>J&apos;ai le lien mais il ne s&apos;ouvre pas : le coller ici</button>;
  return (
    <form onSubmit={valider} className="accueil-form">
      <label htmlFor="f-lien-equipe">Lien de votre équipe</label>
      <div className="copie">
        <input id="f-lien-equipe" autoFocus placeholder="https://…/e/…" value={lien} onChange={(e) => setLien(e.target.value)} />
        <button type="submit" className="btn primary">Ouvrir</button>
      </div>
    </form>
  );
}

function CarteEquipe() {
  return (
    <section className="accueil-carte" aria-labelledby="titre-equipe">
      <div className="accueil-tete">
        <span className="accueil-icone" style={{ background: "#DDF3E4" }}><Equipe /></span>
        <div>
          <h2 id="titre-equipe">Je fais partie d&apos;une équipe</h2>
          <span className="hint">Binôme ou trinôme sur le terrain</span>
        </div>
      </div>
      <div className="accueil-sms">
        <Bulle />
        <span>Votre responsable vous envoie <strong>un lien</strong> par SMS ou WhatsApp. Ouvrez-le simplement : pas de compte, pas de mot de passe.</span>
      </div>
      <ol className="accueil-etapes">
        <li><span className="num">1</span><span>Ouvrez le lien reçu sur votre téléphone</span></li>
        <li><span className="num">2</span><span>Installez l&apos;app sur l&apos;écran d&apos;accueil (c&apos;est proposé tout seul)</span></li>
        <li><span className="num">3</span><span>Suivez la <strong>prochaine rue</strong> et touchez ✓ quand elle est faite</span></li>
      </ol>
      <CollerLien />
    </section>
  );
}

/** Page d'accueil (personne connectée) : présentation et deux entrées, responsable et équipe. */
export function Accueil() {
  const [profil, setProfil] = useState<Profil | null>(null);
  useEffect(() => {
    try { setProfil(localStorage.getItem(CLE_PROFIL) as Profil | null); } catch { /* rien */ }
  }, []);
  const responsableDAbord = profil === "responsable";
  return (
    <div className="accueil">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="accueil-photo" src="/sete-bandeau.jpg" alt="" />
      <div className="accueil-voile" aria-hidden="true" />
      <div className="accueil-grille">
        <div className="accueil-texte">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="accueil-logo" src="/icone-192.png" alt="" width={64} height={64} />
          <h1>Tournée <span>des calendriers</span></h1>
          <p>Suivez la tournée rue par rue, en direct : ce que chaque équipe a fait, ce qu&apos;il reste, et ce qui a été récolté.</p>
          <ul>
            <li><i style={{ background: "#2EA35F" }} />Les rues faites s&apos;affichent en vert sur la carte</li>
            <li><i style={{ background: "#F5C22E" }} />Un ordre de passage logique pour chaque secteur</li>
            <li><i style={{ background: "#C2185B" }} />Fonctionne même sans réseau, envoi au retour</li>
          </ul>
        </div>
        <div className={`accueil-cartes ${responsableDAbord ? "responsable-d-abord" : ""}`}>
          <CarteResponsable />
          <CarteEquipe />
        </div>
      </div>
    </div>
  );
}
