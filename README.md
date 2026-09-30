# Tournée des calendriers

Application de suivi en temps réel d'une tournée de vente de calendriers (type pompiers/associatif) par plusieurs binômes/trinômes, avec vue d'ensemble pour les admins.

## État actuel : prototype `index.html`

Prototype fonctionnel conçu pour l'environnement « Artifact » de claude.ai : une seule page HTML, sans backend propre, qui utilise l'API `window.claude.use(...)` (`db`, `user`, `assets`). **Il ne tourne pas tel quel hors de claude.ai** : il faut soit continuer à l'y héberger, soit le réécrire avec un vrai backend.

### Fonctionnalités

- **Plan interactif** : image (capture de carte) importée par un admin, sur laquelle on dessine des secteurs polygonaux (clic pour poser chaque coin).
- **Équipes** : nom, membres, nombre de calendriers au départ, couleur.
- **Secteurs** : attribués à une équipe, contiennent une liste de rues.
- **Suivi par rue** : état (à faire / commencée / faite / à repasser), point d'arrêt si interrompue, note si à repasser, calendriers vendus, somme encaissée.
- **Agrégats en direct** : somme collectée, calendriers vendus/restants, rues faites/commencées/à repasser, par équipe et au global.
- **Deux vues** : « Vue d'ensemble » (admins) et « Ma tournée » (équipe choisie une fois, mémorisée via `localStorage`).
- **Liens Google Maps** par rue (recherche simple, pas d'itinéraire).
- **Temps réel** entre tous les appareils connectés.

### Modèle de données

| Emplacement | Contenu |
|---|---|
| `config/main` (document unique) | `{ titre, ville, planId, planW, planH }` — `planId` pointe vers l'image uploadée via `assets` |
| collection `equipes` | `{ nom, membres, depart, couleur, creeA }` |
| collection `secteurs` | `{ nom, equipeId, points: [[x,y]…] (normalisés 0–1 sur l'image), rues: { id: {nom, ordre} }, suivi: { rueId: {etat, arret, note, vendus, somme, maj} }, majA, creeA }` |

### Permissions

Deux rôles fournis par claude.ai : « peut modifier » (admin : équipes, secteurs, plan) et « peut écrire des données » (contributeur : suivi des rues). Pas de droits par équipe : une équipe peut techniquement modifier n'importe quel secteur, le cloisonnement n'existe que dans l'interface.

## Limites connues

1. **Carte statique** : image plate, pas de zoom fluide, pas de géolocalisation ni d'itinéraire.
2. **Pas d'authentification par équipe** : simple choix local sur le téléphone.
3. **Pas d'historique/audit** : seul l'état courant de chaque rue est stocké.
4. **Pas de distinction espèces/chèques** dans les sommes encaissées.
5. **Import d'image uniquement** : pas de vrai fond de carte.

## Pistes pour la « vraie app »

- Stack : **Next.js + Supabase** (base temps réel + auth), déployé sur **Vercel**.
- Polygones GPS (lat/lng) sur une carte Leaflet/Mapbox avec fond de carte standard (plus d'image importée).
- Compte ou lien d'accès par équipe.
- Conserver le modèle de données (équipes / secteurs / rues avec état, vendus, somme), pensé pour être portable.
