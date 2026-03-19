# WebinarPulse — Rapport d'état MVP

**Date** : 19 mars 2026
**Commit** : `6e06c57` (branche `main`)
**URL prod** : https://project-to7fk.vercel.app

---

## 1. Schéma de la base de données

Projet Supabase : `nrdiphkwejcghgeemjjb` (région eu-west-3, projet nommé "Flow")

### Tables en production

#### `webinars`
| Colonne | Type | Nullable | Default | Contraintes |
|---------|------|----------|---------|-------------|
| `id` | UUID | Non | `gen_random_uuid()` | PK |
| `name` | TEXT | Non | — | — |
| `slug` | TEXT | Non | — | UNIQUE |
| `vimeo_video_id` | TEXT | Non | — | — |
| `video_duration_seconds` | INTEGER | Oui | `0` | — |
| `systemeio_url` | TEXT | Oui | — | — |
| `systemeio_account_id` | UUID | Oui | — | FK → `systemeio_accounts(id)` ON DELETE SET NULL |
| `created_at` | TIMESTAMPTZ | Oui | `now()` | — |

RLS : activé, policy open (anon all).

---

#### `viewers`
| Colonne | Type | Nullable | Default | Contraintes |
|---------|------|----------|---------|-------------|
| `id` | UUID | Non | `gen_random_uuid()` | PK |
| `email` | TEXT | Oui | — | UNIQUE (pour upsert merge-duplicates) |
| `anonymous_id` | TEXT | Oui | — | — |
| `created_at` | TIMESTAMPTZ | Oui | `now()` | — |

RLS : activé, policy open.

---

#### `viewing_sessions`
| Colonne | Type | Nullable | Default | Contraintes |
|---------|------|----------|---------|-------------|
| `id` | UUID | Non | `gen_random_uuid()` | PK |
| `webinar_id` | UUID | Non | — | FK → `webinars(id)` |
| `viewer_id` | UUID | Non | — | FK → `viewers(id)` |
| `started_at` | TIMESTAMPTZ | Oui | `now()` | — |
| `ended_at` | TIMESTAMPTZ | Oui | — | — |
| `duration_seconds` | INTEGER | Oui | `0` | — |
| `max_video_percent` | INTEGER | Oui | `0` | — |
| `max_video_seconds` | INTEGER | Oui | `0` | — |
| `user_agent` | TEXT | Oui | — | — |
| `referrer` | TEXT | Oui | — | — |
| `tagged_at` | TIMESTAMPTZ | Oui | — | Ajouté en Phase 1 |

RLS : activé, policy open.

---

#### `viewing_events`
| Colonne | Type | Nullable | Default | Contraintes |
|---------|------|----------|---------|-------------|
| `id` | UUID | Non | `gen_random_uuid()` | PK |
| `session_id` | UUID | Non | — | FK → `viewing_sessions(id)` |
| `event_type` | TEXT | Non | — | — |
| `video_seconds` | REAL | Oui | `0` | — |
| `video_percent` | REAL | Oui | `0` | — |
| `created_at` | TIMESTAMPTZ | Oui | `now()` | — |

RLS : activé, policy open.

---

#### `pending_registrations`
| Colonne | Type | Nullable | Default | Contraintes |
|---------|------|----------|---------|-------------|
| `id` | UUID | Non | `gen_random_uuid()` | PK |
| `email` | TEXT | Non | — | — |
| `webinar_slug` | TEXT | Non | — | — |
| `first_name` | TEXT | Oui | — | — |
| `source` | TEXT | Oui | — | — |
| `matched` | BOOLEAN | Oui | `false` | — |
| `matched_session_id` | UUID | Oui | — | — |
| `created_at` | TIMESTAMPTZ | Oui | `now()` | — |

RLS : activé, policy open.

---

#### `purchases`
| Colonne | Type | Nullable | Default | Contraintes |
|---------|------|----------|---------|-------------|
| `id` | UUID | Non | `gen_random_uuid()` | PK |
| `viewer_id` | UUID | Oui | — | FK → `viewers(id)` |
| `email` | TEXT | Oui | — | — |
| `product_name` | TEXT | Oui | — | — |
| `product_price` | NUMERIC | Oui | — | — |
| `created_at` | TIMESTAMPTZ | Oui | `now()` | — |

