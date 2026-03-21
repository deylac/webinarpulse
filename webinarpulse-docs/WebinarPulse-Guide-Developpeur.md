# WebinarPulse — Guide Technique pour Développeur Externe

> Document de transfert de connaissances pour l'intégration dans une plateforme de tracking du parcours client complet.
> Dernière mise à jour : 21 mars 2026

---

## 1. Contexte et Objectif de WebinarPulse

WebinarPulse est un outil d'analytics pour **webinaires evergreen** (replay automatisé). Il a été développé comme MVP pour répondre à un besoin précis : comprendre le **comportement de visionnage** des prospects dans un tunnel de vente basé sur des webinaires hébergés sur Vimeo, avec le CRM/tunnel builder **Systeme.io** comme plateforme principale.

### Problème résolu
Dans un tunnel evergreen classique sur Systeme.io, l'entrepreneur n'a **aucune visibilité** sur ce qui se passe entre l'inscription au webinaire et l'achat. Il sait combien de personnes se sont inscrites et combien ont acheté, mais ne sait pas :
- Qui a **réellement regardé** le webinaire
- **Jusqu'où** chaque personne a regardé
- À quel moment les gens **décrochent**
- Si les **acheteurs** ont regardé plus longtemps que les non-acheteurs
- Quel est le **vrai taux de conversion** (viewers → acheteurs vs inscrits → acheteurs)

### Ce que WebinarPulse fait
- **Tracking vidéo en temps réel** : durée de visionnage, progression maximale, événements (play, pause, seek)
- **Identification des viewers** : relier une session de visionnage anonyme à un contact Systeme.io
- **Corrélation ventes/visionnage** : identifier qui a acheté parmi les viewers
- **Analytics visuels** : courbe de rétention, taux de conversion, diagnostic IA

---

## 2. Stack Technique

| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| Frontend | Next.js 14 (App Router) + React 18 | SSR, API Routes intégrées, déploiement Vercel natif |
| Styling | TailwindCSS 3.4 | Rapidité de prototypage, design system custom |
| Base de données | Supabase (PostgreSQL) | API REST auto-générée, RLS, temps réel gratuit |
| Hébergement | Vercel Pro | Cron jobs, edge functions, déploiement git-push |
| Tracking | Vanilla JS injecté sur la page | Aucune dépendance, compatible tous CMS/page builders |
| Vidéo | API Vimeo Player JS | Événements natifs (play, pause, timeupdate, ended) |
| CRM | API Systeme.io REST | Contacts, tags, webhooks |
| IA | Claude API (Anthropic) | Diagnostic du webinaire basé sur les chapitres |

### Dépendances npm (minimes)
```
next ^14.2.0
react ^18.3.0
@supabase/supabase-js ^2.45.0
tailwindcss ^3.4.13
```

---

## 3. Architecture et Flux de Données

### 3.1. Flux d'inscription → visionnage → achat

```
┌─────────────────────┐     ┌──────────────────────┐     ┌────────────────────┐
│  PAGE D'INSCRIPTION │     │  PAGE DU WEBINAIRE   │     │   PAGE DE VENTE    │
│  (Systeme.io)       │     │  (Systeme.io)        │     │   (Systeme.io)     │
│                     │     │                      │     │                    │
│  Script intercept.  │     │  Script tracking     │     │                    │
│  → capture email    │     │  → sessions Vimeo    │     │                    │
│  → cookie           │     │  → CTA clicks        │     │                    │
│  → pending_reg      │     │  → IP detection      │     │                    │
└────────┬────────────┘     └────────┬─────────────┘     └────────┬───────────┘
         │                           │                             │
         │  Webhook optin            │  Supabase REST direct       │  Webhook sale
         ▼                           ▼                             ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Next.js API Routes)                       │
│                                                                           │
│  /api/webhook/optin  → pending_registrations + viewers                    │
│  /api/webhook/sale   → purchases + matching sessions                      │
│  /api/script         → génération dynamique du script tracking            │
│  /api/ip             → détection IP du viewer                             │
│  /api/sync-tags      → CRON (10 min) matching par tags Systeme.io         │
└────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        SUPABASE (PostgreSQL)                              │
│                                                                           │
│  webinars ←──── viewing_sessions ←──── viewing_events                     │
│     │                  │                                                  │
│     │                  └──→ viewers (email ou anonymous_id)                │
│     │                                                                     │
│     ├──── tagging_rules → tagging_log                                     │
│     ├──── webinar_chapters / webinar_transcripts                          │
│     └──── systemeio_accounts                                              │
│                                                                           │
│  pending_registrations (file d'attente pour matching)                     │
│  purchases (achats captés par webhook)                                    │
│  app_settings (config globale en fallback)                                │
└────────────────────────────────────────────────────────────────────────────┘
```

