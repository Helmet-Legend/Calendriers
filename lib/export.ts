import { agreger, argentEquipe, avancement, longueur, prixMoyen, ruesDe } from "./agregats";
import { ETATS, type Config, type Equipe, type Rue, type Secteur } from "./types";

// Fichiers CSV lisibles directement par Excel en français : séparateur « ; », virgule
// décimale, encodage UTF-8 avec BOM (pour les accents).

const cellule = (v: string | number | null | undefined) => {
  if (v === null || v === undefined) return "";
  const t = typeof v === "number" ? String(Math.round(v * 100) / 100).replace(".", ",") : v;
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const ligne = (vals: (string | number | null | undefined)[]) => vals.map(cellule).join(";");
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "");

/** Nom de fichier sans accents ni caractères spéciaux (certains navigateurs ignorent sinon le nom). */
const nomFichier = (n: string) =>
  n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-(?=\.)/g, "");

function telecharger(nom: string, lignes: string[]) {
  const blob = new Blob(["﻿" + lignes.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier(nom);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const suffixe = () => new Date().toISOString().slice(0, 10);
const nomSecteur = (s: Secteur) => (s.nom.length <= 2 ? `Secteur ${s.nom}` : s.nom);

/** Une ligne par rue : état, calendriers, argent, dernière mise à jour. */
export function exporterRues(config: Config, equipes: Equipe[], secteurs: Secteur[], rues: Rue[]) {
  const eq = new Map(equipes.map((e) => [e.id, e.nom]));
  const lignes = [ligne(["Équipe", "Secteur", "Rue", "État", "Arrêtée à", "À repasser (note)", "Calendriers vendus",
    "Espèces (€)", "Chèques (€)", "Total (€)", "Longueur (m)", "Dernière mise à jour"])];
  for (const s of secteurs)
    for (const r of rues.filter((x) => x.secteur_id === s.id))
      lignes.push(ligne([
        (s.equipe_id && eq.get(s.equipe_id)) || "Non attribué", nomSecteur(s), r.nom, ETATS[r.etat],
        r.etat === "encours" ? r.arret : "", r.etat === "arepasser" ? r.note : "",
        r.vendus, r.especes, r.cheques, r.especes + r.cheques, Math.round(longueur(r.trace)) || null, date(r.maj_a),
      ]));
  telecharger(`${config.titre || "tournee"} - detail par rue - ${suffixe()}.csv`, lignes);
}

/** Récapitulatif par équipe puis par secteur, avec sommes finales et prix moyen. */
export function exporterRecap(config: Config, equipes: Equipe[], secteurs: Secteur[], rues: Rue[]) {
  const lignes = [ligne(["RÉCAPITULATIF PAR ÉQUIPE"]),
    ligne(["Équipe", "Membres", "Calendriers au départ", "Calendriers vendus", "Calendriers restants", "Rues faites", "Rues au total",
      "Espèces notées (€)", "Chèques notés (€)", "Total noté (€)", "Somme finale espèces (€)", "Somme finale chèques (€)",
      "Somme finale (€)", "Total retenu (€)", "Prix moyen par calendrier (€)"])];
  let tDep = 0, tVendus = 0, tRetenu = 0;
  for (const e of equipes) {
    const a = agreger(ruesDe(rues, secteurs.filter((s) => s.equipe_id === e.id)));
    const m = argentEquipe(e, a);
    const dep = Number(e.depart) || 0;
    tDep += dep; tVendus += a.vendus; tRetenu += m.somme;
    lignes.push(ligne([
      e.nom, e.membres, dep || null, a.vendus, dep ? dep - a.vendus : null, a.faite, a.rues,
      a.especes, a.cheques, a.somme,
      e.finale_especes, e.finale_cheques, m.finale ? m.somme : null,
      m.somme, prixMoyen(m.somme, a.vendus),
    ]));
  }
  lignes.push(ligne(["TOTAL", "", tDep || null, tVendus, tDep ? tDep - tVendus : null, "", "", "", "", "", "", "", "", tRetenu, prixMoyen(tRetenu, tVendus)]));
  lignes.push("", ligne(["RÉCAPITULATIF PAR SECTEUR"]),
    ligne(["Secteur", "Équipe", "Avancement (% de la longueur)", "Rues faites", "Rues commencées", "Rues à repasser", "Rues au total",
      "Calendriers vendus", "Espèces notées (€)", "Chèques notés (€)", "Total noté (€)", "Prix moyen par calendrier (€)"]));
  const eq = new Map(equipes.map((e) => [e.id, e.nom]));
  for (const s of secteurs) {
    const rs = rues.filter((r) => r.secteur_id === s.id);
    const a = agreger(rs);
    lignes.push(ligne([
      nomSecteur(s), (s.equipe_id && eq.get(s.equipe_id)) || "Non attribué", rs.length ? avancement(rs).pct : null,
      a.faite, a.encours, a.arepasser, a.rues, a.vendus, a.especes, a.cheques, a.somme, prixMoyen(a.somme, a.vendus),
    ]));
  }
  lignes.push("", ligne([`Exporté le ${new Date().toLocaleString("fr-FR")}`]),
    ligne(["« Total retenu » = somme finale déclarée par l'équipe si elle existe, sinon total noté rue par rue."]));
  telecharger(`${config.titre || "tournee"} - recapitulatif - ${suffixe()}.csv`, lignes);
}
