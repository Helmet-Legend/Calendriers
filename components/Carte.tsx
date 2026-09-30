"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapboxMap, MapMouseEvent, Marker } from "mapbox-gl";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import { avancement } from "@/lib/agregats";
import { GRIS, type Config, type Equipe, type LngLat, type Rue, type Secteur } from "@/lib/types";
import { Etoile, Loupe } from "./icones";
import { toast } from "./ui";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const STYLE_PLAN = "mapbox://styles/mapbox/streets-v12";
const STYLE_SAT = "mapbox://styles/mapbox/satellite-streets-v12";
const vide: FeatureCollection = { type: "FeatureCollection", features: [] };

interface Props {
  config: Config;
  equipes: Equipe[];
  secteurs: Secteur[];
  rues: Rue[];
  /** Estompe les secteurs des autres équipes. */
  focusEquipe?: string | null;
  selection: string | null;
  onSelect: (id: string | null) => void;
  admin: boolean;
  onDessin?: (points: LngLat[], redessin: string | null) => void;
  onCadrage?: (c: { lng: number; lat: number; zoom: number }) => void;
  /** Incrémenter pour lancer le dessin d'un nouveau secteur. */
  dessinDemande?: number;
  /** Passer un id de secteur pour lancer le redessin de ce secteur. */
  redessin?: string | null;
  onRedessinFini?: () => void;
  onDessinActif?: (actif: boolean) => void;
}

const centre = (pts: LngLat[]): LngLat => [
  pts.reduce((t, p) => t + p[0], 0) / pts.length,
  pts.reduce((t, p) => t + p[1], 0) / pts.length,
];

/** Lettre de la pastille et libellé long d'un secteur (« A » → « Secteur A »). */
export const pastille = (nom: string) => (nom.length <= 2 ? nom.toUpperCase() : nom.slice(0, 1).toUpperCase());
export const libelle = (nom: string) => (nom.length <= 2 ? `Secteur ${nom}` : nom);

interface Etiquette { id: string; nom: string; couleur: string; pct: number | null; estompe: boolean; pos: LngLat }

function elementEtiquette(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "etiquette";
  el.innerHTML = '<div class="rond"></div><div class="pct"></div><div class="nom"></div>';
  return el;
}
function remplirEtiquette(el: HTMLElement, e: Etiquette, choisi: boolean) {
  const [rond, pct, nom] = Array.from(el.children) as HTMLElement[];
  rond.textContent = pastille(e.nom);
  pct.textContent = e.pct === null ? "" : `${e.pct} %`;
  pct.style.display = e.pct === null ? "none" : "";
  nom.textContent = libelle(e.nom);
  for (const x of [rond, pct, nom]) x.style.background = e.couleur;
  el.style.opacity = e.estompe ? "0.45" : "1";
  nom.style.outline = choisi ? "3px solid #fff" : "";
  el.setAttribute("aria-label", `${libelle(e.nom)}${e.pct === null ? "" : `, ${e.pct} % des rues faites`}`);
}

