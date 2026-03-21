# WebinarPulse — État de l'Application (21 mars 2026)

## Vue d'ensemble

**WebinarPulse** est une plateforme d'analytics pour webinaires evergreen hébergés sur Vimeo, intégrée à Systeme.io. Elle permet de suivre en temps réel qui regarde un webinaire, jusqu'où, et de corréler les ventes aux comportements de visionnage.

- **URL de production** : https://project-to7fk.vercel.app
- **Stack** : Next.js 14 + React 18 + Supabase + TailwindCSS
- **Hébergement** : Vercel (plan Pro)
- **Base de données** : Supabase (PostgreSQL)
- **API externe** : Systeme.io (gestion contacts, tags, webhooks)

---

## Architecture Technique

```
┌──────────────────────────────────────────────────────┐
│                 FRONTEND (Next.js)                    │
│  page.js → WebinarList → Dashboard                   │
│     ├── RetentionChart (courbe de rétention)          │
│     ├── ViewerTable (liste des viewers)               │
│     ├── DailyChart (volume quotidien)                 │
│     ├── ConversionTab (suivi des ventes)              │
│     ├── TranscriptTab (chapitres + transcript)        │
│     ├── TaggingTab (gestion des tags Systeme.io)      │
│     └── DiagnosticPanel (diagnostic IA)               │
│  AddWebinarModal (création/édition webinaire)         │
│  SettingsModal (gestion comptes Systeme.io)           │
│  ScriptGenerator (génération des scripts de tracking) │
│  SetupChecklist (guide de configuration)              │
└──────────────┬───────────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────────┐
│              API ROUTES (Next.js)                     │
│  /api/script       → Génère le script de tracking    │
│  /api/ip           → Détecte l'IP du viewer          │
│  /api/sync-tags    → Synchronisation tags Systeme.io │
│  /api/webhook/optin → Webhook inscription            │
│  /api/webhook/sale  → Webhook achat                  │
│  /api/analyze-transcript → Analyse IA du transcript  │
│  /api/generate-diagnostic → Diagnostic IA global     │
└──────────────┬───────────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────────┐
│            SUPABASE (PostgreSQL)                      │
│  webinars, viewers, viewing_sessions, viewing_events  │
│  systemeio_accounts, tagging_rules, tagging_log       │
│  pending_registrations, purchases, app_settings       │
│  webinar_chapters, webinar_transcripts, webhook_logs  │
└──────────────────────────────────────────────────────┘
```

---

## Fichiers et Composants

### Pages & Routing

| Fichier | Rôle |
|---------|------|
| `app/page.js` | Page principale — gère la liste des webinaires et le dashboard. Inclut la logique de création, modification et suppression de webinaires |
| `app/layout.js` | Layout racine avec les fonts Google (Inter, Outfit) et les métadonnées |
| `app/globals.css` | Styles globaux et design system (variables CSS, animations) |

### Composants UI (15 fichiers)

| Composant | Taille | Rôle |
|-----------|--------|------|
| `SettingsModal.js` | 31 Ko | Gestion des comptes Systeme.io (CRUD, clés API, secrets webhook) |
| `ScriptGenerator.js` | 23 Ko | Générateur de scripts d'installation (tracking + interception de formulaires) |
| `Dashboard.js` | 17 Ko | Dashboard principal avec onglets, stats, score de fiabilité, bouton sync |
| `TranscriptTab.js` | 16 Ko | Upload et affichage des chapitres/transcripts du webinaire |
| `TaggingTab.js` | 15 Ko | Configuration et exécution des règles de tagging automatique |
| `WebinarList.js` | 14 Ko | Liste des webinaires avec stats, progression config, boutons edit/delete |
| `ConversionTab.js` | 12 Ko | Suivi des ventes liées aux viewers (taux de conversion) |
| `AddWebinarModal.js` | 11 Ko | Modal création/modification de webinaire avec paramètres avancés |
| `RetentionChart.js` | 10 Ko | Graphique SVG de rétention avec chapitres, tooltip, drops |
| `SetupChecklist.js` | 8 Ko | Guide de configuration étape par étape |
| `TrackingScriptModal.js` | 6 Ko | Modal d'affichage du script de tracking à copier |
| `ViewerTable.js` | 5 Ko | Tableau des viewers avec email, durée, progression |
| `DiagnosticPanel.js` | 4 Ko | Panneau de diagnostic IA (analyse globale du webinaire) |
| `DailyChart.js` | 2 Ko | Graphique du volume quotidien de sessions |
| `StatCard.js` | 1 Ko | Carte de statistique (sessions, durée, complétion, progression) |

