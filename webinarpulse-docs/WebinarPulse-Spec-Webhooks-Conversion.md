# WebinarPulse — Spec d'implémentation : Webhooks + Matching + Dashboard Conversion

**Date** : 20 mars 2026
**Destinataire** : IA de développement (Antigravity / Gemini)
**Priorité** : P0
**Contexte** : Ce document contient TOUTES les informations nécessaires pour implémenter les features sans poser de questions.

---

## 1. Contexte du projet

### 1.1 Qu'est-ce que WebinarPulse

WebinarPulse est une app d'analytics pour webinaires evergreen (vidéos pré-enregistrées en replay) hébergés sur Systeme.io avec des vidéos Vimeo. Elle mesure qui regarde, combien de temps, et identifie les points de décrochage.

### 1.2 Stack technique

| Composant | Technologie | Version |
|---|---|---|
| Frontend | Next.js 14 (App Router) | `^14.2.0` |
| UI | React 18 + Tailwind CSS | `^18.3.0` / `^3.4.13` |
| Base de données | Supabase (PostgreSQL 15) | `@supabase/supabase-js ^2.45.0` |
| Hébergement | Vercel (plan Hobby) | Timeout API routes : 10s |
| Repo | https://github.com/deylac/webinarpulse |
| URL prod | https://project-to7fk.vercel.app |

**Pas d'Anthropic SDK installé.** Les appels IA utilisent `fetch()` directement. Pas de TypeScript. Tout est en JavaScript (.js).

### 1.3 Projet Supabase

- **ID** : `nrdiphkwejcghgeemjjb`
- **Région** : eu-west-3
- **Nom** : "Flow"
- **URL** : `https://nrdiphkwejcghgeemjjb.supabase.co`
- **Clé anon** : variable d'environnement `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Service role key** : variable d'environnement `SUPABASE_SERVICE_ROLE_KEY` (privée, côté serveur uniquement)

### 1.4 Variables d'environnement existantes

| Variable | Public | Usage |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Client Supabase côté client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Client Supabase côté client |
| `ANTHROPIC_API_KEY` | ❌ | API routes d'analyse IA |
| `CRON_SECRET` | ❌ | Protection du cron `/api/sync-tags` |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ | Écriture `tagged_at` dans sync-tags |

### 1.5 Variable d'environnement à ajouter

| Variable | Public | Usage |
|---|---|---|
| `WEBHOOK_SECRET` | ❌ | Vérification HMAC des webhooks Systeme.io |

Cette variable doit être ajoutée dans Vercel (Settings > Environment Variables) ET dans `.env.local` pour le développement local. La valeur est un string arbitraire choisi par l'utilisateur, qui sera aussi entré dans la configuration webhook de Systeme.io.

---

## 2. Structure du projet existant

```
webinarpulse/
├── app/
│   ├── layout.js
│   ├── page.js
│   ├── globals.css
│   └── api/
│       ├── analyze-transcript/route.js
│       ├── generate-diagnostic/route.js
│       ├── script/route.js              ← ANCIEN, à ne pas toucher
│       └── sync-tags/route.js           ← CRON existant, à modifier (Phase 2)
├── components/
│   ├── AddWebinarModal.js
│   ├── DailyChart.js
│   ├── Dashboard.js                     ← À MODIFIER (Phase 4 : onglet Conversion)
│   ├── DiagnosticPanel.js
│   ├── RetentionChart.js
│   ├── ScriptGenerator.js               ← À MODIFIER (Phase 5 : guide webhooks)
│   ├── SettingsModal.js
│   ├── StatCard.js
│   ├── TaggingTab.js
│   ├── TranscriptTab.js
│   ├── ViewerTable.js
│   └── WebinarList.js
├── lib/
│   ├── supabase.js                      ← Client Supabase existant
│   ├── transcriptParser.js
│   └── utils.js
├── vercel.json                          ← Config cron existante
└── package.json
```

### 2.1 Client Supabase existant (`lib/supabase.js`)

