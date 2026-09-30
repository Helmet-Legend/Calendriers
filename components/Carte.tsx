"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapboxMap, MapMouseEvent } from "mapbox-gl";
import type { Feature, FeatureCollection, Point, Polygon } from "geojson";
import { agreger } from "@/lib/agregats";
import { GRIS, type Config, type Equipe, type LngLat, type Rue, type Secteur } from "@/lib/types";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
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
  /** Passer un id de secteur pour lancer le redessin de ce secteur. */
  redessin?: string | null;
  onRedessinFini?: () => void;
}

const centre = (pts: LngLat[]): LngLat => [
  pts.reduce((t, p) => t + p[0], 0) / pts.length,
  pts.reduce((t, p) => t + p[1], 0) / pts.length,
];

export default function Carte(p: Props) {
  const conteneur = useRef<HTMLDivElement>(null);
  const carte = useRef<MapboxMap | null>(null);
  const [prete, setPrete] = useState(false);
  const [dessin, setDessin] = useState<LngLat[] | null>(null);
  const [redessinId, setRedessinId] = useState<string | null>(null);
  const cadree = useRef(false);

  // Dernières valeurs, lues par les gestionnaires Mapbox enregistrés une seule fois.
  const etat = useRef({ dessin, onSelect: p.onSelect });
  etat.current = { dessin, onSelect: p.onSelect };

  // Lancement d'un redessin depuis l'extérieur (bouton « Redessiner » d'un secteur).
  useEffect(() => {
    if (p.redessin) {
      setRedessinId(p.redessin);
      setDessin([]);
      conteneur.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [p.redessin]);

  const secteursGeo = useMemo<{ zones: FeatureCollection; etiquettes: FeatureCollection }>(() => {
    const couleur = new Map(p.equipes.map((e) => [e.id, e.couleur]));
    const zones: Feature<Polygon>[] = [];
    const etiquettes: Feature<Point>[] = [];
    for (const s of p.secteurs) {
      if (!Array.isArray(s.contour) || s.contour.length < 3 || s.id === redessinId) continue;
      const a = agreger(p.rues.filter((r) => r.secteur_id === s.id));
      const pct = a.rues ? Math.round((a.faite / a.rues) * 100) : 0;
      const props = {
        id: s.id,
        couleur: (s.equipe_id && couleur.get(s.equipe_id)) || GRIS,
        remplissage: 0.12 + (pct / 100) * 0.38,
        estompe: p.focusEquipe ? s.equipe_id !== p.focusEquipe : false,
        choisi: p.selection === s.id,
        etiquette: s.nom + (a.rues ? `\n${pct} %` : ""),
      };
      zones.push({ type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: [[...s.contour, s.contour[0]]] } });
      etiquettes.push({ type: "Feature", properties: props, geometry: { type: "Point", coordinates: centre(s.contour) } });
    }
    return { zones: { type: "FeatureCollection", features: zones }, etiquettes: { type: "FeatureCollection", features: etiquettes } };
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
      mapboxgl.accessToken = TOKEN;
      const m = new mapboxgl.Map({
        container: conteneur.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [p.config.centre_lng, p.config.centre_lat],
        zoom: p.config.zoom,
        language: "fr",
        attributionControl: true,
      });
      carte.current = m;
      m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      m.addControl(new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showUserHeading: true }), "top-right");
      m.on("load", () => {
        m.addSource("zones", { type: "geojson", data: vide });
        m.addSource("etiquettes", { type: "geojson", data: vide });
        m.addSource("dessin", { type: "geojson", data: vide });
        m.addLayer({
          id: "zones-fond", type: "fill", source: "zones",
          paint: { "fill-color": ["get", "couleur"], "fill-opacity": ["*", ["get", "remplissage"], ["case", ["get", "estompe"], 0.3, 1]] },
        });
        m.addLayer({
          id: "zones-bord", type: "line", source: "zones",
          paint: {
            "line-color": ["get", "couleur"],
            "line-width": ["case", ["get", "choisi"], 4.5, 2],
            "line-opacity": ["case", ["get", "estompe"], 0.3, 1],
          },
          layout: { "line-join": "round" },
        });
        m.addLayer({
          id: "zones-noms", type: "symbol", source: "etiquettes",
          layout: {
            "text-field": ["get", "etiquette"],
            "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
            "text-size": 14,
            "text-allow-overlap": true,
          },
          paint: {
            "text-color": "#fff", "text-halo-color": ["get", "couleur"], "text-halo-width": 2,
            "text-opacity": ["case", ["get", "estompe"], 0.4, 1],
          },
        });
        m.addLayer({ id: "dessin-fond", type: "fill", source: "dessin", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#F2C230", "fill-opacity": 0.25 } });
        m.addLayer({ id: "dessin-ligne", type: "line", source: "dessin", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#F2C230", "line-width": 3, "line-dasharray": [2, 1] } });
        m.addLayer({
          id: "dessin-points", type: "circle", source: "dessin", filter: ["==", ["geometry-type"], "Point"],
          paint: { "circle-radius": ["case", ["get", "premier"], 8, 6], "circle-color": "#F2C230", "circle-stroke-color": "#15233A", "circle-stroke-width": 2 },
        });
        setPrete(true);
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
    return () => {
      annule = true;
      carte.current?.remove();
      carte.current = null;
    };
    // La carte n'est créée qu'une fois ; le cadrage initial vient de la config du moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- données
  useEffect(() => {
    const m = carte.current;
    if (!prete || !m) return;
    (m.getSource("zones") as GeoJSONSource).setData(secteursGeo.zones);
    (m.getSource("etiquettes") as GeoJSONSource).setData(secteursGeo.etiquettes);
    // Premier cadrage : sur les secteurs de l'équipe, sinon sur tous les secteurs.
    if (!cadree.current) {
      const cibles = p.secteurs.filter((s) => s.contour.length >= 3 && (!p.focusEquipe || s.equipe_id === p.focusEquipe));
      const pts = (cibles.length ? cibles : p.secteurs).flatMap((s) => s.contour);
      if (pts.length >= 3) {
        const lng = pts.map((q) => q[0]), lat = pts.map((q) => q[1]);
        m.fitBounds([[Math.min(...lng), Math.min(...lat)], [Math.max(...lng), Math.max(...lat)]], { padding: 40, duration: 0, maxZoom: 17 });
        cadree.current = true;
      }
    }
  }, [prete, secteursGeo, p.secteurs, p.focusEquipe]);

  useEffect(() => {
    const m = carte.current;
    if (!prete || !m) return;
    (m.getSource("dessin") as GeoJSONSource).setData(dessinGeo);
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
      {p.admin && !dessin && (
        <div className="bar">
          <button className="btn small" onClick={() => {
            const m = carte.current;
            if (m && p.onCadrage) p.onCadrage({ lng: m.getCenter().lng, lat: m.getCenter().lat, zoom: m.getZoom() });
          }}>
            Garder ce cadrage par défaut
          </button>
          <span className="grow" />
          <button className="btn small primary" onClick={() => { setRedessinId(null); setDessin([]); }}>
            Dessiner un secteur
          </button>
        </div>
      )}
      <div className={`carte ${dessin ? "dessin" : ""}`}>
        <div ref={conteneur} />
      </div>
      {dessin && (
        <>
          <div className="drawhint">
            Touchez la carte pour poser les coins du secteur ({dessin.length} point{dessin.length > 1 ? "s" : ""}).
          </div>
          <div className="bar">
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