### API Routes (6 endpoints)

| Endpoint | Méthode | Rôle |
|----------|---------|------|
| `/api/script` | GET | Génère dynamiquement le script de tracking JS pour un webinaire. Récupère le `cta_button_id` du webinaire pour le CTA tracking. Injecte l'URL de l'app pour la détection IP |
| `/api/ip` | GET | Retourne l'IP du client (via X-Forwarded-For). Remplace api.ipify.org qui était bloqué par les ad-blockers |
| `/api/sync-tags` | GET | **Cron toutes les 10 min.** Trois stratégies de matching : (1) batch RPC, (2) tag-based, (3) Systeme.io viewer matching. Applique aussi les règles de tagging |
| `/api/webhook/optin` | POST | Reçoit les inscriptions Systeme.io. Crée un viewer + pending_registration pour le matching par IP |
| `/api/webhook/sale` | POST | Reçoit les achats Systeme.io. Enregistre les ventes et tente le matching avec les sessions existantes |
| `/api/analyze-transcript` | POST | Analyse IA du transcript pour générer un diagnostic du webinaire |
| `/api/generate-diagnostic` | POST | Génère un diagnostic IA global basé sur les données du webinaire |

### Utilitaires (lib/)

| Fichier | Rôle |
|---------|------|
| `supabase.js` | Client Supabase partagé (côté client) |
| `utils.js` | Fonctions utilitaires (formatDuration, données de démo) |
| `webhookUtils.js` | Vérification HMAC, client Supabase admin, logging webhook |
| `transcriptParser.js` | Parseur de fichiers transcript (VTT, SRT, texte brut) |

---

## Base de Données Supabase

### Tables principales

| Table | Colonnes clés | Rôle |
|-------|---------------|------|
| `webinars` | id, name, slug, vimeo_video_id, video_duration_seconds, systemeio_account_id, **cta_button_id**, **systemeio_viewer_tag_id** | Configuration de chaque webinaire |
| `viewers` | id, email, anonymous_id | Visiteurs (identifiés ou anonymes) |
| `viewing_sessions` | id, webinar_id, viewer_id, duration_seconds, max_video_percent, max_video_seconds, client_ip, started_at, ended_at | Sessions de visionnage |
| `viewing_events` | id, session_id, event_type, video_seconds, video_percent | Événements (play, pause, cta_click, seek, etc.) |
| `systemeio_accounts` | id, name, api_key, webhook_secret | Comptes Systeme.io connectés |
| `tagging_rules` | id, webinar_id, tag_id, min_percent, condition_type | Règles de tagging automatique |
| `tagging_log` | id, session_id, tag_id, status | Historique des tags appliqués |
| `pending_registrations` | id, email, webinar_slug, matched, client_ip, source | Inscriptions en attente de matching |
| `purchases` | id, email, amount, product_name, created_at | Achats captés par le webhook sale |
| `app_settings` | key, value | Paramètres globaux (fallback) |
| `webinar_chapters` | id, webinar_id, title, start_seconds, end_seconds | Chapitres du webinaire |
| `webinar_transcripts` | id, webinar_id, content, format | Transcripts uploadés |
| `webhook_logs` | id, event_type, payload, ip, created_at | Logs de tous les webhooks reçus |

### Migrations SQL (8 fichiers)

1. `phase0_cleanup_legacy_tables.sql` — Nettoyage des tables legacy
2. `phase1_webinarpulse_features.sql` — Tables principales du MVP
3. `add_app_settings.sql` — Table app_settings
4. `systemeio_accounts.sql` — Multi-comptes Systeme.io
5. `fix_rls_delete_policies.sql` — Policies RLS pour la suppression
6. `account_webhook_secret.sql` — Secret webhook par compte
7. `ip_matching.sql` — Colonnes client_ip + RPC de matching
8. `webhooks_migration.sql` — Tables pending_registrations + webhook_logs

---

## Mécanismes d'Identification des Viewers

L'identification est le cœur de WebinarPulse. Plusieurs stratégies se combinent :

### 1. Email en paramètre URL (temps réel)
Le script de tracking cherche `?email=`, `?contact_email=` ou `?e=` dans l'URL de la page. Si présent, le viewer est identifié immédiatement.

### 2. Interception de formulaire (temps réel)
Le script `ScriptGenerator.js` intercepte les soumissions de formulaires sur la page d'inscription. Il capture l'email, le stocke en cookie cross-subdomain (`wp_viewer`), et crée une `pending_registration`.