```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

Ce client utilise la clé anon (lecture/écriture publique, limitée par RLS). Pour les API routes serveur qui ont besoin de bypass RLS, créer un client avec la service_role_key :

```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
```

### 2.2 Vercel.json existant

```json
{
  "crons": [
    {
      "path": "/api/sync-tags",
      "schedule": "0 0 * * *"
    }
  ]
}
```

---

## 3. Schéma de base de données

### 3.1 Tables existantes (NE PAS RECRÉER)

#### `webinars`
```sql
-- Colonnes : id (UUID PK), name (TEXT), slug (TEXT UNIQUE), vimeo_video_id (TEXT),
-- video_duration_seconds (INTEGER), systemeio_url (TEXT), systemeio_account_id (UUID FK),
-- created_at (TIMESTAMPTZ)
-- 4 lignes en base
```

#### `viewers`
```sql
-- Colonnes : id (UUID PK), email (TEXT UNIQUE nullable), anonymous_id (TEXT nullable),
-- created_at (TIMESTAMPTZ)
-- UNIQUE sur email pour upsert merge-duplicates
-- ~35 lignes en base
```

#### `viewing_sessions`
```sql
-- Colonnes : id (UUID PK), webinar_id (UUID FK → webinars), viewer_id (UUID FK → viewers),
-- started_at (TIMESTAMPTZ default now()), ended_at (TIMESTAMPTZ),
-- duration_seconds (INTEGER default 0), max_video_percent (INTEGER default 0),
-- max_video_seconds (INTEGER default 0), user_agent (TEXT), referrer (TEXT),
-- tagged_at (TIMESTAMPTZ nullable), created_at (TIMESTAMPTZ)
-- ~34 lignes en base
```

#### `viewing_events`
```sql
-- Colonnes : id (UUID PK), session_id (UUID FK → viewing_sessions),
-- event_type (TEXT), video_seconds (REAL default 0), video_percent (REAL default 0),
-- created_at (TIMESTAMPTZ default now())
-- event_type values: play, pause, seeked, timeupdate, page_hidden, page_visible, page_leave, ended
-- 153+ lignes en base
```

#### `pending_registrations`
```sql
-- Colonnes : id (UUID PK), email (TEXT NOT NULL), webinar_slug (TEXT NOT NULL),
-- first_name (TEXT nullable), source (TEXT nullable),
-- matched (BOOLEAN default false), matched_session_id (UUID nullable),
-- created_at (TIMESTAMPTZ default now())
-- 8 lignes en base (inscriptions captées par le script optin)
```

#### `purchases`
```sql
-- Colonnes : id (UUID PK), viewer_id (UUID FK → viewers nullable),
-- email (TEXT nullable), product_name (TEXT nullable),
-- product_price (NUMERIC nullable), created_at (TIMESTAMPTZ default now())
-- TABLE VIDE, prête à recevoir les achats via webhook
```

#### Autres tables existantes (ne pas toucher)
- `webinar_transcripts`, `webinar_chapters` — analyse de transcript IA
- `tagging_rules`, `tagging_log` — auto-tagging Systeme.io
- `app_settings` — settings clé-valeur
- `systemeio_accounts` — comptes Systeme.io multi-tenants (id, name, api_key)

### 3.2 Tables à modifier

#### Ajouter des colonnes à `purchases`

La table `purchases` existe mais a besoin de colonnes supplémentaires pour le webhook NEW_SALE :

```sql
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS systemeio_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS webhook_payload JSONB;
```

### 3.3 Table à créer

#### `webhook_log` — journal des webhooks reçus

```sql
CREATE TABLE IF NOT EXISTS webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  ip_address TEXT,
  signature_valid BOOLEAN DEFAULT false,
  processed BOOLEAN DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE webhook_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow insert from service role" ON webhook_log FOR ALL USING (true);
```

### 3.4 RPC à créer — Matching pending_registrations ↔ sessions anonymes

```sql
CREATE OR REPLACE FUNCTION match_pending_registrations()
RETURNS TABLE (
  registration_id UUID,
  viewer_id UUID,
  session_id UUID,
  email TEXT
) AS $$
  WITH matches AS (
    SELECT DISTINCT ON (pr.id)
      pr.id AS registration_id,
      v.id AS viewer_id,
      s.id AS session_id,
      pr.email
    FROM pending_registrations pr
    JOIN webinars w ON w.slug = pr.webinar_slug
    JOIN viewing_sessions s ON s.webinar_id = w.id
    JOIN viewers v ON v.id = s.viewer_id
    WHERE pr.matched = false
      AND v.email IS NULL
      AND s.started_at >= pr.created_at - INTERVAL '5 minutes'
      AND s.started_at <= pr.created_at + INTERVAL '30 minutes'
    ORDER BY pr.id, ABS(EXTRACT(EPOCH FROM (s.started_at - pr.created_at)))
  )
  SELECT * FROM matches
$$ LANGUAGE SQL;
```

**Logique** : Pour chaque inscription non matchée, chercher une session anonyme du même webinaire (via slug → webinar_id) dont le `started_at` est dans une fenêtre de -5 min à +30 min par rapport au `created_at` de l'inscription. Le -5 min couvre le cas où la session est créée juste avant que le webhook arrive. Le +30 min couvre le délai normal entre inscription et début du visionnage.

---

## 4. Informations techniques Systeme.io

### 4.1 Service Webhook de Systeme.io

Systeme.io dispose d'un service webhook natif accessible dans **Paramètres > Webhooks**. Ce service est distinct des automatisations de tunnel (automation rules).

#### Configuration dans Systeme.io

Chemin : **Photo de profil → Settings → Webhooks → Create**

Champs à remplir :
1. **Nom** : nom descriptif (ex: "WebinarPulse OPT_IN")
2. **URL** : l'URL HTTPS de l'endpoint (ex: `https://project-to7fk.vercel.app/api/webhook/optin`)
3. **Secret key** : une clé secrète partagée pour la vérification HMAC (même valeur que `WEBHOOK_SECRET` dans Vercel)
4. **Active** : toggle on/off
5. **Événements** : sélectionner les types d'événements qui déclenchent le webhook