RLS : activé, policy open. **Table vide, pas encore utilisée.**

---

#### `webinar_transcripts`
| Colonne | Type | Nullable | Default | Contraintes |
|---------|------|----------|---------|-------------|
| `id` | UUID | Non | `gen_random_uuid()` | PK |
| `webinar_id` | UUID | Non | — | FK → `webinars(id)` ON DELETE CASCADE, UNIQUE |
| `raw_text` | TEXT | Non | — | — |
| `source_format` | TEXT | Non | — | `srt`, `vtt`, `youtube_text`, `plain` |
| `language` | TEXT | Oui | `fr` | — |
| `processed_at` | TIMESTAMPTZ | Oui | — | — |
| `created_at` | TIMESTAMPTZ | Oui | `now()` | — |
| `updated_at` | TIMESTAMPTZ | Oui | `now()` | — |

Contrainte UNIQUE sur `webinar_id` (un seul transcript par webinaire). RLS activé, policy open.

---

#### `webinar_chapters`
| Colonne | Type | Nullable | Default | Contraintes |
|---------|------|----------|---------|-------------|
| `id` | UUID | Non | `gen_random_uuid()` | PK |
| `webinar_id` | UUID | Non | — | FK → `webinars(id)` ON DELETE CASCADE |
| `sort_order` | INTEGER | Non | — | — |
| `title` | TEXT | Non | — | — |
| `chapter_type` | TEXT | Non | — | — |
| `start_seconds` | INTEGER | Non | — | — |
| `end_seconds` | INTEGER | Non | — | — |
| `summary` | TEXT | Oui | — | — |
| `transcript_excerpt` | TEXT | Oui | — | — |
| `is_ai_generated` | BOOLEAN | Oui | `true` | — |
| `created_at` | TIMESTAMPTZ | Oui | `now()` | — |
| `updated_at` | TIMESTAMPTZ | Oui | `now()` | — |

Index : `idx_chapters_webinar(webinar_id, sort_order)`. RLS activé, policy open.

---

#### `tagging_rules`
| Colonne | Type | Nullable | Default | Contraintes |
|---------|------|----------|---------|-------------|
| `id` | UUID | Non | `gen_random_uuid()` | PK |
| `webinar_id` | UUID | Non | — | FK → `webinars(id)` ON DELETE CASCADE |
| `segment` | TEXT | Non | — | — |
| `min_percent` | INTEGER | Non | — | — |
| `max_percent` | INTEGER | Non | — | — |
| `systemeio_tag_name` | TEXT | Non | — | — |
| `systemeio_tag_id` | TEXT | Oui | — | — |
| `enabled` | BOOLEAN | Oui | `true` | — |
| `created_at` | TIMESTAMPTZ | Oui | `now()` | — |

RLS activé, policy open.

---

#### `tagging_log`
| Colonne | Type | Nullable | Default | Contraintes |
|---------|------|----------|---------|-------------|
| `id` | UUID | Non | `gen_random_uuid()` | PK |
| `viewer_email` | TEXT | Non | — | — |
| `webinar_id` | UUID | Non | — | FK → `webinars(id)` |
| `segment` | TEXT | Non | — | — |
| `systemeio_tag_name` | TEXT | Non | — | — |
| `systemeio_contact_id` | TEXT | Oui | — | — |
| `status` | TEXT | Non | — | — |
| `error_message` | TEXT | Oui | — | — |
| `processed_at` | TIMESTAMPTZ | Oui | `now()` | — |

RLS activé, policy open.

---

#### `app_settings`
| Colonne | Type | Nullable | Default | Contraintes |
|---------|------|----------|---------|-------------|
| `id` | UUID | Non | `gen_random_uuid()` | PK |
| `key` | TEXT | Non | — | UNIQUE |
| `value` | TEXT | Non | — | — |
| `updated_at` | TIMESTAMPTZ | Oui | `now()` | — |

RLS activé, policy open. Contient `systemeio_api_key` (vide ou migrée selon config).

---

