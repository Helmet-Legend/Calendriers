# Tournée des calendriers

Application de suivi en temps réel d'une tournée de vente de calendriers (type pompiers/associatif) par plusieurs binômes/trinômes, avec vue d'ensemble pour les responsables.

**Stack** : Next.js (App Router) · Supabase (Postgres, Auth, Realtime) · Mapbox GL · déploiement Vercel.

## Fonctionnement

- **Responsables (admins)** : connexion par lien magique envoyé par e-mail. Le **premier compte qui se connecte devient admin**, puis ajoute les autres depuis « Réglages ».
- **Équipes** : chaque équipe a un **lien secret** (`/e/<jeton>`) à envoyer par SMS/WhatsApp. En l'ouvrant, le téléphone est connecté anonymement et rattaché à l'équipe. Il ne peut noter que les rues **de ses propres secteurs**, et c'est vérifié côté base (RLS), pas seulement dans l'interface. « Créer un nouveau lien » invalide l'ancien et déconnecte les téléphones.
- **Carte** : fond Mapbox réel, secteurs dessinés en polygones GPS (touchez la carte pour poser chaque coin), géolocalisation du téléphone, cadrage automatique sur les secteurs de l'équipe.
- **Suivi par rue** : état (à faire / commencée / faite / à repasser), point d'arrêt, note de repasse, calendriers vendus, **espèces et chèques séparés**.
- **Historique** : chaque modification d'une rue est journalisée (table `historique`) et visible dans la fiche de la rue.
- **Temps réel** : tous les écrans se mettent à jour via Supabase Realtime, avec un rattrapage au retour de veille du téléphone.

## Mise en route

### 1. Supabase (projet `tournee-calendriers`, déjà créé et migré)

Les migrations sont dans `supabase/migrations/`. Réglages à faire une fois dans le tableau de bord Supabase :

1. **Authentication → Sign In / Providers → « Allow anonymous sign-ins »** : à activer. Sinon, les liens d'équipe ne fonctionnent pas.
2. **Authentication → URL Configuration** :
   - *Site URL* : l'adresse de production (ex. `https://tournee-calendriers.vercel.app`) ;
   - *Redirect URLs* : ajouter la même adresse et `http://localhost:3000`.

### 2. Mapbox

Créez un jeton public (`pk.…`) sur https://account.mapbox.com/access-tokens/ et restreignez-le aux URL du site.

### 3. Variables d'environnement

Voir `.env.example` : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`.

```bash
cp .env.example .env.local   # puis renseigner le jeton Mapbox
npm install
npm run dev
```

### 4. Vercel

Importez le dépôt dans Vercel, ajoutez les trois variables d'environnement, déployez, puis reportez l'URL obtenue dans Supabase (étape 1.2).

### 5. Premier usage

1. Ouvrez le site et connectez-vous avec votre e-mail : vous devenez admin.
2. « Réglages » : titre et commune (la carte se centre dessus).
3. Créez les équipes, dessinez les secteurs, saisissez les rues (une par ligne).
4. Dans chaque équipe, « Modifier l'équipe et son lien » → « Partager » le lien à l'équipe.

## Modèle de données

| Table | Contenu |
|---|---|
| `config` (1 ligne) | titre, ville, cadrage par défaut de la carte |
| `admins` | e-mails des responsables |
| `equipes` | nom, membres, calendriers au départ, couleur |
| `jetons_equipe` | lien secret de chaque équipe (lisible par les admins seulement) |
| `membres_equipe` | utilisateur anonyme → équipe |
| `secteurs` | nom, équipe, `contour` `[[lng, lat], …]` |
| `rues` | secteur, nom, ordre, état, arrêt, note, vendus, espèces, chèques, repasse, maj_a |
| `historique` | journal des modifications de chaque rue |

Les équipes écrivent uniquement via les fonctions `noter_rue` et `ajouter_rue`, qui vérifient que le secteur leur appartient.

## Prototype d'origine

`prototype/tournee-calendriers.html` : première version, qui tournait dans l'environnement Artifact de claude.ai (image de plan importée, pas de droits par équipe). Conservée pour référence.
