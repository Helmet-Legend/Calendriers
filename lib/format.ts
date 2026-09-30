export const eur = (n: number) =>
  (Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

export function ilya(ts: string | number | null | undefined): string {
  if (!ts) return "pas encore commencé";
  const t = typeof ts === "number" ? ts : Date.parse(ts);
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return "le " + new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Lit un montant saisi à la française (« 12,50 », « 1 200 »). */
export function montant(v: string): number {
  const n = parseFloat(String(v).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

export const lienMaps = (rue: string, ville: string) =>
  "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(rue + (ville ? ", " + ville : ""));

export function messageErreur(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === "42501" || /row-level security|interdit/i.test(err?.message ?? ""))
    return "Vous n'avez pas le droit de faire cette modification";
  return "Pas enregistré, réessayez";
}