### 3.2. Schéma de la base de données

| Table | Rôle | Colonnes principales |
|-------|------|---------------------|
| `webinars` | Chaque webinaire créé | name, slug, vimeo_video_id, video_duration_seconds, systemeio_account_id, cta_button_id, systemeio_viewer_tag_id |
| `viewers` | Chaque personne (identifiée ou anonyme) | email (nullable), anonymous_id (nullable). Contrainte unique sur email |
| `viewing_sessions` | Une session = une visite de la page webinaire | webinar_id, viewer_id, duration_seconds, max_video_percent, max_video_seconds, client_ip, user_agent, referrer, started_at, ended_at |
| `viewing_events` | Événements granulaires | session_id, event_type (play/pause/seek/cta_click/ended), video_seconds, video_percent |
| `systemeio_accounts` | Comptes Systeme.io connectés | name, api_key, webhook_secret |
| `tagging_rules` | Règles de tagging automatique | webinar_id, tag_id, min_percent, condition_type |
| `tagging_log` | Historique d'exécution des tags | session_id, tag_id, status (success/error/skipped) |
| `pending_registrations` | En attente de matching | email, webinar_slug, client_ip, matched (bool), source |
| `purchases` | Achats webhookés | email, amount, product_name, currency |
| `webinar_chapters` | Chapitres du webinaire | webinar_id, title, chapter_type, start_seconds, end_seconds |
| `webinar_transcripts` | Transcript complet | webinar_id, content, format (vtt/srt/text) |
| `webhook_logs` | Audit trail | event_type, payload (jsonb), ip |
| `app_settings` | Config key/value | key, value (ex: systemeio_viewer_tag_id comme fallback) |

---

## 4. Le Problème Central : l'Identification des Viewers

### 4.1. Pourquoi c'est difficile

Le tracking vidéo est **côté client** (JavaScript sur une page Systeme.io). Le viewer arrive souvent **sans identifiant** : pas de session Systeme.io partagée, pas d'email dans l'URL (Systeme.io ne le supporte pas dans les redirections de tunnel).

Le défi : **relier une session anonyme de visionnage à un contact connu dans Systeme.io**.

### 4.2. Les 5 stratégies implémentées (par ordre de fiabilité)

| # | Stratégie | Timing | Fiabilité | Comment ça marche |
|---|-----------|--------|-----------|-------------------|
| 1 | **Email en URL** | Temps réel | ★★★★★ | Le script cherche `?email=`, `?contact_email=` dans l'URL. Si présent → identification immédiate. **Problème : Systeme.io ne le fait pas automatiquement** |
| 2 | **Interception formulaire** | Temps réel | ★★★★☆ | Un script sur la page d'inscription intercepte le submit du formulaire, capture l'email, le stocke en cookie cross-subdomain, et crée une `pending_registration`. Quand le viewer arrive sur la page du webinaire, le cookie permet l'identification |
| 3 | **Matching par IP** | Temps réel | ★★★☆☆ | Le webhook optin capture l'IP du Systeme.io. Le script de tracking détecte l'IP du viewer via `/api/ip`. Si les IPs correspondent → match. **Limitation : NAT, VPN, IP partagées** |
| 4 | **Tag-based matching (Systeme.io)** | Toutes les 10 min | ★★★★☆ | Le cron récupère les contacts avec un tag spécifique (ex: "📹 Webi vu") via l'API Systeme.io. Il matche ces emails aux sessions anonymes. **C'est la stratégie la plus efficace en pratique** |
| 5 | **Sale-triggered matching** | Temps réel | ★★★★☆ | Quand un achat arrive, le système vérifie si l'acheteur a des sessions anonymes à lier |

### 4.3. Ce qu'on a appris (leçons clés)

> **La stratégie #4 (tag-based) est celle qui fonctionne le mieux.** Elle a permis d'identifier 71/72 sessions là où les autres stratégies combinées n'arrivaient qu'à une poignée. La raison : Systeme.io tag automatiquement les contacts via ses automations. Ce tag est la source de vérité Systeme.io.