export default function Carte(p: Props) {
  const conteneur = useRef<HTMLDivElement>(null);
  const carte = useRef<MapboxMap | null>(null);
  const marqueurs = useRef(new Map<string, Marker>());
  const mapboxRef = useRef<typeof import("mapbox-gl").default | null>(null);
  const [prete, setPrete] = useState(0); // incrémenté à chaque (re)chargement du style
  const [satellite, setSatellite] = useState(false);
  const [dessin, setDessin] = useState<LngLat[] | null>(null);
  const [redessinId, setRedessinId] = useState<string | null>(null);
  const [adresse, setAdresse] = useState("");
  const cadree = useRef(false);

  const etat = useRef({ dessin, onSelect: p.onSelect });
  etat.current = { dessin, onSelect: p.onSelect };

  const demarrer = (id: string | null) => {
    setRedessinId(id);
    setDessin([]);
    conteneur.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  useEffect(() => { if (p.redessin) demarrer(p.redessin); }, [p.redessin]);
  useEffect(() => { if (p.dessinDemande) demarrer(null); }, [p.dessinDemande]);
  const onActif = p.onDessinActif;
  useEffect(() => { onActif?.(dessin !== null); }, [dessin !== null, onActif]); // eslint-disable-line react-hooks/exhaustive-deps

  const geo = useMemo(() => {
    const couleur = new Map(p.equipes.map((e) => [e.id, e.couleur]));
    const zones: Feature<Polygon>[] = [];
    const etiquettes: Etiquette[] = [];
    for (const s of p.secteurs) {
      if (!Array.isArray(s.contour) || s.contour.length < 3 || s.id === redessinId) continue;
      const ruesS = p.rues.filter((r) => r.secteur_id === s.id);
      const pct = ruesS.length ? avancement(ruesS).pct : null;
      const c = (s.equipe_id && couleur.get(s.equipe_id)) || GRIS;
      const estompe = p.focusEquipe ? s.equipe_id !== p.focusEquipe : false;
      zones.push({
        type: "Feature",
        properties: { id: s.id, couleur: c, remplissage: 0.14 + ((pct ?? 0) / 100) * 0.3, estompe, choisi: p.selection === s.id },
        geometry: { type: "Polygon", coordinates: [[...s.contour, s.contour[0]]] },
      });
      etiquettes.push({ id: s.id, nom: s.nom, couleur: c, pct, estompe, pos: centre(s.contour) });
    }
    // Rues surlignées selon leur état (le tracé vient d'OpenStreetMap).
    const secteurEquipe = new Map(p.secteurs.map((s) => [s.id, s.equipe_id]));
    const traces: Feature[] = [];
    for (const r of p.rues) {
      if (r.etat === "afaire" || !r.trace?.length || r.secteur_id === redessinId || !secteurEquipe.has(r.secteur_id)) continue;
      traces.push({
        type: "Feature",
        properties: { etat: r.etat, estompe: p.focusEquipe ? secteurEquipe.get(r.secteur_id) !== p.focusEquipe : false },
        geometry: { type: "MultiLineString", coordinates: r.trace },
      });
    }
    return {
      zones: { type: "FeatureCollection", features: zones } as FeatureCollection,
      traces: { type: "FeatureCollection", features: traces } as FeatureCollection,
      etiquettes,
    };
  }, [p.secteurs, p.equipes, p.rues, p.focusEquipe, p.selection, redessinId]);

  const dessinGeo = useMemo<FeatureCollection>(() => {
    if (!dessin) return vide;
    const f: Feature[] = dessin.map((c, i) => ({ type: "Feature", properties: { premier: i === 0 }, geometry: { type: "Point", coordinates: c } }));
    if (dessin.length >= 2)
      f.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: dessin.length >= 3 ? [...dessin, dessin[0]] : dessin } });
    if (dessin.length >= 3) f.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...dessin, dessin[0]]] } });
    return { type: "FeatureCollection", features: f };
  }, [dessin]);

  // ---------- création de la carte (une fois)
  useEffect(() => {
    if (!TOKEN || !conteneur.current) return;
    let annule = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (annule || !conteneur.current) return;
      mapboxRef.current = mapboxgl;
      mapboxgl.accessToken = TOKEN;
      const m = new mapboxgl.Map({
        container: conteneur.current,
        style: STYLE_PLAN,
        center: [p.config.centre_lng, p.config.centre_lat],
        zoom: p.config.zoom,
        language: "fr",
      });
      carte.current = m;
      m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      m.addControl(new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showUserHeading: true }), "top-right");
      m.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-right");
      // Sources et calques, à réinstaller après chaque changement de fond (plan / satellite).
      m.on("style.load", () => {
        m.addSource("zones", { type: "geojson", data: vide });
        m.addSource("traces", { type: "geojson", data: vide });
        m.addSource("dessin", { type: "geojson", data: vide });
        m.addLayer({
          id: "zones-fond", type: "fill", source: "zones",
          paint: { "fill-color": ["get", "couleur"], "fill-opacity": ["*", ["get", "remplissage"], ["case", ["get", "estompe"], 0.35, 1]] },
        });
        m.addLayer({
          id: "zones-bord", type: "line", source: "zones",
          paint: {
            "line-color": ["get", "couleur"],
            "line-width": ["case", ["get", "choisi"], 5, 3],
            "line-opacity": ["case", ["get", "estompe"], 0.35, 1],
          },
          layout: { "line-join": "round" },
        });
        const opacite = ["case", ["get", "estompe"], 0.35, 1] as const;
        m.addLayer({
          id: "traces-contour", type: "line", source: "traces",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 13, 5, 17, 13], "line-opacity": opacite as never },
        });
        m.addLayer({
          id: "traces", type: "line", source: "traces", filter: ["!=", ["get", "etat"], "arepasser"],
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": ["match", ["get", "etat"], "faite", "#1E8A4C", "encours", "#F5C22E", "#8A96A8"],
            "line-width": ["interpolate", ["linear"], ["zoom"], 13, 3, 17, 8],
            "line-opacity": opacite as never,
          },
        });
        m.addLayer({
          id: "traces-repasser", type: "line", source: "traces", filter: ["==", ["get", "etat"], "arepasser"],
          layout: { "line-join": "round", "line-cap": "butt" },
          paint: {
            "line-color": "#C2185B",
            "line-width": ["interpolate", ["linear"], ["zoom"], 13, 3.5, 17, 9],
            "line-dasharray": [1.6, 0.9],
            "line-opacity": opacite as never,
          },
        });
        m.addLayer({ id: "dessin-fond", type: "fill", source: "dessin", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#F5C22E", "fill-opacity": 0.25 } });
        m.addLayer({ id: "dessin-ligne", type: "line", source: "dessin", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#F5C22E", "line-width": 3, "line-dasharray": [2, 1] } });
        m.addLayer({
          id: "dessin-points", type: "circle", source: "dessin", filter: ["==", ["geometry-type"], "Point"],
          paint: { "circle-radius": ["case", ["get", "premier"], 8, 6], "circle-color": "#F5C22E", "circle-stroke-color": "#15233A", "circle-stroke-width": 2 },
        });
        setPrete((n) => n + 1);
      });
      m.on("click", (e: MapMouseEvent) => {
        const { dessin: d, onSelect } = etat.current;
        if (d) {
          setDessin([...d, [Math.round(e.lngLat.lng * 1e6) / 1e6, Math.round(e.lngLat.lat * 1e6) / 1e6]]);
          return;
        }
        const f = m.queryRenderedFeatures(e.point, { layers: ["zones-fond"] })[0];
        onSelect((f?.properties?.id as string) ?? null);
      });
      m.on("mouseenter", "zones-fond", () => { if (!etat.current.dessin) m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", "zones-fond", () => { if (!etat.current.dessin) m.getCanvas().style.cursor = ""; });
    })();
    const ms = marqueurs.current;
    return () => {
      annule = true;
      ms.forEach((mk) => mk.remove());
      ms.clear();
      carte.current?.remove();
      carte.current = null;
    };
    // La carte n'est créée qu'une fois ; le cadrage initial vient de la config du moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- zones
  useEffect(() => {
    const m = carte.current;
    if (!prete || !m) return;
    (m.getSource("zones") as GeoJSONSource | undefined)?.setData(geo.zones);
    (m.getSource("traces") as GeoJSONSource | undefined)?.setData(geo.traces);
    if (!cadree.current) {
      const cibles = p.secteurs.filter((s) => s.contour.length >= 3 && (!p.focusEquipe || s.equipe_id === p.focusEquipe));
      const pts = (cibles.length ? cibles : p.secteurs).flatMap((s) => s.contour);
      if (pts.length >= 3) {
        const lng = pts.map((q) => q[0]), lat = pts.map((q) => q[1]);
        m.fitBounds([[Math.min(...lng), Math.min(...lat)], [Math.max(...lng), Math.max(...lat)]], { padding: 60, duration: 0, maxZoom: 17 });
        cadree.current = true;
      }
    }
  }, [prete, geo, p.secteurs, p.focusEquipe]);

  // ---------- étiquettes (marqueurs HTML : pastille, pourcentage, nom)
  useEffect(() => {
    const m = carte.current, mapboxgl = mapboxRef.current;
    if (!prete || !m || !mapboxgl) return;
    const vus = new Set<string>();
    for (const e of geo.etiquettes) {
      vus.add(e.id);
      let mk = marqueurs.current.get(e.id);
      if (!mk) {
        const el = elementEtiquette();
        el.addEventListener("click", (ev) => { ev.stopPropagation(); if (!etat.current.dessin) etat.current.onSelect(e.id); });
        mk = new mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat(e.pos).addTo(m);
        marqueurs.current.set(e.id, mk);
      } else mk.setLngLat(e.pos);
      remplirEtiquette(mk.getElement(), e, p.selection === e.id);
    }
    for (const [id, mk] of marqueurs.current) if (!vus.has(id)) { mk.remove(); marqueurs.current.delete(id); }
  }, [prete, geo, p.selection]);

  useEffect(() => {
    const m = carte.current;
    if (!prete || !m) return;
    (m.getSource("dessin") as GeoJSONSource | undefined)?.setData(dessinGeo);
    m.getCanvas().style.cursor = dessin ? "crosshair" : "";
    if (dessin) m.doubleClickZoom.disable();
    else m.doubleClickZoom.enable();
  }, [prete, dessinGeo, dessin]);

  // Recentre quand l'admin change la commune dans les réglages.
  const derniereVue = useRef(`${p.config.centre_lng},${p.config.centre_lat},${p.config.zoom}`);
  useEffect(() => {
    const cle = `${p.config.centre_lng},${p.config.centre_lat},${p.config.zoom}`;
    if (cle === derniereVue.current) return;
    derniereVue.current = cle;
    carte.current?.flyTo({ center: [p.config.centre_lng, p.config.centre_lat], zoom: p.config.zoom });
  }, [p.config.centre_lng, p.config.centre_lat, p.config.zoom]);

  const basculerFond = () => {
    const m = carte.current;
    if (!m) return;
    const sat = !satellite;
    setSatellite(sat);
    m.setStyle(sat ? STYLE_SAT : STYLE_PLAN, { diff: false } as Parameters<MapboxMap["setStyle"]>[1]);
  };

  const chercher = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = adresse.trim();
    const m = carte.current;
    if (!q || !m) return;
    const c = m.getCenter();
    try {
      const r = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q + (p.config.ville ? ", " + p.config.ville : ""))}&proximity=${c.lng},${c.lat}&country=fr&language=fr&limit=1&access_token=${TOKEN}`);
      const j = await r.json();
      const coord = j.features?.[0]?.geometry?.coordinates as [number, number] | undefined;
      if (coord) m.flyTo({ center: coord, zoom: Math.max(m.getZoom(), 17) });
      else toast("Adresse introuvable");
    } catch {
      toast("Recherche impossible pour le moment");
    }
  };

  const finir = () => {
    if (!dessin || dessin.length < 3) return;
    const id = redessinId;
    setDessin(null);
    setRedessinId(null);
    p.onRedessinFini?.();
    p.onDessin?.(dessin, id);
  };
  const abandonner = () => {
    setDessin(null);
    setRedessinId(null);
    p.onRedessinFini?.();
  };

  if (!TOKEN)
    return (
      <div className="empty">
        <strong>Carte indisponible</strong>La variable <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> n&apos;est pas renseignée.
      </div>
    );

  return (
    <>
      {p.admin && !dessin && p.onCadrage && (
        <button type="button" className="chip-btn" onClick={() => {
          const m = carte.current;
          if (m) p.onCadrage!({ lng: m.getCenter().lng, lat: m.getCenter().lat, zoom: m.getZoom() });
        }}>
          <Etoile size={22} />Garder ce cadrage par défaut
        </button>
      )}
      <div className={`carte ${dessin ? "dessin" : ""}`} id="carte">
        <div className="mapbox" ref={conteneur} />
        <form className="recherche" role="search" onSubmit={chercher}>
          <Loupe />
          <input type="search" placeholder="Rechercher une adresse…" aria-label="Rechercher une adresse" value={adresse} onChange={(e) => setAdresse(e.target.value)} />
        </form>
        <ul className="legende-carte" aria-label="Légende des rues">
          <li><i className="l-faite" />Faite</li>
          <li><i className="l-encours" />Commencée</li>
          <li><i className="l-repasser" />À repasser</li>
        </ul>
        <button type="button" className={`vue-sat ${satellite ? "plan" : ""}`} onClick={basculerFond}>
          {satellite ? "Plan" : "Plan satellite"}
        </button>
      </div>
      {dessin && (
        <>
          <div className="drawhint">
            Touchez la carte pour poser les coins du secteur ({dessin.length} point{dessin.length > 1 ? "s" : ""}).
          </div>
          <div className="bar" style={{ margin: 0 }}>
            <button className="btn small" disabled={!dessin.length} onClick={() => setDessin(dessin.slice(0, -1))}>
              Retirer le dernier point
            </button>
            <button className="btn small" onClick={abandonner}>
              Abandonner
            </button>
            <span className="grow" />
            <button className="btn small primary" disabled={dessin.length < 3} onClick={finir}>
              Terminer le secteur
            </button>
          </div>
        </>
      )}
    </>
  );
}
