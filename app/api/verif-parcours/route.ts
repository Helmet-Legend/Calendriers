import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ordonner, departParDefaut } from "@/lib/parcours";
import type { LngLat, Rue } from "@/lib/types";

// TEMPORAIRE : parcours complet d'un téléphone d'équipe (connexion anonyme, lien, lecture)
// puis évaluation de l'ordre de passage sur les vraies rues.
export const dynamic = "force-dynamic";

function dist([a, b]: LngLat, [c, d]: LngLat) {
  const x = ((c - a) * Math.PI) / 180 * Math.cos((((b + d) / 2) * Math.PI) / 180), y = ((d - b) * Math.PI) / 180;
  return Math.sqrt(x * x + y * y) * 6371008.8;
}
const pts = (r: Rue) => (r.trace ?? []).flat();
const min = (a: LngLat[], b: LngLat[]) => { let m = Infinity; for (const p of a) for (const q of b) m = Math.min(m, dist(p, q)); return m; };

/** Distance « à vide » entre rues successives : du point le plus éloigné de l'entrée à la rue suivante. */
function evaluer(liste: Rue[]) {
  const sauts: number[] = [];
  let pos: LngLat | null = null;
  for (const r of liste) {
    const p = pts(r);
    if (!p.length) continue;
    let entree = p[0];
    if (pos) { let m = Infinity; for (const q of p) { const d = dist(pos, q); if (d < m) { m = d; entree = q; } } sauts.push(m); }
    let loin = entree, dm = -1; for (const q of p) { const d = dist(entree, q); if (d > dm) { dm = d; loin = q; } }
    pos = loin;
  }
  const total = sauts.reduce((t, s) => t + s, 0);
  return { vide_total_m: Math.round(total), moyenne_m: Math.round(total / (sauts.length || 1)), max_m: Math.round(Math.max(0, ...sauts)), sauts_sup_200m: sauts.filter((s) => s > 200).length, sauts_sup_400m: sauts.filter((s) => s > 400).length };
}

export async function GET(req: NextRequest) {
  const jeton = req.nextUrl.searchParams.get("jeton") ?? "";
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const connexion = await sb.auth.signInAnonymously();
  if (connexion.error) return NextResponse.json({ etape: "connexion", erreur: connexion.error.message });
  const equipe = await sb.rpc("rejoindre_equipe", { p_jeton: jeton });
  if (!equipe.data) return NextResponse.json({ etape: "lien", erreur: equipe.error?.message ?? "lien refusé" });
  const [secteurs, rues, autres] = await Promise.all([
    sb.from("secteurs").select("id, nom, equipe_id"),
    sb.from("rues").select("*").order("ordre"),
    sb.rpc("noter_rue", { p_rue: "00000000-0000-0000-0000-000000000000", p_etat: "faite", p_arret: "", p_note: "", p_vendus: 0, p_especes: 0, p_cheques: 0 }),
  ]);
  const res: Record<string, unknown> = {
    utilisateur_test: connexion.data.user?.id,
    equipe_rejointe: equipe.data,
    secteurs_visibles: secteurs.data?.map((s) => s.nom),
    rues_visibles: rues.data?.length,
    noter_rue_inexistante: autres.error ? "refusé (normal)" : "accepté ?!",
  };
  for (const s of secteurs.data ?? []) {
    if (s.equipe_id !== equipe.data) continue;
    const rs = (rues.data as Rue[]).filter((r) => r.secteur_id === s.id);
    const restantes = rs.filter((r) => r.etat !== "faite");
    const alpha = [...restantes].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    const saisie = [...restantes];
    const auto = ordonner(rs, departParDefaut(rs));
    // GPS simulé : bout nord (quai de Bosc) et bout sud (vers la Grand'Rue)
    const gpsNord: LngLat = [3.6927, 43.4108], gpsSud: LngLat = [3.6960, 43.4020];
    const nord = ordonner(rs, { point: gpsNord }), sud = ordonner(rs, { point: gpsSud });
    const plusProche = (p: LngLat) => restantes.filter((r) => pts(r).length).map((r) => ({ nom: r.nom, d: min([p], pts(r)) })).sort((a, b) => a.d - b.d)[0];
    const trajet = (etapes: { rue: Rue; n: number }[], k = 12) => {
      const out: string[] = []; let prec: Rue | null = null;
      for (const e of etapes.slice(0, k)) { out.push(`${e.n}. ${e.rue.nom}` + (prec ? ` (+${Math.round(min(pts(prec), pts(e.rue)))} m)` : "")); prec = e.rue; }
      return out;
    };
    res[s.nom] = {
      rues: rs.length, restantes: restantes.length, faites: rs.length - restantes.length,
      depart_par_defaut: departParDefaut(rs),
      comparaison_distance_a_vide: {
        ordre_de_passage: evaluer(auto.etapes.map((e) => e.rue)),
        ordre_alphabetique: evaluer(alpha),
        ordre_de_saisie: evaluer(saisie),
      },
      debut_parcours_auto: trajet(auto.etapes),
      gps_nord: { rue_la_plus_proche: plusProche(gpsNord), premiere_etape: nord.etapes[0]?.rue.nom, distance: evaluer(nord.etapes.map((e) => e.rue)) },
      gps_sud: { rue_la_plus_proche: plusProche(gpsSud), premiere_etape: sud.etapes[0]?.rue.nom, distance: evaluer(sud.etapes.map((e) => e.rue)) },
      debut_parcours_gps_sud: trajet(sud.etapes, 15),
    };
  }
  return NextResponse.json(res);
}
