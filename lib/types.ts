export type Etat = "afaire" | "encours" | "faite" | "arepasser";

export const ETATS: Record<Etat, string> = {
  afaire: "À faire",
  encours: "Commencée",
  faite: "Faite",
  arepasser: "À repasser",
};

export type LngLat = [number, number];

export interface Config {
  id: number;
  titre: string;
  ville: string;
  centre_lng: number;
  centre_lat: number;
  zoom: number;
}

export interface Equipe {
  id: string;
  nom: string;
  membres: string;
  depart: number;
  couleur: string;
  cree_a: string;
}

export interface Secteur {
  id: string;
  nom: string;
  equipe_id: string | null;
  contour: LngLat[];
  cree_a: string;
}

export interface Rue {
  id: string;
  secteur_id: string;
  nom: string;
  ordre: number;
  etat: Etat;
  arret: string;
  note: string;
  vendus: number;
  especes: number;
  cheques: number;
  repasse: boolean;
  maj_a: string | null;
  /** Tracé OpenStreetMap : null = pas encore cherché, [] = introuvable. */
  trace: LngLat[][] | null;
}

export interface Historique {
  id: number;
  rue_id: string;
  equipe_id: string | null;
  etat: Etat;
  arret: string;
  note: string;
  vendus: number;
  especes: number;
  cheques: number;
  a: string;
}

export const COULEURS = ["#2B6CB0", "#C0392B", "#2E8B57", "#8E44AD", "#D68910", "#16A085", "#B03A7A", "#5D6D7E"];
export const GRIS = "#8A96A8";