#### `systemeio_accounts`
| Colonne | Type | Nullable | Default | Contraintes |
|---------|------|----------|---------|-------------|
| `id` | UUID | Non | `gen_random_uuid()` | PK |
| `name` | TEXT | Non | — | — |
| `api_key` | TEXT | Non | — | — |
| `created_at` | TIMESTAMPTZ | Oui | `now()` | — |
| `updated_at` | TIMESTAMPTZ | Oui | `now()` | — |

RLS activé, policy open.

---

### RPC

```sql
CREATE OR REPLACE FUNCTION get_untagged_sessions()
RETURNS TABLE (
  viewer_email TEXT,
  webinar_id UUID,
  best_percent REAL,
  session_ids UUID[]
) AS $$
  SELECT
    v.email AS viewer_email, s.webinar_id,
    MAX(s.max_video_percent) AS best_percent,
    ARRAY_AGG(s.id) AS session_ids
  FROM viewing_sessions s
  JOIN viewers v ON v.id = s.viewer_id
  WHERE s.tagged_at IS NULL
    AND v.email IS NOT NULL
    AND s.max_video_percent > 0
    AND s.started_at < NOW() - INTERVAL '1 hour'
  GROUP BY v.email, s.webinar_id
$$ LANGUAGE SQL;
```

### Tables supprimées (Phase 0)

- `credit_history` — hérité de l'ancien projet "Flow"
- `user_audiences` — idem
- `user_credits` — idem
- `user_profiles` — idem

---

## 2. Structure du projet

```
webinarpulse/
├── app/
│   ├── layout.js                     — Layout racine, metadata, import Google Fonts (Inter + Outfit)
│   ├── page.js                       — Point d'entrée : routing WebinarList ↔ Dashboard, state Settings global
│   ├── globals.css                   — Tailwind base + custom design tokens (couleurs pulse-*)
│   └── api/
│       ├── analyze-transcript/
│       │   └── route.js              — POST : parse transcript → appel Claude Sonnet → chapitres
│       ├── generate-diagnostic/
│       │   └── route.js              — POST : envoie rétention + chapitres à Claude → diagnostic 3-5 points
│       ├── script/
│       │   └── route.js              — GET : génère le script tracking (ANCIEN, sans cookie — encore en ligne)
│       └── sync-tags/
│           └── route.js              — GET (cron) : auto-tagging Systeme.io, résolution multi-comptes
├── components/
│   ├── AddWebinarModal.js            — Modal ajout webinaire + sélecteur de compte Systeme.io
│   ├── DailyChart.js                 — Graphique volume journalier (SVG)
│   ├── Dashboard.js                  — Vue analytics principale, onglets : Rétention/Viewers/Volume/Transcript/Tags
│   ├── DiagnosticPanel.js            — Widget diagnostic IA (3-5 insights sous la courbe de rétention)
│   ├── RetentionChart.js             — Courbe de rétention SVG + overlay chapitres (bandes colorées)
│   ├── ScriptGenerator.js            — Wizard 2 étapes : script optin (cookie) + script tracking + statut
│   ├── SettingsModal.js              — Modal de gestion multi-comptes Systeme.io
│   ├── StatCard.js                   — Carte de statistique (Sessions, Durée moy., Complétion, Drop max)
│   ├── TaggingTab.js                 — Onglet Tags : dropdown compte SIO, règles, sync manuelle, logs
│   ├── TranscriptTab.js              — Onglet Transcript : textarea/upload, analyse Claude, chapitres éditables
│   ├── ViewerTable.js                — Table des sessions (triable, colonne tag SIO, email/anonyme)
│   └── WebinarList.js                — Page d'accueil : liste webinaires + bouton Paramètres
├── lib/
│   ├── supabase.js                   — Client Supabase (createClient avec NEXT_PUBLIC_*)
│   ├── transcriptParser.js           — Parser SRT/VTT/YouTube text/plain → segments timestampés
│   └── utils.js                      — Helpers : formatDuration, generateDemoSessions, DEMO_WEBINARS
├── supabase/
│   └── migrations/
│       ├── 20260319071824_phase0_cleanup_legacy_tables.sql   — DROP 4 tables héritées
│       ├── 20260319071857_phase1_webinarpulse_features.sql   — transcripts, chapters, tagging_rules, tagging_log, RPC
│       ├── 20260319094129_add_app_settings.sql               — app_settings + clé SIO
│       └── 20260319095156_systemeio_accounts.sql              — systemeio_accounts + FK sur webinars
├── vercel.json                       — Config cron : /api/sync-tags tous les jours à minuit
├── package.json
├── tailwind.config.js
├── postcss.config.js
├── jsconfig.json
└── next.config.js
```

