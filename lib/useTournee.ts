"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { avecAttente, enAttente, surChangement, surConfirmation, vider } from "./fileAttente";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Config, Equipe, Rue, Secteur } from "./types";

export type Role = { chargement: true } | { chargement: false; session: Session | null; admin: boolean; equipeId: string | null };

/** Session Supabase courante et rôle associé (admin, membre d'une équipe, ou rien). */
export function useRole(): [Role, () => Promise<void>] {
  const [role, setRole] = useState<Role>({ chargement: true });

  const evaluer = useCallback(async (session: Session | null) => {
    if (!session) return setRole({ chargement: false, session: null, admin: false, equipeId: null });
    const cle = "tournee-role-" + session.user.id;
    const [a, e] = await Promise.all([supabase.rpc("est_admin"), supabase.rpc("mon_equipe")]);
    if (a.error || e.error) {
      // Hors réseau : on reprend le dernier rôle connu sur ce téléphone.
      let connu: { admin: boolean; equipeId: string | null } | null = null;
      try { connu = JSON.parse(localStorage.getItem(cle) ?? "null"); } catch { /* rien */ }
      if (connu) return setRole({ chargement: false, session, ...connu });
    }
    const r = { admin: a.data === true, equipeId: (e.data as string | null) ?? null };
    if (!a.error && !e.error) try { localStorage.setItem(cle, JSON.stringify(r)); } catch { /* rien */ }
    setRole({ chargement: false, session, ...r });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => evaluer(data.session));
    const { data } = supabase.auth.onAuthStateChange((evt, session) => {
      if (evt === "SIGNED_IN" || evt === "SIGNED_OUT" || evt === "USER_UPDATED") evaluer(session);
    });
    return () => data.subscription.unsubscribe();
  }, [evaluer]);

  const rafraichir = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await evaluer(data.session);
  }, [evaluer]);

  return [role, rafraichir];
}

export interface Donnees {
  pret: boolean;
  config: Config | null;
  equipes: Equipe[];
  secteurs: Secteur[];
  rues: Rue[];
  enLigne: boolean;
  /** Nombre de saisies gardées sur ce téléphone en attente de réseau. */
  attente: number;
}

const CLE_COPIE = "tournee-copie-locale";
const rienEnAttente = () => AUCUNE;
const AUCUNE: ReturnType<typeof enAttente> = [];

const TABLES = ["config", "equipes", "secteurs", "rues"] as const;
type Table = (typeof TABLES)[number];