### 3. Matching par IP (temps réel)
Le webhook optin capture l'IP du visiteur. Le script de tracking détecte l'IP via `/api/ip`. Si les IPs correspondent, la session anonyme est liée à l'email.

### 4. Tag-based matching via Systeme.io (toutes les 10 min)
Le cron `/api/sync-tags` collecte les `systemeio_viewer_tag_id` de chaque webinaire. Il récupère les contacts Systeme.io avec ces tags et les matche aux sessions anonymes.

### 5. Sale-triggered matching (temps réel)
Quand un achat arrive via webhook, le système vérifie si l'acheteur a des sessions anonymes à lier.

### Score de fiabilité
Affiché dans le dashboard, il combine :
- **70%** : ratio de sessions identifiées
- **15%** : présence de données d'achats
- **15%** : qualité des sessions (durée > 30s)

---

## Configuration par Webinaire

Chaque webinaire peut être configuré individuellement via le modal de modification (bouton crayon ✏️ sur la carte du webinaire) :

| Paramètre | Emplacement | Description |
|-----------|-------------|-------------|
| Nom | Champ principal | Nom affiché dans l'interface |
| ID Vimeo | Champ principal | Numéro de la vidéo Vimeo |
| Durée | Champ principal | Durée en minutes |
| Slug | Champ principal | Identifiant URL unique |
| Espace Systeme.io | Sélecteur | Compte Systeme.io associé |
| **ID bouton CTA** | Paramètres avancés | ID HTML du bouton CTA pour tracker les clics (ex: `button-db9df4e2`) |
| **ID tag viewer** | Paramètres avancés | ID du tag Systeme.io « Webi vu » pour le matching (ex: `1554529`) |

---

## Scripts à installer

Deux scripts doivent être installés sur les pages Systeme.io :

### Script de tracking (page du webinaire)
Généré via le bouton "Script" dans le dashboard. À coller sur la page qui contient la vidéo Vimeo. Il :
- Crée un viewer (identifié ou anonyme)
- Ouvre une session de visionnage
- Détecte l'IP via `/api/ip`
- Track les événements vidéo (play, pause, timeupdate, ended)
- Track les clics CTA (si configuré)
- Met à jour la durée et la progression en temps réel

### Script d'interception (page d'inscription)
Généré via le `ScriptGenerator`. À coller sur la page d'opt-in. Il :
- Intercepte les soumissions de formulaires
- Capture l'email et le prénom
- Stocke l'email en cookie cross-subdomain
- Crée une `pending_registration` pour le matching

---

## Cron & Automatisations

| Tâche | Fréquence | Description |
|-------|-----------|-------------|
| `/api/sync-tags` | Toutes les 10 min | Matching par tags Systeme.io + application des règles de tagging automatique |
| Bouton "Sync" | Manuel | Lancement à la demande depuis le dashboard |

---

## Variables d'environnement

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Clé anonyme Supabase (côté client) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Clé admin Supabase (côté serveur) |
| `CRON_SECRET` | ⚠️ | Protège l'endpoint sync-tags |
| `SYSTEMEIO_API_KEY` | ⚠️ | Fallback si pas de clé par compte |

---

## Fonctionnalités du Dashboard

### Onglets disponibles
1. **Rétention** — Courbe de rétention SVG avec chapitres colorés, tooltip dynamique, indicateur de drop maximal
2. **Viewers** — Tableau des viewers (email, durée, progression, date)
3. **Volume** — Graphique du nombre de sessions par jour
4. **Conversion** — Taux de conversion viewers → acheteurs, détail des achats
5. **Transcript** — Upload VTT/SRT, découpage en chapitres, affichage intégré
6. **Tags** — Configuration des règles de tagging (ex: "si progression > 50%, ajouter tag X")

### En-tête du dashboard
- Filtres temporels (7j, 30j, 90j, Tout)
- Bouton "Script" pour copier le code de tracking
- 4 stat cards : Sessions, Durée moy., Complétion, Progression moy.
- Score de fiabilité avec indicateur visuel
- Bouton "Sync" pour lancer la synchronisation manuellement
- Bouton "Générer le diagnostic IA"

---

## Déploiement

```bash
# Build local
npm run build

# Déploiement production
git add -A && git commit -m "description" && git push origin main
vercel --prod --yes
```

Le déploiement est automatique via Vercel sur chaque push vers `main`.