### Dépendances

```json
{
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@supabase/supabase-js": "^2.45.0"
  },
  "devDependencies": {
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13"
  }
}
```

> **Note** : Anthropic SDK n'est pas installé. Les appels à Claude dans `/api/analyze-transcript` et `/api/generate-diagnostic` utilisent `fetch()` directement vers l'API REST Anthropic.

---

## 3. Scripts de tracking en production

### 3.1 Script Optin (page d'inscription)

```html
<!-- WebinarPulse — Identification (page optin) -->
<script>
(function() {
  var SB_URL = "https://nrdiphkwejcghgeemjjb.supabase.co";
  var SB_KEY = "[ANON_KEY]";
  var WEBINAR_SLUG = "[slug-du-webinaire]";

  document.addEventListener("submit", function(e) {
    var form = e.target;
    var emailInput = form.querySelector('input[type="email"]')
      || form.querySelector('input[name*="email"]');
    if (!emailInput || !emailInput.value) return;

    var email = emailInput.value.trim().toLowerCase();
    if (!email || email.indexOf("@") === -1) return;

    var firstNameInput = form.querySelector(
      'input[name*="first_name"], input[name*="prenom"], input[name*="fname"]'
    );
    var firstName = firstNameInput ? firstNameInput.value.trim() : null;

    var data = JSON.stringify({
      email: email, firstName: firstName,
      slug: WEBINAR_SLUG, ts: Date.now()
    });
    document.cookie = "wp_viewer=" + encodeURIComponent(data)
      + "; path=/; max-age=86400; SameSite=Lax";

    fetch(SB_URL + "/rest/v1/pending_registrations", {
      method: "POST",
      headers: {
        "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY,
        "Content-Type": "application/json", "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        email: email, webinar_slug: WEBINAR_SLUG,
        first_name: firstName, source: "form_intercept"
      }),
      keepalive: true
    }).catch(function() {});
  }, true);
})();
</script>
```

- **Installé sur** : pas encore installé sur Systeme.io (créé lors de cette session, pas encore testé en production)
- **Modifications vs spec** : code conforme à la spec `WebinarPulse-Dev-Spec-Identification.md`

### 3.2 Script Tracking (page webinaire)

```html
<!-- WebinarPulse — Tracking (page webinaire) -->
<script src="https://player.vimeo.com/api/player.js"></script>
<script>
(function() {
  var SB_URL = "https://nrdiphkwejcghgeemjjb.supabase.co";
  var SB_KEY = "[ANON_KEY]";
  var WEBINAR_ID = "[UUID-du-webinaire]";

  var sessionId = null; var lastUpdate = 0; var maxSec = 0; var maxPct = 0;

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    if (match) { try { return JSON.parse(decodeURIComponent(match[2])); } catch(e) { return null; } }
    return null;
  }

  function getViewerEmail() {
    var cookie = getCookie("wp_viewer");
    if (cookie && cookie.email) return cookie.email;
    var params = new URLSearchParams(window.location.search);
    return params.get("email") || params.get("contact_email") || params.get("e") || null;
  }

  // ... (sb, initSession, sendEvent, updateSession, initPlayer, setupPlayer)
  // Identique à la spec, avec retry iframe après 2s, beforeunload avec keepalive,
  // sendBeacon pour page_leave, visibilitychange
})();
</script>
```

- **Installé sur** : les pages webinaire Systeme.io utilisent **l'ancienne version** (sans cookie, script copié depuis l'ancien `TrackingScriptModal`). La nouvelle version avec cookie est disponible dans le `ScriptGenerator` mais n'a pas encore été installée sur Systeme.io.
- **Modifications vs spec** : code conforme. Le nouveau script ajoute `getCookie("wp_viewer")` + `getViewerEmail()` avec priorité cookie > URL param.