#### Événements disponibles

| Événement | Déclencheur |
|---|---|
| `CONTACT_CREATED` | Nouveau contact créé dans le compte |
| `CONTACT_TAG_ADDED` | Tag ajouté à un contact |
| `CONTACT_TAG_REMOVED` | Tag retiré d'un contact |
| `OPT_IN` | Contact s'inscrit via un formulaire d'optin |
| `NEW_SALE` | Client fait un achat |
| `SALE_CANCELLED` | Abonnement annulé ou paiement remboursé |

**Limite** : 10 webhooks max par compte Systeme.io.

#### Format des requêtes webhook

Chaque webhook envoie un **POST** HTTP avec :

**Headers** :
```
Content-Type: application/json
X-Webhook-Event: OPT_IN | NEW_SALE | SALE_CANCELLED | CONTACT_CREATED | CONTACT_TAG_ADDED | CONTACT_TAG_REMOVED
X-Webhook-Signature: <HMAC-SHA256 hex digest>
X-Webhook-Message-Id: <unique message id>
```

**IPs sources** (pour filtrage optionnel) :
- `185.236.142.1`
- `185.236.142.2`
- `185.236.142.3`

**Retries** : 12 tentatives max sur 5 jours, backoff exponentiel (4s, 16s, 64s...). L'endpoint DOIT répondre `200 OK` rapidement pour éviter les retries.

#### Vérification de signature HMAC

