"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Cadre } from "@/components/Page";
import { CLE_JETON } from "@/components/Installation";
import { retenirProfil } from "@/components/Accueil";

type Etat = "attente" | "admin" | "invalide" | "erreur";

/** Lien d'accès d'une équipe : connecte le téléphone (anonymement) et le rattache à l'équipe. */
export default function Rejoindre() {
  const { jeton } = useParams<{ jeton: string }>();
  const router = useRouter();
  const [etat, setEtat] = useState<Etat>("attente");

  useEffect(() => {
    (async () => {
      let { data: { session } } = await supabase.auth.getSession();
      if (session && !session.user.is_anonymous) return setEtat("admin");
      if (!session) {
        const r = await supabase.auth.signInAnonymously();
        if (r.error) return setEtat("erreur");
        session = r.data.session;
      }
      const { data, error } = await supabase.rpc("rejoindre_equipe", { p_jeton: jeton });
      if (error) return setEtat("erreur");
      if (!data) return setEtat("invalide");
      try { localStorage.setItem(CLE_JETON, jeton); } catch { /* stockage indisponible */ }
      retenirProfil("equipe");
      router.replace("/equipe");
    })();
  }, [jeton, router]);

  return (
    <Cadre etroit>
      {etat === "attente" && <p className="hint">Connexion à votre équipe…</p>}
      {etat === "admin" && (
        <div className="empty">
          <strong>Vous êtes connecté en responsable</strong>
          Ce lien est destiné au téléphone d&apos;une équipe. <Link href="/">Retour à la vue d&apos;ensemble</Link>
        </div>
      )}
      {etat === "invalide" && (
        <div className="empty"><strong>Lien invalide</strong>Ce lien n&apos;est plus valable. Demandez le nouveau lien à votre responsable.</div>
      )}
      {etat === "erreur" && (
        <div className="empty"><strong>Connexion impossible</strong>Vérifiez votre connexion internet puis rouvrez le lien.</div>
      )}
    </Cadre>
  );
}