### 3.3 API Route `/api/script` (ancienne)

**Encore en ligne mais plus utilisée par le frontend.** Génère l'ancienne version du script (sans cookie, sans identification optin). Pourrait être supprimée ou mise à jour dans une future itération.

---

## 4. Variables d'environnement

| Variable | Où | Public | Utilisée par |
|----------|-----|--------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + `.env.local` | ✅ Public | Client Supabase (`lib/supabase.js`), scripts générés |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + `.env.local` | ✅ Public | Client Supabase, scripts générés |
| `ANTHROPIC_API_KEY` | Vercel + `.env.local` | ❌ Privée | `/api/analyze-transcript`, `/api/generate-diagnostic` |
| `CRON_SECRET` | Vercel | ❌ Privée | `/api/sync-tags` (protection cron) |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel | ❌ Privée | `/api/sync-tags` (écriture tagged_at) |

> **Note** : `SYSTEMEIO_API_KEY` n'est plus en variable d'environnement. Les clés API Systeme.io sont maintenant stockées dans la table `systemeio_accounts` en base.

---

## 5. URLs et domaines

| Élément | URL |
|---------|-----|
| Dashboard en production | https://project-to7fk.vercel.app |
| Vercel inspect | https://vercel.com/brices-projects-6f753c5c/webinarpulse |
| Repo GitHub | https://github.com/deylac/webinarpulse |
| Projet Supabase | https://supabase.com/dashboard/project/nrdiphkwejcghgeemjjb |
| Domaine Systeme.io | (à confirmer par l'utilisateur — pas visible dans le code) |
| Page optin testée | 🔶 Non installé — script optin pas encore en place |
| Page webinaire testée | Oui, ancien script tracking installé (sans identification cookie) |

---

## 6. Rapport de test fonctionnel

| Fonctionnalité | Statut | Commentaire |
|---|---|---|
| Ajout d'un webinaire dans le dashboard | ✅ | Avec sélecteur Systeme.io intégré |
| Suppression d'un webinaire (avec cascade) | ✅ | Confirmation en 2 clics |
| Script optin : email capté au submit | 🔶 Non testé | Script créé mais pas encore installé sur Systeme.io |
| Cookie wp_viewer posé après inscription | 🔶 Non testé | Idem — nécessite test sur pages Systeme.io |
| Cookie wp_viewer lu par le script tracking | 🔶 Non testé | Idem |
| Session identifiée (email dans le dashboard) | 🔶 Non testé | Dépend de l'installation des 2 scripts |
| Session anonyme (fallback sans cookie) | ✅ | Fonctionne en prod (18+ sessions existantes) |
| Événements Vimeo captés (play, pause, timeupdate) | ✅ | 153+ événements enregistrés |
| Durée de visionnage mise à jour en temps réel | ✅ | Throttle 10s |
| Pourcentage de vidéo vu correct | ✅ | `max_video_percent` correctement rempli |
| Événement page_leave envoyé à la fermeture | ✅ | Via sendBeacon |
| Courbe de rétention affichée | ✅ | SVG avec 50 buckets + overlay chapitres |
| Overlay chapitres sur courbe rétention | ✅ | Bandes colorées par type de chapitre |
| Diagnostic IA (insights Claude) | ✅ | 3-5 points actionnables sous la courbe |
| Analyse de transcript (Claude Sonnet) | ✅ | 4 formats supportés : SRT, VTT, YouTube text, plain |
| ViewerTable triable | ✅ | Tri par colonne |
| Colonne tag SIO dans ViewerTable | ✅ | Badge coloré par segment |
| Volume journalier affiché | ✅ | Graphique SVG |
| Filtres par période (7j/30j/90j/tout) | ✅ | 4 options dans le header |
| Bouton "Copier" script optin | ✅ | Feedback "Copié ✓" pendant 2.5s |
| Bouton "Copier" script tracking | ✅ | Idem |
| Instructions d'installation (ScriptGenerator) | ✅ | 7 étapes en français, dépliables |
| Indicateur de statut (sessions identifiées) | ✅ | 🔴/🟡/🟢 dynamique |
| Auto-tagging cron Systeme.io | ✅ | Cron Vercel tous les jours à minuit (`0 0 * * *`) |
| Résolution multi-comptes SIO dans sync-tags | ✅ | Par webinar → systemeio_account_id → api_key |
| Gestion multi-comptes Systeme.io (Settings) | ✅ | Ajouter/renommer/supprimer depuis page principale |
| Sélection compte SIO à la création webinaire | ✅ | Dropdown + création inline |
| Sélection compte SIO dans onglet Tags | ✅ | Dropdown avec status |
| Sync manuelle depuis onglet Tags | ✅ | Bouton "Synchroniser maintenant" |
| Logs de tagging dans onglet Tags | ✅ | Affichage des derniers logs |
| Mode démo (données simulées) | ✅ | Activé automatiquement si Supabase indisponible |
| Pending_registrations reçoit les inscriptions | 🔶 Non testé | Table vide — script optin pas encore en place |
| Responsive mobile du dashboard | ✅ | Grid responsive 2→4 colonnes |

### Navigateurs testés

| Navigateur | Version | Résultat |
|---|---|---|
| Chrome desktop (macOS) | Via Vercel preview | ✅ OK — testé via browser agent |
| Safari mobile | — | 🔶 Non testé |
| Firefox | — | 🔶 Non testé |

---

## 7. Limites et bugs connus

```
- [FRAGILE] L'API route /api/script (GET) génère encore l'ancien script de tracking sans cookie.
  Elle n'est plus utilisée dans le frontend (remplacée par ScriptGenerator), mais reste accessible.
  → Risque : un utilisateur qui utilise l'API directement aura un script sans identification.
  → Action : mettre à jour ou supprimer.

- [LIMITE] Cookie wp_viewer expire après 24h. Les viewers qui reviennent après 24h
  seront anonymes sauf s'ils repassent par la page optin.

- [LIMITE] Le cookie ne fonctionne pas cross-device. Un viewer inscrit sur mobile
  qui regarde sur desktop sera anonyme sur desktop.

- [LIMITE] Les RLS policies sont toutes ouvertes (anon all FOR ALL USING(true)).
  Pas d'authentification sur le dashboard. Tout utilisateur avec l'URL peut voir
  et modifier les données. Acceptable pour un usage interne, à verrouiller avant
  distribution.

- [LIMITE] Vercel Hobby a un timeout de 10s sur les API routes. Le cron sync-tags
  pourrait timeout si beaucoup de sessions à traiter en une fois.
  Le cron tourne tous les jours à minuit (pas toutes les heures comme prévu initialement).

- [LIMITE] Pas de pagination côté API Supabase. Le dashboard charge toutes les sessions
  d'un webinaire. Acceptable jusqu'à ~5000 sessions, potentiellement lent au-delà.

- [FRAGILE] Le retry iframe Vimeo dans le nouveau script tracking attend 2s puis
  tente une seule fois. Sur des pages très lentes cela pourrait ne pas suffire.

- [LIMITE] La table `purchases` existe mais n'est utilisée par aucun code.
  Prévue pour un futur webhook d'attribution achat ↔ visionnage.

- [LIMITE] Pas de matching automatique entre pending_registrations et
  viewing_sessions anonymes. Le cookie est le seul mécanisme de liaison.

- [FRAGILE] Les clés API Systeme.io sont stockées en clair dans systemeio_accounts.
  Elles sont masquées dans l'UI mais lisibles via l'API Supabase anon
  (RLS open). À verrouiller si l'app est distribuée.
```

---

## 8. Données actuelles en base

> **Note** : les requêtes ci-dessous doivent être exécutées directement dans le SQL Editor de Supabase. Les résultats ne sont pas disponibles depuis le frontend.

### Requêtes à exécuter

```sql
-- Sessions et taux d'identification
SELECT 
  COUNT(*) as total_sessions,
  COUNT(CASE WHEN v.email IS NOT NULL THEN 1 END) as identified,
  COUNT(CASE WHEN v.email IS NULL THEN 1 END) as anonymous
FROM viewing_sessions s
JOIN viewers v ON v.id = s.viewer_id;

-- Événements par type
SELECT event_type, COUNT(*) 
FROM viewing_events 
GROUP BY event_type 
ORDER BY COUNT(*) DESC;

-- Webinaires configurés
SELECT id, name, slug, video_duration_seconds, systemeio_account_id
FROM webinars
ORDER BY created_at DESC;

-- Inscriptions pendantes
SELECT COUNT(*) as total, 
  COUNT(CASE WHEN matched THEN 1 END) as matched 
FROM pending_registrations;

-- Comptes Systeme.io
SELECT id, name, created_at FROM systemeio_accounts;

-- Chapitres analysés
SELECT w.name, COUNT(c.id) as nb_chapters
FROM webinars w
LEFT JOIN webinar_chapters c ON c.webinar_id = w.id
GROUP BY w.name;
```

### Données approximatives (observées via le dashboard)

| Métrique | Valeur |
|----------|--------|
| Webinaires configurés | 4 |
| Sessions totales (Replay LinkedIn IA) | 4 |
| Sessions identifiées | 0 (0%) |
| Événements enregistrés | 153+ |
| Pending registrations | 0 |
| Comptes Systeme.io | 0 (ou 1 si configuré manuellement) |

---

## 9. Ce qui n'a pas été implémenté (par rapport aux specs)

```
- [ ] Matching pending_registrations ↔ sessions anonymes
      Spec : WebinarPulse-Dev-Spec-Identification.md mentionne la table
      pending_registrations comme backup, mais aucun mécanisme automatique
      de matching n'est implémenté. Le cookie est le seul lien.
      → Impact faible si le cookie fonctionne correctement.

- [ ] Mise à jour de /api/script/route.js (ancienne API)
      L'API route qui sert le script via GET n'a pas été mise à jour
      avec la logique cookie. Elle sert toujours l'ancien script.
      → Action : soit la supprimer, soit la mettre à jour.

- [ ] StatCard avec couleur d'identification
      Spec : l'indicateur d'identification devait être coloré
      (vert >50%, jaune 10-50%, rouge <10%). Le nombre est affiché
      mais sans code couleur dynamique.

- [ ] Webhook achats (table purchases)
      Spec PRD : F14 mentionné comme v1.2, pas implémenté.

- [ ] Authentification dashboard
      Spec PRD : F15 mentionné comme v1.1, pas implémenté.
      Le dashboard est accessible sans auth.

- [ ] Proxy Vercel pour contourner les adblockers
      Mentionné dans les limites du PRD (v1.1), pas implémenté.
```

---

## 10. Questions et suggestions

1. **Tester les scripts sur Systeme.io** : la priorité immédiate est d'installer les 2 nouveaux scripts (optin + tracking avec cookie) sur les pages Systeme.io et de valider le flow complet inscription → cookie → session identifiée. Sans ce test, l'identification ne fonctionne pas.

2. **Supprimer ou mettre à jour `/api/script`** : cette route API sert toujours l'ancien script sans cookie. Si des utilisateurs l'utilisent via un embed dynamique, ils n'auront pas l'identification. Recommandation : la mettre à jour avec la version cookie ou la supprimer.

3. **Fréquence du cron sync-tags** : actuellement configuré à `0 0 * * *` (une fois par jour à minuit). La spec originale prévoyait toutes les heures (`0 * * * *`). À ajuster selon le volume de sessions et la réactivité souhaitée des emails.

4. **Sécurité RLS** : toutes les tables ont des policies ouvertes. Les clés API Systeme.io sont lisibles via l'API anon. Si l'app est distribuée à des tiers, il faudra :
   - Ajouter une authentification (Supabase Auth)
   - Restreindre les RLS par `auth.uid()`
   - Chiffrer les clés API ou utiliser Supabase Vault

5. **Table `app_settings`** : cette table est en partie redondante avec `systemeio_accounts`. Elle contient encore `systemeio_api_key` qui servait avant le multi-comptes. Elle pourrait être nettoyée ou réutilisée pour d'autres settings futurs.

6. **Vimeo Player retry** : le nouveau script fait un retry après 2s si l'iframe n'est pas trouvée, mais un seul try. Sur des pages de vente avec beaucoup de JS, Systeme.io peut mettre plus longtemps à charger l'iframe. Un retry avec backoff exponentiel (2s, 4s, 8s) serait plus robuste.
