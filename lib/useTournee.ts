"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Config, Equipe, Rue, Secteur } from "./types";

export type Role = { chargement: true } | { chargement: false; session: Session | null; admin: boolean; equipeId: string | null };

/** Session Supabase courante et rôle associé (admin, membre d'une équipe, ou rien). */
export function useRole(): [Role, () => Promise<void>] {
  const [role, setRole] = useState<Role>({ chargement: true });

  const evaluer = useCallback(async (session: Session | null) => {
    if (!session) return setRole({ chargement: false, session: null, admin: false, equipeId: null });
    const [a, e] = await Promise.all([supabase.rpc("est_admin"), supabase.rpc("mon_equipe")]);
    setRole({ chargement: false, session, admin: a.data === true, equipeId: (e.data as string | null) ?? null });
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
}

const TABLES = ["config", "equipes", "secteurs", "rues"] as const;
type Table = (typeof TABLES)[number];

/** Charge toute la tournée et la garde à jour en temps réel. */
export function useTournee(actif: boolean): Donnees {
  const [d, setD] = useState<Donnees>({ pret: false, config: null, equipes: [], secteurs: [], rues: [], enLigne: true });
  const attente = useRef(new Set<Table>());
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const charger = useCallback(async (tables: Iterable<Table>) => {
    const maj: Partial<Donnees> = {};
    await Promise.all(
      [...tables].map(async (t) => {
        if (t === "config") {
          const { data } = await supabase.from("config").select("*").eq("id", 1).maybeSingle();
          maj.config = data as Config | null;
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
          if (data)
            maj.rues = (data as Rue[]).map((r) => ({ ...r, especes: Number(r.especes), cheques: Number(r.cheques) }));
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
    let ch = supabase.channel("tournee");
    for (const t of TABLES) ch = ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => planifier(t));
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setD((p) => ({ ...p, enLigne: true }));
        charger(TABLES); // rattrape ce qui a pu être manqué pendant une coupure
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setD((p) => ({ ...p, enLigne: false }));
      }
    });
    const reveil = () => document.visibilityState === "visible" && charger(TABLES);
    document.addEventListener("visibilitychange", reveil);
    return () => {
      document.removeEventListener("visibilitychange", reveil);
      if (minuteur.current) clearTimeout(minuteur.current);
      supabase.removeChannel(ch);
    };
  }, [actif, charger]);

  return d;
}

/** Force un re-rendu périodique pour que les « il y a X min » restent justes. */
export function useHorloge(ms = 30000) {
  const [, set] = useState(0);
  useEffect(() => {
    const h = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(h);
  }, [ms]);
}