/** Charge toute la tournée et la garde à jour en temps réel. */
export function useTournee(actif: boolean): Donnees {
  const [d, setD] = useState<Omit<Donnees, "attente">>({ pret: false, config: null, equipes: [], secteurs: [], rues: [], enLigne: true });
  // Au démarrage, on affiche la dernière copie gardée sur le téléphone (utile hors réseau),
  // remplacée dès que les données fraîches arrivent.
  useEffect(() => {
    if (!actif) return;
    try {
      const copie = JSON.parse(localStorage.getItem(CLE_COPIE) ?? "null");
      if (copie?.config) setD((p) => (p.pret ? p : { ...p, ...copie, pret: true }));
    } catch { /* copie illisible : ignorée */ }
  }, [actif]);
  useEffect(() => {
    if (!d.pret || !d.config) return;
    const h = setTimeout(() => {
      try { localStorage.setItem(CLE_COPIE, JSON.stringify({ config: d.config, equipes: d.equipes, secteurs: d.secteurs, rues: d.rues })); }
      catch { /* stockage plein : pas de copie */ }
    }, 2000);
    return () => clearTimeout(h);
  }, [d]);
  const file = useSyncExternalStore(surChangement, enAttente, rienEnAttente);
  const attente = useRef(new Set<Table>());
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const charger = useCallback(async (tables: Iterable<Table>) => {
    const maj: Partial<Omit<Donnees, "attente">> = {};
    await Promise.all(
      [...tables].map(async (t) => {
        if (t === "config") {
          const { data, error } = await supabase.from("config").select("*").eq("id", 1).maybeSingle();
          if (!error) maj.config = data as Config | null;
        } else if (t === "equipes") {
          const { data } = await supabase.from("equipes").select("*").order("cree_a");
          if (data)
            maj.equipes = (data as Equipe[]).map((e) => ({
              ...e,
              finale_especes: e.finale_especes === null ? null : Number(e.finale_especes),
              finale_cheques: e.finale_cheques === null ? null : Number(e.finale_cheques),
            }));
        } else if (t === "secteurs") {
          const { data } = await supabase.from("secteurs").select("*").order("cree_a");
          if (data) maj.secteurs = data as Secteur[];
        } else {
          const { data } = await supabase.from("rues").select("*").order("ordre").limit(5000);
          if (data) maj.rues = (data as Rue[]).map(normaliser);
        }
      }),
    );
    setD((p) => ({ ...p, ...maj, pret: true }));
  }, []);

  useEffect(() => {
    if (!actif) return;
    charger(TABLES);
    const planifier = (t: Table) => {
      attente.current.add(t);
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = setTimeout(() => {
        const ts = [...attente.current];
        attente.current.clear();
        charger(ts);
      }, 250);
    };
    // Les rues changent souvent : on applique directement la ligne reçue au lieu de tout
    // recharger (économise les données mobiles). Les autres tables, petites, sont rechargées.
    const surRue = (m: RealtimePostgresChangesPayload<Rue>) => {
      setD((p) => {
        if (m.eventType === "DELETE") {
          const id = (m.old as Partial<Rue>).id;
          return { ...p, rues: p.rues.filter((r) => r.id !== id) };
        }
        const nouv = m.new as Rue;
        const i = p.rues.findIndex((r) => r.id === nouv.id);
        // Les grosses colonnes inchangées (tracé) peuvent être absentes du message : on garde l'ancienne valeur.
        const fusion = normaliser({ ...(i >= 0 ? p.rues[i] : ({} as Rue)), ...Object.fromEntries(Object.entries(nouv).filter(([, v]) => v !== undefined)) } as Rue);
        const rues = i >= 0 ? p.rues.map((r, j) => (j === i ? fusion : r)) : [...p.rues, fusion].sort((a, b) => a.ordre - b.ordre);
        return { ...p, rues };
      });
    };
    let ch = supabase.channel("tournee");
    for (const t of TABLES)
      ch = t === "rues"
        ? ch.on<Rue>("postgres_changes", { event: "*", schema: "public", table: "rues" }, surRue)
        : ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => planifier(t));
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setD((p) => ({ ...p, enLigne: true }));
        charger(TABLES); // rattrape ce qui a pu être manqué pendant une coupure
        vider();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setD((p) => ({ ...p, enLigne: false }));
      }
    });
    const reveil = () => { if (document.visibilityState === "visible") { charger(TABLES); vider(); } };
    const reseau = () => { vider(); charger(TABLES); };
    const relance = setInterval(vider, 20000);
    // Notation acceptée par le serveur : on l'intègre tout de suite, sans attendre le temps réel.
    const finConfirm = surConfirmation((id, n) =>
      setD((p) => ({ ...p, rues: p.rues.map((r) => (r.id === id ? { ...r, ...n, repasse: r.repasse || n.etat === "arepasser", maj_a: new Date().toISOString() } : r)) })));
    document.addEventListener("visibilitychange", reveil);
    window.addEventListener("online", reseau);
    vider();
    return () => {
      document.removeEventListener("visibilitychange", reveil);
      window.removeEventListener("online", reseau);
      clearInterval(relance);
      finConfirm();
      if (minuteur.current) clearTimeout(minuteur.current);
      supabase.removeChannel(ch);
    };
  }, [actif, charger]);

  const rues = useMemo(() => avecAttente(d.rues), [d.rues, file]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...d, rues, attente: file.length };
}

const normaliser = (r: Rue): Rue => ({ ...r, especes: Number(r.especes), cheques: Number(r.cheques) });

/** Force un re-rendu périodique pour que les « il y a X min » restent justes. */
export function useHorloge(ms = 30000) {
  const [, set] = useState(0);
  useEffect(() => {
    const h = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(h);
  }, [ms]);
}
