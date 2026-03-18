# WebinarPulse — Product Requirements Document

**Version** : 1.0
**Date** : 18 mars 2026
**Auteur** : Brice / Superproductif
**Statut** : MVP en cours de déploiement

---

## 1. Résumé exécutif

WebinarPulse est un outil d'analytics dédié aux webinaires evergreen (différés) hébergés sur Systeme.io avec des vidéos Vimeo. Il comble un angle mort majeur : l'absence totale de visibilité sur le comportement réel des viewers dans les webinaires en replay. L'outil permet de savoir qui regarde, combien de temps, et surtout à quel moment les spectateurs décrochent, afin d'optimiser le contenu, la durée et le placement du pitch commercial.

---

## 2. Problème

Les webinaires evergreen de Systeme.io ne fournissent aucune donnée de visionnage. L'utilisateur ne sait pas :

- Si les inscrits regardent réellement le webinaire.
- Combien de temps ils restent sur la page.
- À quel moment précis ils quittent la vidéo.
- Quel pourcentage de la vidéo est effectivement consommé.
- Si le pitch commercial arrive trop tôt ou trop tard.

Cette absence de données empêche toute optimisation itérative du contenu. Les décisions sur la durée, le rythme et le placement de l'offre se font à l'aveugle.

---

## 3. Persona cible

**Brice et les formateurs / infopreneurs francophones** qui utilisent Systeme.io pour vendre des formations via des webinaires automatisés. Profil type : solopreneur ou petite équipe, 2-5 webinaires evergreen actifs, audience de quelques dizaines à quelques centaines de viewers par mois. Familier avec les outils no-code mais pas développeur.

---

## 4. Objectifs produit

| Objectif | Métrique de succès | Priorité |
|---|---|---|
| Visualiser la courbe de rétention d'un webinaire | L'utilisateur identifie le point de décrochage principal en moins de 10 secondes | P0 |
| Mesurer la durée de visionnage individuelle | Chaque session affiche la durée exacte et le % de vidéo vu | P0 |
| Identifier les viewers (email) | 70%+ des sessions sont identifiées via l'email Systeme.io | P1 |
| Suivre le volume de sessions | Dashboard avec graphique journalier et filtres par période | P1 |
| Installation en moins de 5 minutes | Un script à copier-coller dans Systeme.io, rien d'autre | P0 |

---

## 5. Solution

### 5.1 Architecture technique

Le système se compose de trois couches :

**Couche de collecte (tracking script)**
Un snippet JavaScript léger (~2 Ko) à injecter dans la page webinaire de Systeme.io via le champ "Code personnalisé". Ce script se branche sur l'API Vimeo Player pour intercepter les événements natifs du lecteur vidéo (play, pause, seeked, timeupdate, ended) et envoie les données vers la base de données via l'API REST de Supabase. L'identification du viewer se fait par extraction de l'email depuis les paramètres d'URL (?email= ou ?contact_email=) que Systeme.io injecte automatiquement dans les liens envoyés par email.

**Couche de stockage (Supabase PostgreSQL)**
Quatre tables relationnelles hébergées sur le projet Supabase "Flow" (région eu-west-3). RLS activé sur toutes les tables avec des policies permettant l'insertion anonyme (nécessaire pour le tracking côté client) et la lecture pour le dashboard.

**Couche de visualisation (dashboard Next.js)**
Application Next.js 14 (App Router) avec Tailwind CSS, déployée sur Vercel. Trois vues principales : courbe de rétention SVG interactive, table de sessions triable, et graphique de volume journalier.

### 5.2 Stack technique

| Composant | Technologie | Justification |
|---|---|---|
| Frontend | Next.js 14, React 18, Tailwind CSS | SSR-ready, déploiement Vercel natif |
| Base de données | Supabase (PostgreSQL 15) | API REST auto-générée, RLS, zéro backend custom |
| Tracking vidéo | Vimeo Player JS API | Accès natif aux événements play/pause/timeupdate |
| Hébergement | Vercel | Déploiement Git-push, CDN global |
| Fonts | Outfit (display), DM Sans (body), JetBrains Mono | Typographie distinctive, lisibilité data |

### 5.3 Modèle de données

```
webinars
├── id (UUID, PK)
├── name (TEXT)
├── vimeo_video_id (TEXT)
├── video_duration_seconds (INTEGER)
├── slug (TEXT, UNIQUE)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)

viewers
├── id (UUID, PK)
├── email (TEXT, UNIQUE, nullable)
├── anonymous_id (TEXT, UNIQUE, nullable)
├── first_seen_at (TIMESTAMPTZ)
└── created_at (TIMESTAMPTZ)

viewing_sessions
├── id (UUID, PK)
├── webinar_id (UUID, FK → webinars)
├── viewer_id (UUID, FK → viewers)
├── started_at (TIMESTAMPTZ)
├── ended_at (TIMESTAMPTZ)
├── duration_seconds (INTEGER)
├── max_video_percent (REAL)
├── max_video_seconds (REAL)
├── user_agent (TEXT)
├── referrer (TEXT)
└── created_at (TIMESTAMPTZ)

viewing_events
├── id (UUID, PK)
├── session_id (UUID, FK → viewing_sessions)
├── event_type (TEXT: play, pause, seeked, timeupdate, page_hidden, page_visible, page_leave, ended)
├── video_seconds (REAL)
├── video_percent (REAL)
└── timestamp (TIMESTAMPTZ)
```

