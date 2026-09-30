import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// TEMPORAIRE : vérifie que la connexion anonyme (liens d'équipe) est activée dans Supabase.
export const dynamic = "force-dynamic";
export async function GET() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) return NextResponse.json({ anonyme: false, erreur: error.message, code: error.code ?? null });
  const lien = await sb.rpc("rejoindre_equipe", { p_jeton: "0".repeat(32) });
  const lecture = await sb.from("rues").select("id", { count: "exact", head: true });
  return NextResponse.json({
    anonyme: true, utilisateur: data.user?.id,
    faux_lien: lien.error ? "erreur " + lien.error.message : lien.data === null ? "refusé (normal)" : "ACCEPTÉ ?!",
    rues_visibles_sans_lien: lecture.count,
  });
}