> **La détection IP via des services tiers (api.ipify.org) est bloquée par les ad-blockers.** Nous avons dû créer notre propre endpoint `/api/ip` qui lit les headers X-Forwarded-For de la requête.

> **Le cookie cross-subdomain fonctionne mais pas toujours.** Les pages Systeme.io peuvent être sur des domaines différents (monsite.systeme.io vs monsite.com), rendant le cookie inefficace dans certains cas.

> **Les webhooks Systeme.io sont fiables mais la documentation est incomplète.** Format du payload non documenté, noms des headers de signature variables. On utilise un "soft check" de la signature HMAC (on log l'erreur mais on traite quand même).

---

## 5. Le Diagnostic IA — État Actuel et Limites

### 5.1. Comment ça marche
Le diagnostic utilise l'API Claude (Anthropic). Le frontend enrichit les chapitres du webinaire avec les données de rétention par section, puis envoie au backend qui génère un diagnostic en 3-5 points.

### 5.2. Données envoyées au prompt
```
1. [hook] "Accroche principale" (0s-120s) — Rétention: 100% → 85% (drop: -15%)
2. [démonstration] "Démo produit" (120s-600s) — Rétention: 85% → 45% (drop: -40%)
3. [offre] "Présentation de l'offre" (600s-900s) — Rétention: 45% → 30% (drop: -15%)
```

### 5.3. Problème identifié : "0% de rétention"
Le diagnostic affiche "0.0% de rétention" parce que `retentionData` (les données de rétention calculées à partir des sessions) est vide ou mal calculé quand les chapitres sont créés mais qu'il n'y a pas assez de sessions avec des événements `timeupdate`. Le prompt reçoit alors `drop: NaN` ou `0%` pour toutes les sections.

### 5.4. Améliorations possibles

| Amélioration | Impact | Effort |
|--------------|--------|--------|
| Inclure les **stats globales** dans le prompt (nombre de viewers, durée moyenne, taux de complétion, taux de conversion) | Fort — donne du contexte quantitatif | Faible |
| Inclure le **nombre de viewers par chapitre** (pas juste le %) | Moyen — permet des recommandations plus précises | Faible |
| Inclure les **données de conversion par segment** (drop → acheteur vs non-acheteur) | Fort — insight business critique | Moyen |
| Inclure les **événements CTA** (quand les clics CTA arrivent par rapport aux chapitres) | Fort — timing du pitch | Faible |
| **Résumer automatiquement le transcript** par chapitre et l'inclure | Fort — l'IA peut critiquer le contenu | Moyen |
| **Multi-prompts** : d'abord analyser les données, puis analyser le contenu, puis synthétiser | Très fort — diagnostic plus riche | Élevé |

---

## 6. Intégration dans une Plateforme de Tracking Client Complet

### 6.1. Vision : du lead à l'achat

WebinarPulse couvre un **seul touchpoint** du parcours client : le webinaire. La vision élargie serait de couvrir **tout le parcours** :

```
[Publicité/Contenu] → [Landing page] → [Opt-in] → [Séquence email] → [Webinaire] → [Page de vente] → [Achat] → [Onboarding]
                                                                          ↑
                                                              WebinarPulse couvre ça
```

### 6.2. Ce que WebinarPulse apporte à la plateforme

| Réutilisable tel quel | À adapter | À remplacer |
|----------------------|-----------|-------------|
| Tracking JS injecté sur les pages | Le schéma DB (étendre pour multi-touchpoint) | L'interface monolithique (séparer en modules) |
| Interception de formulaires | Le matching par tags (généraliser) | Le calcul de rétention (abstraire) |
| Webhooks Systeme.io | Le cron de synchronisation (multi-plateforme) | Le scoring de fiabilité (enrichir) |
| Endpoint `/api/ip` | Le diagnostic IA (données plus riches) | — |
| Logique de matching multi-stratégie | Le modèle viewer/session (ajouter un concept de "parcours") | — |

### 6.3. Concepts à ajouter pour le tracking complet

#### A. Le concept de "Parcours Client" (Customer Journey)
WebinarPulse a des `viewing_sessions` isolées. Il faut un concept supérieur :

```
Contact (email)
  └── Journey (parcours d'un contact à travers les touchpoints)
        ├── Touchpoint: Page vue (landing page X) — timestamp, durée, source
        ├── Touchpoint: Opt-in (webinaire Y) — timestamp, source
        ├── Touchpoint: Email ouvert (séquence Z, email #3) — timestamp
        ├── Touchpoint: Webinaire regardé (webinaire Y) — durée, progression, CTA
        ├── Touchpoint: Page de vente visitée — timestamp, durée, scroll
        ├── Touchpoint: Achat (produit A) — montant, timestamp
        └── Touchpoint: Upsell refusé — timestamp
```

#### B. Attribution et Sources
WebinarPulse ne track pas **d'où vient** le prospect. Pour le tracking complet :
- UTM parameters sur chaque page (utm_source, utm_medium, utm_campaign)
- Referrer de la première visite
- Historique des pages vues avant l'opt-in
- Attribution multi-touch (premier contact, dernier contact, linéaire)

#### C. Taux de conversion par étape (funnel analytics)
```
Inscrits: 1000  ──→  Viewers: 350 (35%)  ──→  >50% regardé: 120 (34%)  ──→  CTA cliqué: 80 (67%)  ──→  Acheteurs: 15 (19%)
```
WebinarPulse a les données pour le segment [Viewers → Acheteurs] mais pas pour [Inscrits → Viewers] ni la segmentation par source.

#### D. Comparaison multi-tunnel
Si l'utilisateur a plusieurs tunnels de vente (chacun avec un webinaire différent), il faut pouvoir comparer :
- Taux d'opt-in par tunnel
- Taux de visionnage par webinaire
- Taux de conversion par offre
- Coût d'acquisition par tunnel (si données pub intégrées)

### 6.4. Données disponibles dans Systeme.io (via API et Webhooks)

| Donnée | Accessible via | Utilisé dans WebinarPulse |
|--------|---------------|--------------------------|
| Liste de contacts | API REST (GET /contacts) | ✅ Pour le tag-based matching |
| Tags d'un contact | API REST (GET /contacts/{id}/tags) | ✅ Pour le tagging automatique |
| Appliquer un tag | API REST (POST /contacts/{id}/tags) | ✅ Via les tagging rules |
| Webhook opt-in | Webhook POST | ✅ Pour les inscriptions |
| Webhook achat | Webhook POST | ✅ Pour les ventes |
| Webhook abandon de panier | Webhook POST | ❌ Pas implémenté |
| Emails envoyés/ouverts/cliqués | ❌ Pas disponible via API | — |
| Pages vues du tunnel | ❌ Pas disponible via API | — |
| Données de paiement détaillées | Partiel (webhook sale) | ✅ Montant + produit |

> **Limitation majeure** : Systeme.io ne fournit PAS de tracking de pages vues ni de données email via son API. Le tracking des pages doit être fait par un script JS injecté sur chaque page, comme on le fait déjà pour le webinaire.

### 6.5. Architecture suggérée pour la plateforme complète

```
┌────────────────────────────────────────────────────────────────┐
│                    TRACKING LAYER (JS)                         │
│  Script universel injecté sur TOUTES les pages du tunnel       │
│  → Détecte le type de page (opt-in, webinaire, vente, etc.)   │
│  → Capture l'email (URL params, cookies, formulaire)          │
│  → Track les pageviews, scroll depth, temps passé             │
│  → Track les événements spécifiques (vidéo, CTA, achat)       │
│  → Détecte l'IP, le device, le referrer, les UTMs             │
└──────────────────────────┬─────────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────────┐
│                    INGESTION LAYER (API)                        │
│  POST /api/events      → Reçoit les événements du script      │
│  POST /api/webhook/*   → Reçoit les webhooks Systeme.io       │
│  GET  /api/sync        → CRON de synchronisation multi-source  │
└──────────────────────────┬─────────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────────┐
│                    PROCESSING LAYER                             │
│  Identity Resolution    → Unifie un visiteur à travers         │
│                           les pages, sessions, devices          │
│  Journey Assembler      → Reconstitue le parcours complet      │
│  Funnel Calculator      → Calcule les taux de conversion       │
│  Attribution Engine     → Attribue les conversions aux sources  │
│  Alert System           → Notifie les anomalies                │
└──────────────────────────┬─────────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────────┐
│                    STORAGE LAYER                                │
│  contacts               → Liste unifiée des contacts           │
│  touchpoints             → Tous les points de contact          │
│  journeys               → Parcours reconstitués                │
│  funnels                → Définitions des tunnels              │
│  funnel_steps           → Étapes de chaque tunnel              │
│  conversions            → Événements de conversion             │
│  sessions               → Sessions de navigation               │
└──────────────────────────┬─────────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────────┐
│                    ANALYTICS LAYER (Frontend)                   │
│  Dashboard global       → Vue d'ensemble multi-tunnel          │
│  Funnel View            → Visualisation des étapes du tunnel   │
│  Journey View           → Parcours individuel d'un contact     │
│  Webinar Analytics      → Vue détaillée (= WebinarPulse actuel)│
│  Conversion Analysis    → Segments, cohortes, tendances        │
│  AI Diagnostic          → Recommandations IA multi-données     │
└────────────────────────────────────────────────────────────────┘
```

### 6.6. Pièges à éviter (leçons de WebinarPulse)

| Piège | Ce qu'on a vécu | Solution |
|-------|-----------------|----------|
| **Identification anonyme** | 90% des sessions étaient anonymes au début | Implémenter PLUSIEURS stratégies de matching dès le départ (cookie, IP, tag, email URL) |
| **Dépendance aux services tiers pour l'IP** | api.ipify.org bloqué par ad-blockers | Toujours utiliser son propre endpoint |
| **Cookies cross-domain** | Ne marchent pas entre systeme.io ↔ domaine custom | Privilégier le tag-based matching ou le cookie first-party |
| **Rate limiting API** | L'API Systeme.io limite à ~100 req/min | Implémenter retry avec backoff exponential + pagination |
| **Webhook idempotency** | Systeme.io peut envoyer le même webhook plusieurs fois | Utiliser des upserts avec ON CONFLICT |
| **Config globale vs per-resource** | Le viewer tag ID était global, cassait le multi-webinaire | Rendre TOUT configurable par entité dès le départ |
| **Données manquantes pour l'IA** | Le diagnostic IA reçoit 0% de rétention si pas assez de sessions | Toujours vérifier la qualité des données AVANT de les envoyer au LLM |

---

## 7. Métriques et KPIs Calculables

### Déjà calculés dans WebinarPulse
- Nombre de sessions (total, identifiées, anonymes)
- Durée moyenne de visionnage
- Progression moyenne (% de la vidéo vue)
- Taux de complétion (>80% de la vidéo)
- Courbe de rétention (% de viewers encore présents à chaque % de la vidéo)
- Points de drop (plus grande perte de viewers entre 2 moments)
- Score de fiabilité des données (70% identification + 15% achats + 15% qualité sessions)

### Calculables avec les données existantes (non encore implémentés)
- **Taux de conversion viewers → acheteurs** par seuil de visionnage (>25%, >50%, >75%)
- **Temps moyen avant CTA click** (on a les événements cta_click avec video_seconds)
- **Corrélation durée/achat** (les acheteurs ont-ils regardé plus longtemps ?)
- **Heures de pointe** (quand les viewers regardent le plus)
- **Drop par chapitre** (quel chapitre perd le plus de viewers)

### Nécessiteraient des données supplémentaires
- Taux d'opt-in (nécessite le nombre de visiteurs de la landing page)
- Coût par lead/achat (nécessite les données publicitaires)
- Lifetime value par source (nécessite le suivi des achats récurrents)
- Taux de panier abandonné (nécessite le webhook correspondant)

---

## 8. Résumé : Décision Build vs Integrate

| Aspect | Réutiliser WebinarPulse | Reconstruire |
|--------|------------------------|--------------|
| **Tracking vidéo Vimeo** | ✅ Le script est mature et testé | ❌ Inutile de refaire |
| **Identification multi-stratégie** | ✅ La logique est réutilisable | ⚠️ Adapter pour multi-touchpoint |
| **Intégration Systeme.io** | ✅ Webhooks + API fonctionnels | ⚠️ Ajouter d'autres plateformes |
| **Interface d'analytics** | ⚠️ Monolithique, un seul écran | ✅ Repenser pour le multi-tunnel |
| **Base de données** | ⚠️ Schéma trop centré webinaire | ✅ Nouveau schéma pour le parcours complet |
| **Diagnostic IA** | ⚠️ Données trop limitées | ✅ Enrichir avec le contexte du tunnel |

**Recommandation** : réutiliser le **script de tracking**, la **logique de matching**, et l'**intégration Systeme.io** comme modules dans un nouveau projet. Repenser le schéma de données et l'interface pour supporter le tracking multi-touchpoint.