Relations : webinars 1→N viewing_sessions N←1 viewers, viewing_sessions 1→N viewing_events.

Index créés sur : sessions.webinar_id, sessions.viewer_id, sessions.started_at (DESC), events.session_id, events.event_type.

---

## 6. Fonctionnalités détaillées

### 6.1 MVP (v1.0) — Statut : développé

**F1 — Courbe de rétention** (P0)
Graphique SVG interactif montrant le pourcentage de viewers encore présents à chaque point de la vidéo. 50 buckets temporels sur toute la durée. Zone rouge automatique sur le plus gros décrochage. Tooltip au survol avec le nombre exact de viewers, le pourcentage de rétention et la position temporelle.

**F2 — Durée de visionnage par session** (P0)
Table triable de toutes les sessions avec colonnes : email du viewer (ou "Anonyme"), date/heure, durée de visionnage, et barre de progression colorée (vert ≥80%, jaune ≥50%, orange ≥20%, rouge <20%). Tri par date, durée, progression ou email.

**F3 — Identification des viewers** (P1)
Extraction automatique de l'email depuis les paramètres d'URL Systeme.io (?email=, ?contact_email=, ?e=). Upsert côté base pour gérer les viewers récurrents sans doublon.

**F4 — Volume journalier** (P1)
Graphique en barres SVG du nombre de sessions par jour avec labels adaptatifs.

**F5 — Filtrage par période** (P1)
Filtres 7j / 30j / 90j / Tout, appliqués à toutes les vues simultanément.

**F6 — Script de tracking auto-généré** (P0)
Modal avec le snippet JavaScript prêt à copier, personnalisé avec l'ID du webinaire et les clés Supabase. Bouton "Copier" avec feedback visuel.

**F7 — Gestion multi-webinaires** (P1)
Page d'accueil listant tous les webinaires configurés. Formulaire d'ajout avec nom, ID Vimeo, durée et slug. Support de 2-5 webinaires.

**F8 — Mode démo** (P2)
Données simulées réalistes quand la base est vide ou inaccessible. Permet de montrer le produit sans données réelles.

### 6.2 Roadmap v1.1

**F9 — Heatmap de rétention** (P2)
Remplacer la courbe par une heatmap horizontale (gradient vert → rouge) pour une lecture encore plus rapide du point de décrochage.

**F10 — Alertes de drop** (P2)
Notification quand le taux de rétention à un point clé (ex: moment du pitch) descend sous un seuil configurable.

**F11 — Comparaison A/B** (P2)
Comparer les courbes de rétention de deux webinaires ou deux versions du même webinaire.

**F12 — Export CSV** (P2)
Exporter les sessions et données de rétention en CSV pour analyse externe.

**F13 — Intégration API Vimeo REST** (P3)
Récupération automatique de la durée des vidéos et métadonnées depuis l'API Vimeo pour éviter la saisie manuelle.

**F14 — Tags Systeme.io** (P3)
Ajout automatique de tags dans Systeme.io (via API) en fonction du comportement de visionnage (ex: "a regardé 80%+", "a quitté avant le pitch").

**F15 — Authentification dashboard** (P2)
Ajouter une protection par mot de passe ou auth Supabase pour sécuriser l'accès au dashboard.

---

## 7. Mécanisme de tracking — détail technique

### 7.1 Cycle de vie d'une session

1. Le viewer arrive sur la page webinaire Systeme.io.
2. Le script extrait l'email des paramètres d'URL (ou génère un ID anonyme).
3. Un viewer est créé ou retrouvé via upsert PostgREST (header `Prefer: resolution=merge-duplicates`).
4. Une `viewing_session` est créée avec webinar_id, viewer_id, user_agent et referrer.
5. Le script initialise le Vimeo Player et écoute les événements.
6. À chaque `timeupdate` (throttlé à 10s), la session est mise à jour via PATCH avec la durée max et le pourcentage max atteint.
7. Les événements play/pause/seeked/ended/page_hidden/page_visible sont stockés dans `viewing_events`.
8. Au départ de la page (`beforeunload`), un `navigator.sendBeacon` envoie un dernier événement `page_leave` pour garantir la fiabilité de la sortie.

### 7.2 Gestion des edge cases

