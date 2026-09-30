"use client";

import { useEffect, useState } from "react";

/** Adresse de démarrage de l'app installée : le lien de l'équipe s'il est connu sur ce téléphone. */
export const CLE_JETON = "tournee-jeton-equipe";

type Invite = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * Enregistre le service worker (ouverture sans réseau), pointe le manifeste vers le lien de
 * l'équipe et propose d'installer l'application sur l'écran d'accueil.
 */
export function Installation() {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [iphone, setIphone] = useState(false);
  const [masque, setMasque] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker.register("/sw.js").catch(() => { /* non bloquant */ });

    let jeton: string | null = null;
    try { jeton = localStorage.getItem(CLE_JETON); } catch { /* stockage indisponible */ }
    const lien = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (lien && jeton) lien.href = `/api/manifest?depart=${encodeURIComponent("/e/" + jeton)}`;

    const installee = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    let refus = false;
    try { refus = localStorage.getItem("tournee-installation-refusee") === "1"; } catch { /* idem */ }
    if (installee || refus) return;
    setMasque(false);
    setIphone(/iPhone|iPad|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent));
    const f = (e: Event) => { e.preventDefault(); setInvite(e as Invite); };
    window.addEventListener("beforeinstallprompt", f);
    window.addEventListener("appinstalled", () => setMasque(true));
    return () => window.removeEventListener("beforeinstallprompt", f);
  }, []);

  if (masque || (!invite && !iphone)) return null;
  const fermer = () => {
    setMasque(true);
    try { localStorage.setItem("tournee-installation-refusee", "1"); } catch { /* idem */ }
  };
  return (
    <div className="installer" role="region" aria-label="Installer l'application">
      <img src="/icone-192.png" alt="" width={44} height={44} />
      <div style={{ flexGrow: 1, minWidth: 0 }}>
        <strong>Installer l&apos;application</strong>
        <span className="hint">
          {invite
            ? "Une icône sur l'écran d'accueil, en plein écran, et utilisable même sans réseau."
            : "Touchez le bouton Partager de Safari, puis « Sur l'écran d'accueil »."}
        </span>
      </div>
      {invite && (
        <button type="button" className="btn primary" onClick={async () => {
          await invite.prompt();
          await invite.userChoice;
          setInvite(null);
          setMasque(true);
        }}>Installer</button>
      )}
      <button type="button" className="btn small" onClick={fermer}>Plus tard</button>
    </div>
  );
}