Le header `X-Webhook-Signature` contient un HMAC SHA256 calculé sur le body brut de la requête avec le secret partagé. Code de vérification référence (trouvé dans des guides d'intégration Systeme.io) :

```javascript
import crypto from 'crypto';

function verifyWebhookSignature(rawBody, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}
```

**IMPORTANT pour Next.js App Router** : il faut lire le body brut (raw) AVANT le parsing JSON, sinon la signature ne correspondra pas. Dans les API routes Next.js App Router, utiliser `await request.text()` pour obtenir le body brut, puis `JSON.parse()` ensuite.

#### Payload webhook — événement OPT_IN

```json
{
  "event": "OPT_IN",
  "contact": {
    "id": 12345678,
    "email": "viewer@example.com",
    "fields": [
      { "slug": "first_name", "value": "Marie" },
      { "slug": "last_name", "value": "Dupont" },
      { "slug": "phone_number", "value": "" }
    ],
    "tags": [
      { "id": 123, "name": "optin-webinaire" }
    ]
  }
}
```

**Notes** :
- Le champ `contact.id` est l'ID interne Systeme.io (integer), pas un UUID.
- `fields` est un array d'objets `{ slug, value }`. Les slugs courants : `first_name`, `last_name`, `phone_number`, plus les champs custom.
- `tags` est un array d'objets `{ id, name }` des tags actuels du contact.
- Le payload NE contient PAS l'ID du tunnel ou de la page. On ne sait pas quel webinaire est concerné directement. Il faut matcher par email + timing, ou demander à l'utilisateur de créer un webhook par tunnel/webinaire.

#### Payload webhook — événement NEW_SALE

```json
{
  "event": "NEW_SALE",
  "contact": {
    "id": 12345678,
    "email": "buyer@example.com",
    "fields": [
      { "slug": "first_name", "value": "Pierre" }
    ],
    "tags": []
  },
  "sale": {
    "id": 9876543,
    "plan_name": "Formation LinkedIn IA",
    "amount": 297.00,
    "currency": "EUR",
    "status": "completed"
  }
}
```

**Notes** :
- Le champ `sale` contient les détails de la vente.
- `amount` est en unité de la devise (pas en centimes).
- `plan_name` correspond au nom du produit/offre dans Systeme.io.

#### Payload webhook — événement SALE_CANCELLED

```json
{
  "event": "SALE_CANCELLED",
  "contact": {
    "id": 12345678,
    "email": "buyer@example.com",
    "fields": [],
    "tags": []
  },
  "sale": {
    "id": 9876543,
    "plan_name": "Formation LinkedIn IA",
    "amount": 297.00,
    "currency": "EUR",
    "status": "cancelled"
  }
}
```

### 4.2 Méthode alternative : webhook via automation rules

En plus du service webhook global (Settings > Webhooks), Systeme.io permet aussi de créer des webhooks **par page de tunnel** via les Automation Rules. Cette méthode est plus ciblée car elle se déclenche uniquement quand quelqu'un s'inscrit sur une page spécifique.

**Chemin** : Tunnels → sélectionner le tunnel → sélectionner la page optin → Automation rules → Add rule → Trigger: "Funnel step form subscribed" → Action: "Send webhook" → URL de destination.

**Avantage** : on sait exactement quel tunnel a généré l'inscription (utile pour mapper au bon webinaire).

**Inconvénient** : pas de signature HMAC (moins sécurisé), payload potentiellement différent du service webhook global.

**Recommandation** : utiliser le service webhook global (Settings > Webhooks) pour la sécurité HMAC, et mapper le webinaire par email + timing.

---

## 5. Plan d'implémentation — 5 Phases

### Vue d'ensemble

| Phase | Livrable | Fichiers | Priorité |
|---|---|---|---|
| Phase 1 | Endpoint webhook OPT_IN | `app/api/webhook/optin/route.js`, `lib/webhookUtils.js` | P0 |
| Phase 2 | Matching pending → sessions + batch | `app/api/webhook/optin/route.js` (compléter), modifier `app/api/sync-tags/route.js` | P0 |
| Phase 3 | Endpoint webhook NEW_SALE | `app/api/webhook/sale/route.js` | P0 |
| Phase 4 | Dashboard Conversion | `components/ConversionTab.js`, modifier `components/Dashboard.js` | P1 |
| Phase 5 | Guide webhooks dans le dashboard | Modifier `components/ScriptGenerator.js` | P1 |

---

### Phase 1 — Endpoint webhook OPT_IN

#### Fichier à créer : `lib/webhookUtils.js`

Utilitaires partagés par tous les endpoints webhook.

```javascript
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Client Supabase côté serveur (service role, bypass RLS)
export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// IPs autorisées de Systeme.io
const ALLOWED_IPS = ['185.236.142.1', '185.236.142.2', '185.236.142.3'];

// Vérifier la signature HMAC SHA256
export function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

// Vérifier l'IP source (optionnel, car certains proxys modifient l'IP)
export function isAllowedIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : null;
  if (!ip) return true; // Si pas d'IP, on laisse passer (la signature suffit)
  return ALLOWED_IPS.includes(ip);
}

// Logger le webhook dans webhook_log
export async function logWebhook(supabase, eventType, payload, ip, signatureValid, processed, errorMessage) {
  await supabase.from('webhook_log').insert({
    event_type: eventType,
    payload,
    ip_address: ip,
    signature_valid: signatureValid,
    processed,
    error_message: errorMessage
  }).catch(() => {}); // Ne jamais bloquer sur le log
}
```

#### Fichier à créer : `app/api/webhook/optin/route.js`

```javascript
import { NextResponse } from 'next/server';
import { verifySignature, getSupabaseAdmin, logWebhook } from '@/lib/webhookUtils';

export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  // 1. Lire le body brut AVANT le parsing (crucial pour la vérification HMAC)
  const rawBody = await request.text();
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 2. Vérifier la signature HMAC
  const signature = request.headers.get('x-webhook-signature');
  const secret = process.env.WEBHOOK_SECRET;
  const signatureValid = verifySignature(rawBody, signature, secret);

  if (!signatureValid) {
    await logWebhook(supabase, 'OPT_IN', payload, ip, false, false, 'Invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  // 3. Extraire l'email du payload
  const email = payload?.contact?.email?.trim()?.toLowerCase();
  if (!email || !email.includes('@')) {
    await logWebhook(supabase, 'OPT_IN', payload, ip, true, false, 'No valid email');
    return NextResponse.json({ error: 'No valid email' }, { status: 400 });
  }

  // 4. Extraire le first_name des fields
  const firstName = payload?.contact?.fields?.find(f => f.slug === 'first_name')?.value || null;
  const systemeioContactId = payload?.contact?.id?.toString() || null;

  // 5. Insérer dans pending_registrations
  // NOTE : on ne connaît pas le webinar_slug depuis le webhook global.
  // On met "webhook" comme source. Le matching se fera par email + timing.
  // Si l'utilisateur crée un webhook par tunnel, on pourrait extraire le slug.
  const { error: insertError } = await supabase.from('pending_registrations').insert({
    email,
    webinar_slug: '_webhook_optin',  // Placeholder — le matching utilise l'email, pas le slug
    first_name: firstName,
    source: 'webhook_optin'
  });

  if (insertError) {
    await logWebhook(supabase, 'OPT_IN', payload, ip, true, false, insertError.message);
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
  }

  // 6. Matching temps réel : chercher une session anonyme récente pour cet email
  await matchEmailToAnonymousSessions(supabase, email);

  // 7. Logger et répondre 200 rapidement
  await logWebhook(supabase, 'OPT_IN', payload, ip, true, true, null);
  return NextResponse.json({ ok: true }, { status: 200 });
}

async function matchEmailToAnonymousSessions(supabase, email) {
  try {
    // Chercher toutes les sessions anonymes des 30 dernières minutes
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: anonSessions } = await supabase
      .from('viewing_sessions')
      .select('id, viewer_id, viewer:viewers(id, email, anonymous_id)')
      .gte('started_at', thirtyMinAgo)
      .is('viewer.email', null);

    if (!anonSessions || anonSessions.length === 0) return;

    // Filtrer les sessions dont le viewer est bien anonyme
    const sessionsToMatch = anonSessions.filter(s => s.viewer && !s.viewer.email);

    for (const session of sessionsToMatch) {
      // Mettre à jour le viewer avec l'email
      await supabase
        .from('viewers')
        .update({ email })
        .eq('id', session.viewer_id);

      // Marquer le pending_registration comme matché
      await supabase
        .from('pending_registrations')
        .update({ matched: true, matched_session_id: session.id })
        .eq('email', email)
        .eq('matched', false);
    }
  } catch (e) {
    console.error('Matching error:', e);
  }
}
```

**Points d'attention** :
- Le webhook global OPT_IN de Systeme.io ne contient pas le slug du webinaire. On stocke `_webhook_optin` comme placeholder. Le matching se fait par email + fenêtre temporelle, pas par slug.
- Le matching temps réel cherche les sessions anonymes des 30 dernières minutes. Si un viewer s'inscrit et regarde immédiatement, sa session anonyme sera retrouvée et mise à jour avec son email.
- Le cookie first-party (script optin existant) reste en place comme mécanisme parallèle. Le webhook est une ceinture, le cookie est les bretelles.

---

### Phase 2 — Matching batch dans le cron sync-tags

#### Fichier à modifier : `app/api/sync-tags/route.js`

Ajouter le matching batch AVANT le tagging existant. Le cron existant fait déjà :
1. Vérifier le CRON_SECRET
2. Appeler la RPC `get_untagged_sessions()`
3. Taguer les contacts dans Systeme.io

Il faut ajouter **en premier** dans la fonction :

```javascript
// === MATCHING BATCH : pending_registrations → sessions anonymes ===
async function runBatchMatching(supabase) {
  // Appeler la RPC qui trouve les correspondances
  const { data: matches, error } = await supabase.rpc('match_pending_registrations');

  if (error || !matches || matches.length === 0) return 0;

  let matchCount = 0;
  for (const match of matches) {
    // 1. Mettre à jour le viewer avec l'email
    const { error: viewerErr } = await supabase
      .from('viewers')
      .update({ email: match.email })
      .eq('id', match.viewer_id);

    if (viewerErr) continue;

    // 2. Marquer le pending_registration comme matché
    await supabase
      .from('pending_registrations')
      .update({ matched: true, matched_session_id: match.session_id })
      .eq('id', match.registration_id);

    matchCount++;
  }
  return matchCount;
}
```

Appeler `await runBatchMatching(supabase);` au début du handler GET, avant le tagging.

---

### Phase 3 — Endpoint webhook NEW_SALE

#### Fichier à créer : `app/api/webhook/sale/route.js`

```javascript
import { NextResponse } from 'next/server';
import { verifySignature, getSupabaseAdmin, logWebhook } from '@/lib/webhookUtils';

export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  // 1. Lire le body brut
  const rawBody = await request.text();
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 2. Vérifier la signature HMAC
  const signature = request.headers.get('x-webhook-signature');
  const secret = process.env.WEBHOOK_SECRET;
  const signatureValid = verifySignature(rawBody, signature, secret);

  if (!signatureValid) {
    await logWebhook(supabase, payload?.event || 'SALE', payload, ip, false, false, 'Invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  const eventType = payload?.event;
  const email = payload?.contact?.email?.trim()?.toLowerCase();
  const systemeioContactId = payload?.contact?.id?.toString() || null;

  if (!email) {
    await logWebhook(supabase, eventType, payload, ip, true, false, 'No email');
    return NextResponse.json({ error: 'No email' }, { status: 400 });
  }

  // 3. Traiter selon le type d'événement
  if (eventType === 'NEW_SALE') {
    const sale = payload?.sale || {};

    // Trouver le viewer par email
    const { data: viewers } = await supabase
      .from('viewers')
      .select('id')
      .eq('email', email)
      .limit(1);

    const viewerId = viewers?.[0]?.id || null;

    // Insérer l'achat
    const { error: insertError } = await supabase.from('purchases').insert({
      viewer_id: viewerId,
      email,
      product_name: sale.plan_name || null,
      product_price: sale.amount || null,
      systemeio_contact_id: systemeioContactId,
      webhook_payload: payload
    });

    if (insertError) {
      await logWebhook(supabase, eventType, payload, ip, true, false, insertError.message);
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
    }

    await logWebhook(supabase, eventType, payload, ip, true, true, null);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (eventType === 'SALE_CANCELLED') {
    // Marquer l'achat comme annulé
    const { error: updateError } = await supabase
      .from('purchases')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('email', email)
      .is('cancelled_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    await logWebhook(supabase, eventType, payload, ip, true, !updateError, updateError?.message);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Événement non géré
  await logWebhook(supabase, eventType, payload, ip, true, false, 'Unknown event type');
  return NextResponse.json({ ok: true }, { status: 200 });
}
```

**Points d'attention** :
- L'endpoint gère à la fois `NEW_SALE` et `SALE_CANCELLED` (même URL webhook, on distingue par le champ `event` du payload).
- Si le viewer n'existe pas encore dans la base au moment de l'achat, on stocke l'email brut. Le `viewer_id` sera null. On pourra le relier plus tard.
- Le `webhook_payload` stocke le payload brut complet en JSONB pour le debug.

---

### Phase 4 — Dashboard Conversion

#### Fichier à créer : `components/ConversionTab.js`

Ce composant est un nouvel onglet dans `Dashboard.js` (à côté de Rétention, Viewers, Volume, Transcript, Tags). Il affiche :

##### 4.1 Taux de conversion global

```
Taux de conversion : X% (Y acheteurs / Z viewers identifiés)
```

Requête :
```javascript
// Viewers identifiés (avec email) pour ce webinaire
const { data: sessions } = await supabase
  .from('viewing_sessions')
  .select('viewer_id, viewer:viewers(id, email)')
  .eq('webinar_id', webinar.id);

const uniqueViewers = [...new Set(sessions?.filter(s => s.viewer?.email).map(s => s.viewer.email))];

// Achats
const { data: purchases } = await supabase
  .from('purchases')
  .select('email, product_name, product_price, created_at, cancelled_at')
  .is('cancelled_at', null);

const buyers = purchases?.filter(p => uniqueViewers.includes(p.email)) || [];
const conversionRate = uniqueViewers.length > 0 ? (buyers.length / uniqueViewers.length * 100) : 0;
```

##### 4.2 Courbes de rétention comparées (acheteurs vs non-acheteurs)

Deux courbes SVG sur le même graphique :
- **Verte** : courbe de rétention des viewers qui ont acheté
- **Grise** : courbe de rétention des viewers qui n'ont pas acheté

Utiliser le même algorithme que `RetentionChart.js` (50 buckets) mais filtrer les sessions par email d'acheteur.

##### 4.3 Seuil de visionnage critique

Trouver le pourcentage de vidéo vue à partir duquel le taux de conversion augmente significativement. Algorithme :

```javascript
// Pour chaque palier de 10% (10%, 20%, 30%... 100%)
// Calculer le taux de conversion des viewers ayant dépassé ce palier
const thresholds = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const thresholdData = thresholds.map(t => {
  const viewersAbove = sessions.filter(s => s.max_video_percent >= t);
  const emailsAbove = [...new Set(viewersAbove.filter(s => s.viewer?.email).map(s => s.viewer.email))];
  const buyersAbove = emailsAbove.filter(e => buyers.some(b => b.email === e));
  return {
    threshold: t,
    conversionRate: emailsAbove.length > 0 ? (buyersAbove.length / emailsAbove.length * 100) : 0
  };
});
// Le "seuil critique" est le palier où le taux de conversion fait le plus gros saut
```

Afficher sous forme de graphique en barres ou en courbe, avec le seuil critique mis en évidence.

##### 4.4 Délai moyen entre première session et achat

```javascript
// Pour chaque acheteur, trouver la première session de visionnage
const delays = buyers.map(buyer => {
  const buyerSessions = sessions
    .filter(s => s.viewer?.email === buyer.email)
    .sort((a, b) => new Date(a.started_at) - new Date(b.started_at));

  if (!buyerSessions.length) return null;

  const firstSession = new Date(buyerSessions[0].started_at);
  const purchaseDate = new Date(buyer.created_at);
  return (purchaseDate - firstSession) / (1000 * 60 * 60); // En heures
}).filter(Boolean);

const avgDelay = delays.length > 0 ? delays.reduce((a, b) => a + b, 0) / delays.length : 0;
```

Afficher : "Délai moyen entre visionnage et achat : Xh Ym"

##### 4.5 Liste des acheteurs

Table avec colonnes : Email, Produit, Prix, % vidéo vu, Délai (visionnage → achat), Date.

##### 4.6 État vide

Si aucun achat dans la table `purchases`, afficher :
```
Aucun achat enregistré pour l'instant.

Pour activer le suivi des achats :
1. Configurez le webhook NEW_SALE dans Systeme.io
2. Les achats apparaîtront automatiquement ici

[Voir les instructions] ← lien vers le guide webhooks (Phase 5)
```

#### Fichier à modifier : `components/Dashboard.js`

Ajouter l'onglet "Conversion" dans le tableau d'onglets existant :

```javascript
// Dans le tableau des onglets (déjà : Rétention, Viewers, Volume, Transcript, Tags)
// Ajouter :
{ id: 'conversion', label: 'Conversion' }

// Dans le rendu conditionnel :
{activeTab === 'conversion' && (
  <ConversionTab webinar={webinar} sessions={sessions} />
)}
```

---

### Phase 5 — Guide webhooks dans le dashboard

#### Fichier à modifier : `components/ScriptGenerator.js`

Ajouter une **Étape 3** au wizard existant (actuellement : Étape 1 = Script Optin, Étape 2 = Script Tracking).

##### Étape 3 : Webhooks Systeme.io (optionnel)

**Titre** : "Étape 3 — Webhooks Systeme.io (recommandé)"

**Description** : "Les webhooks renforcent l'identification des viewers et permettent le suivi des achats. Ils fonctionnent en complément des scripts."

**Instructions** :

```
1. Dans Systeme.io, cliquez sur votre photo de profil → Paramètres (Settings)
2. Cliquez sur "Webhooks" dans le menu de gauche
3. Cliquez sur "Créer" (Create)
4. Remplissez les champs :

   Webhook 1 — Identification :
   • Nom : WebinarPulse - Optin
   • URL : [URL dynamique pré-remplie]
   • Clé secrète : [input pour entrer/générer un secret]
   • Événements : cocher "Opt-In"
   • Cliquez "Sauvegarder"

   Webhook 2 — Achats :
   • Nom : WebinarPulse - Ventes
   • URL : [URL dynamique pré-remplie]
   • Clé secrète : [même secret que le webhook 1]
   • Événements : cocher "New sale" et "Sale cancelled"
   • Cliquez "Sauvegarder"

5. Copiez la clé secrète et ajoutez-la dans les variables d'environnement
   de Vercel sous le nom WEBHOOK_SECRET
```

**URLs à afficher** (générées dynamiquement) :
```javascript
const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
const optinWebhookUrl = `${baseUrl}/api/webhook/optin`;
const saleWebhookUrl = `${baseUrl}/api/webhook/sale`;
```

**Bouton de test** : un bouton "Vérifier la connexion" qui :
```javascript
const { data: logs } = await supabase
  .from('webhook_log')
  .select('event_type, signature_valid, created_at')
  .order('created_at', { ascending: false })
  .limit(5);

// Afficher un statut :
// 🔴 "Aucun webhook reçu" si pas de logs
// 🟡 "Webhooks reçus mais signatures invalides" si logs avec signature_valid = false
// 🟢 "Webhooks actifs — X événements reçus" si logs avec signature_valid = true
```

---

## 6. Migration SQL complète

Exécuter cette migration dans Supabase (SQL Editor ou fichier de migration) :

```sql
-- Phase 1 : Colonnes supplémentaires sur purchases
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS systemeio_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS webhook_payload JSONB;

-- Phase 1 : Table webhook_log
CREATE TABLE IF NOT EXISTS webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  ip_address TEXT,
  signature_valid BOOLEAN DEFAULT false,
  processed BOOLEAN DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE webhook_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_log_open" ON webhook_log FOR ALL USING (true);

-- Phase 2 : RPC matching
CREATE OR REPLACE FUNCTION match_pending_registrations()
RETURNS TABLE (
  registration_id UUID,
  viewer_id UUID,
  session_id UUID,
  email TEXT
) AS $$
  WITH matches AS (
    SELECT DISTINCT ON (pr.id)
      pr.id AS registration_id,
      v.id AS viewer_id,
      s.id AS session_id,
      pr.email
    FROM pending_registrations pr
    JOIN webinars w ON w.slug = pr.webinar_slug
    JOIN viewing_sessions s ON s.webinar_id = w.id
    JOIN viewers v ON v.id = s.viewer_id
    WHERE pr.matched = false
      AND v.email IS NULL
      AND s.started_at >= pr.created_at - INTERVAL '5 minutes'
      AND s.started_at <= pr.created_at + INTERVAL '30 minutes'
    ORDER BY pr.id, ABS(EXTRACT(EPOCH FROM (s.started_at - pr.created_at)))
  )
  SELECT * FROM matches
$$ LANGUAGE SQL;

-- Index pour accélérer le matching
CREATE INDEX IF NOT EXISTS idx_pending_reg_unmatched
  ON pending_registrations (email, webinar_slug)
  WHERE matched = false;

CREATE INDEX IF NOT EXISTS idx_sessions_started
  ON viewing_sessions (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_viewers_email
  ON viewers (email)
  WHERE email IS NOT NULL;

-- Index pour accélérer les requêtes du dashboard Conversion
CREATE INDEX IF NOT EXISTS idx_purchases_email
  ON purchases (email)
  WHERE cancelled_at IS NULL;
```

---

## 7. Récapitulatif des fichiers à créer / modifier

| Fichier | Action | Phase |
|---|---|---|
| `lib/webhookUtils.js` | **CRÉER** | 1 |
| `app/api/webhook/optin/route.js` | **CRÉER** | 1 |
| `app/api/webhook/sale/route.js` | **CRÉER** | 3 |
| `app/api/sync-tags/route.js` | **MODIFIER** (ajouter matching batch en début) | 2 |
| `components/ConversionTab.js` | **CRÉER** | 4 |
| `components/Dashboard.js` | **MODIFIER** (ajouter onglet Conversion) | 4 |
| `components/ScriptGenerator.js` | **MODIFIER** (ajouter Étape 3 Webhooks) | 5 |
| Migration SQL | **EXÉCUTER** dans Supabase | 1-2 |

---

## 8. Tests à effectuer

### 8.1 Test Phase 1 — Webhook OPT_IN

1. Configurer le webhook dans Systeme.io (Settings > Webhooks > Create).
2. S'inscrire sur la page optin : `https://www.superproductif.fr/webi-auto-ia`
3. Vérifier dans Supabase :
   - Une ligne dans `webhook_log` avec `event_type: 'OPT_IN'`, `signature_valid: true`, `processed: true`
   - Une ligne dans `pending_registrations` avec `source: 'webhook_optin'`
4. Si un viewer anonyme a une session active, vérifier que le matching temps réel a mis à jour le viewer avec l'email.

### 8.2 Test Phase 2 — Matching batch

1. Créer manuellement une entrée dans `pending_registrations` avec un email test et un `webinar_slug` correspondant à un webinaire existant.
2. Créer manuellement une session anonyme pour ce webinaire avec un `started_at` dans la fenêtre de 30 minutes.
3. Déclencher le cron : `GET /api/sync-tags?secret=CRON_SECRET`
4. Vérifier que le viewer de la session a maintenant l'email test.

### 8.3 Test Phase 3 — Webhook NEW_SALE

1. Configurer un deuxième webhook dans Systeme.io pour NEW_SALE + SALE_CANCELLED.
2. Faire un achat test (ou utiliser Pipedream pour simuler le payload).
3. Vérifier dans Supabase :
   - Une ligne dans `purchases` avec l'email, le produit, le prix.
   - Une ligne dans `webhook_log` avec `event_type: 'NEW_SALE'`.

### 8.4 Test Phase 4 — Dashboard Conversion

1. Avec au moins 1 achat en base, naviguer vers l'onglet Conversion.
2. Vérifier que le taux de conversion s'affiche.
3. Vérifier que les courbes comparées s'affichent (même avec peu de données).
4. Vérifier l'état vide si aucun achat.

### 8.5 Test Phase 5 — Guide webhooks

1. Ouvrir le ScriptGenerator d'un webinaire.
2. Vérifier que l'étape 3 Webhooks s'affiche avec les bonnes URLs.
3. Cliquer "Vérifier la connexion" et vérifier le statut.

---

## 9. Contraintes et limites

| Contrainte | Impact | Mitigation |
|---|---|---|
| Vercel Hobby timeout 10s | Les API routes webhook doivent répondre en <10s | Répondre 200 immédiatement, traiter en async si besoin |
| RLS ouvert (anon all) | Les données webhook_log sont lisibles publiquement | Acceptable pour usage interne. Auth à ajouter plus tard |
| Webhook global sans slug | Le webhook OPT_IN ne contient pas le slug du webinaire | Matching par email + fenêtre temporelle |
| 10 webhooks max par compte | Limite Systeme.io | 2 webhooks suffisent (optin + sales) |
| Pas de deduplication native | Un même événement peut être reçu plusieurs fois (retries) | L'upsert sur viewers.email gère les doublons. purchases.webhook_payload permet de détecter les doublons |

---

## 10. Ce qui ne change PAS

- Les scripts optin et tracking existants (cookie first-party) restent en place.
- Le composant `ScriptGenerator` garde ses étapes 1 et 2 telles quelles.
- La route `/api/script` (ancienne) n'est pas touchée.
- Le cron `sync-tags` garde toute sa logique de tagging existante. On ajoute le matching batch AVANT, sans toucher au reste.
- Le mode démo continue de fonctionner.
- Toutes les autres tables et composants restent identiques.