| Cas | Traitement |
|---|---|
| Viewer sans email (lien direct) | ID anonyme aléatoire, affiché comme "Anonyme" dans le dashboard |
| Même viewer revient | Upsert sur email, nouvelle session créée (historique conservé) |
| Viewer rafraîchit la page | Nouvelle session (la précédente garde ses données) |
| Vidéo seeked en avant | max_video_seconds suit le max réel atteint, pas la position seek |
| Page cachée (onglet switch) | Événement `page_hidden` enregistré + update session |
| Fermeture brutale navigateur | `sendBeacon` assure l'envoi du dernier état |

### 7.3 Calcul de la courbe de rétention

La vidéo est divisée en 50 buckets temporels. Pour chaque bucket, on compte le nombre de sessions dont `max_video_seconds` dépasse le timestamp du bucket. Le pourcentage de rétention = (sessions au bucket / total sessions) × 100. Le drop maximal est calculé comme la plus grande différence entre deux buckets consécutifs.

---

## 8. Installation et déploiement

### 8.1 Infrastructure existante

| Composant | Détail |
|---|---|
| Projet Supabase | "Flow" (nrdiphkwejcghgeemjjb), région eu-west-3 |
| Tables | webinars, viewers, viewing_sessions, viewing_events (créées, RLS actif) |
| Clé anon | Configurée dans le projet |
| Hébergement | Vercel (connecteur actif) |
| Repo | Projet Next.js prêt à push sur GitHub |

### 8.2 Procédure de mise en production

1. Push du code sur GitHub.
2. Import dans Vercel avec variables d'environnement `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Vercel déploie automatiquement.
4. Ajouter un webinaire dans le dashboard.
5. Copier le script de tracking.
6. Coller dans Systeme.io (page webinaire → Paramètres → Codes de suivi → Body).

---

## 9. Considérations de sécurité

**RLS (Row Level Security)** : activé sur les 4 tables. Les policies actuelles autorisent l'insertion et la lecture anonyme, ce qui est nécessaire pour le tracking côté client mais expose les données en lecture. La v1.1 devra ajouter une authentification sur le dashboard (F15).

**Données personnelles** : l'email est collecté depuis les paramètres d'URL. Aucun cookie n'est utilisé. Aucune donnée n'est partagée avec des tiers. Un bandeau de consentement n'est pas requis car il n'y a pas de cookie, mais l'information doit figurer dans la politique de confidentialité du tunnel Systeme.io.

**Clé Supabase anon** : exposée côté client (par design). Elle ne donne accès qu'aux opérations autorisées par les RLS policies. La clé service_role n'est jamais exposée.

---

## 10. Limites connues du MVP

1. **Pas d'authentification** : le dashboard est accessible à quiconque a l'URL. Mitigation : URL non indexée + v1.1 ajoutera l'auth.
2. **RLS ouvert en lecture** : les données de sessions sont lisibles par n'importe quel appel API avec la clé anon. Acceptable pour un usage interne, à verrouiller avant distribution.
3. **Tracking côté client** : les adblockers peuvent bloquer les appels vers Supabase. Mitigation possible via un proxy Vercel en v1.1.
4. **Pas de liaison inverse Systeme.io** : on lit les données Systeme.io (email dans l'URL) mais on n'écrit pas de tags en retour. Prévu en v1.2 (F14).
5. **Précision du timeupdate** : throttlé à 10 secondes, la granularité de la durée est de ±10s.
6. **Pas de gestion du volume** : pas de pagination côté API. Acceptable jusqu'à ~5 000 sessions par webinaire.

---

## 11. Métriques de suivi post-lancement

| Métrique | Cible à 30 jours |
|---|---|
| Webinaires trackés | 2-3 |
| Sessions enregistrées | 100+ |
| Taux d'identification (email vs anonyme) | >70% |
| Fiabilité du tracking (sessions avec durée >0) | >95% |
| Temps de chargement dashboard | <2s |
| Première optimisation de contenu basée sur les données | Au moins 1 |

---

## 12. Glossaire

| Terme | Définition |
|---|---|
| Webinaire evergreen / différé | Vidéo pré-enregistrée présentée comme un live, rejouée automatiquement |
| Session | Une instance de visionnage, du moment où le viewer arrive sur la page jusqu'à son départ |
| Rétention | Pourcentage de viewers encore présents à un moment donné de la vidéo |
| Drop | Perte de viewers entre deux points de la vidéo |
| Bucket | Segment temporel de la vidéo utilisé pour calculer la courbe de rétention |
| Upsert | Opération qui crée un enregistrement s'il n'existe pas, ou le met à jour s'il existe déjà |
| RLS | Row Level Security, mécanisme PostgreSQL de contrôle d'accès au niveau des lignes |
| sendBeacon | API navigateur qui envoie des données de manière fiable même pendant la fermeture de page |
