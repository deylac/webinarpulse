# WebinarPulse — Auto-tagging Systeme.io
## Recommandation technique pour le développeur

**Date** : 18 mars 2026
**Auteur** : Brice / Superproductif
**Destinataire** : Développeur chargé de l'implémentation
**Priorité** : Feature P1 post-MVP

---

## 1. Contexte et objectif

WebinarPulse est un outil d'analytics pour webinaires evergreen hébergés sur Systeme.io (vidéos Vimeo). Il collecte déjà les données de visionnage dans une base Supabase : durée de visionnage, pourcentage de vidéo vu, email du viewer.

L'objectif de cette feature est de **fermer la boucle** entre les données de visionnage et le CRM Systeme.io. Concrètement, on veut poser automatiquement des tags sur les contacts Systeme.io en fonction de leur comportement de visionnage, afin de déclencher des séquences email de relance différenciées.

Exemple : quelqu'un qui a vu 90% du webinaire reçoit un email d'offre directe. Quelqu'un qui a quitté à 20% reçoit un email "vous avez manqué le meilleur".

---

## 2. API Systeme.io — ce qu'il faut savoir

### 2.1 Authentification

Toutes les requêtes utilisent le header `X-API-Key`.

```
X-API-Key: {SYSTEMEIO_API_KEY}
```

La clé se génère dans Systeme.io > Profil > Paramètres > Public API keys. Maximum 2 clés actives simultanément. Possibilité de laisser sans expiration.

**Important** : cette clé ne doit JAMAIS être exposée côté client. Tout appel à l'API Systeme.io doit se faire côté serveur (Edge Function ou API Route).

### 2.2 Endpoints nécessaires

**Lister les contacts (pour retrouver un contact par email)** :
```
GET https://api.systeme.io/api/contacts?email={email}
→ Réponse : { items: [{ id, email, tags: [...], ... }], ... }
```

**Créer un tag** :
```
POST https://api.systeme.io/api/tags
Body: { "name": "webinar-bootcamp-completed" }
Header: Content-Type: application/json
```

**Assigner un tag à un contact** :
```
POST https://api.systeme.io/api/contacts/{contactId}/tags
Body: { "tagId": {tagId} }
```

**Retirer un tag d'un contact** :
```
DELETE https://api.systeme.io/api/contacts/{contactId}/tags/{tagId}
```

### 2.3 Rate limiting

L'API a un rate limit (pas documenté précisément). Respecter les headers `X-RateLimit-Remaining` et `Retry-After` en cas de réponse 429. Prévoir un délai de 200-500ms entre chaque appel et un mécanisme de retry exponentiel.

### 2.4 Pagination

L'API utilise une pagination par curseur. Paramètres : `limit`, `startingAfter`, `order` (asc/desc).

### 2.5 Point clé pour le business

Les tags posés via l'API **déclenchent les automatisations** configurées dans Systeme.io. C'est le mécanisme central : on pose le tag, Systeme.io envoie l'email. Pas besoin de gérer l'envoi d'emails nous-mêmes.

---

## 3. Architecture recommandée

### 3.1 Choix technique : Supabase Edge Function + pg_cron

On recommande une **Edge Function Supabase** déclenchée par un **cron job** (toutes les heures ou toutes les 30 min) plutôt qu'une API Route Next.js pour les raisons suivantes :

- La clé API Systeme.io reste dans les secrets Supabase, jamais exposée dans le frontend.
- Pas de dépendance au runtime Vercel (limites de timeout sur le plan gratuit).
- La fonction a un accès direct à la base Supabase via le `service_role` key.
- Découplage total : le dashboard peut tomber sans affecter le tagging.

**Alternative acceptable** : une API Route Next.js (`/api/sync-tags`) appelée par un Vercel Cron (`vercel.json`). Plus simple à déployer si le dev n'est pas familier avec Deno/Edge Functions. Le trade-off est le timeout de 10s sur Vercel Hobby (suffisant pour 50-100 sessions, insuffisant au-delà).

### 3.2 Flow de données

```
[Supabase viewing_sessions]
        │
        ▼
  Edge Function (cron toutes les heures)
        │
        ├─ 1. SELECT sessions non-taguées avec email
        │     (WHERE tagged_at IS NULL AND viewer.email IS NOT NULL)
        │
        ├─ 2. Pour chaque session :
        │     a. Déterminer le segment (bounce / partial / engaged / completed)
        │     b. GET contact Systeme.io par email
        │     c. POST tag sur le contact
        │     d. UPDATE viewing_sessions SET tagged_at = now()
        │
        └─ 3. Log les résultats (succès, erreurs, contacts non trouvés)
```

### 3.3 Segmentation recommandée

Voici les 4 segments de visionnage. Les seuils sont configurables (stockés dans la table `webinars` ou dans une table `tagging_rules`).

| Segment | Seuil | Nom du tag (template) | Cas d'usage email |
|---|---|---|---|
| `bounce` | < 10% de la vidéo | `wp-{slug}-bounce` | "Vous avez manqué le replay, voici la prochaine session" |
| `partial` | 10% – 49% | `wp-{slug}-partial` | "Vous êtes parti avant le meilleur, voici ce qui vous attend" |
| `engaged` | 50% – 79% | `wp-{slug}-engaged` | "Vous avez presque tout vu, voici l'offre dont on a parlé" |
| `completed` | ≥ 80% | `wp-{slug}-completed` | "Vous avez vu le webinaire en entier, voici votre lien exclusif" |

Le préfixe `wp-` (WebinarPulse) évite les collisions avec les tags existants du compte Systeme.io. Le `{slug}` est le slug du webinaire (ex: `bootcamp-linkedin`), ce qui permet d'avoir des tags distincts par webinaire.

**Règle importante** : un viewer ne doit recevoir que le tag correspondant à son **meilleur** score de visionnage. Si quelqu'un a vu 30% une première fois puis 90% une deuxième fois, il doit avoir le tag `completed`, pas `partial`. L'Edge Function doit donc agréger par (viewer_email, webinar_id) et prendre le max de `max_video_percent`.

---

## 4. Modifications de la base de données

### 4.1 Nouvelle colonne sur `viewing_sessions`

```sql
ALTER TABLE public.viewing_sessions
ADD COLUMN tagged_at TIMESTAMPTZ DEFAULT NULL;
```

`tagged_at` sert de marqueur pour ne pas retraiter les sessions déjà synchronisées. La colonne est NULL tant que la session n'a pas été traitée par l'Edge Function.

### 4.2 Table de configuration des tags

```sql
CREATE TABLE public.tagging_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_id UUID NOT NULL REFERENCES public.webinars(id) ON DELETE CASCADE,
  segment TEXT NOT NULL,               -- 'bounce', 'partial', 'engaged', 'completed'
  min_percent INTEGER NOT NULL,        -- seuil bas (inclus)
  max_percent INTEGER NOT NULL,        -- seuil haut (exclus, sauf pour completed)
  systemeio_tag_name TEXT NOT NULL,    -- nom du tag dans Systeme.io
  systemeio_tag_id TEXT,              -- ID du tag (rempli après création via API)
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.3 Table de log des syncs

```sql
CREATE TABLE public.tagging_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_email TEXT NOT NULL,
  webinar_id UUID NOT NULL REFERENCES public.webinars(id),
  segment TEXT NOT NULL,
  systemeio_tag_name TEXT NOT NULL,
  systemeio_contact_id TEXT,
  status TEXT NOT NULL,                -- 'success', 'contact_not_found', 'api_error', 'rate_limited'
  error_message TEXT,
  processed_at TIMESTAMPTZ DEFAULT now()
);
```

Cette table est essentielle pour le debug et pour le dashboard (afficher l'état de synchronisation).

---

## 5. Edge Function — pseudo-code commenté

```typescript
// supabase/functions/sync-tags/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SYSTEMEIO_API_URL = "https://api.systeme.io/api";
const SYSTEMEIO_API_KEY = Deno.env.get("SYSTEMEIO_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// --- Helpers ---

async function systemeioFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${SYSTEMEIO_API_URL}${path}`, {
    ...options,
    headers: {
      "X-API-Key": SYSTEMEIO_API_KEY,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  // Gérer le rate limit
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") || "5");
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return systemeioFetch(path, options); // retry une fois
  }

  return res;
}

async function findContactByEmail(email: string) {
  // NOTE : vérifier la doc exacte pour le filtrage par email.
  // L'endpoint GET /contacts accepte un paramètre ?email=
  // Si l'API ne supporte pas le filtrage par email directement,
  // il faudra paginer et filtrer côté serveur (peu performant),
  // ou utiliser un cache local (table systemeio_contacts dans Supabase).
  const res = await systemeioFetch(`/contacts?email=${encodeURIComponent(email)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.items?.[0] || null;
}

async function assignTag(contactId: string, tagId: string) {
  const res = await systemeioFetch(`/contacts/${contactId}/tags`, {
    method: "POST",
    body: JSON.stringify({ tagId }),
  });
  return res.ok;
}

async function removeTag(contactId: string, tagId: string) {
  const res = await systemeioFetch(`/contacts/${contactId}/tags/${tagId}`, {
    method: "DELETE",
  });
  return res.ok;
}

// --- Logique principale ---

Deno.serve(async (req) => {
  try {
    // 1. Récupérer les règles de tagging actives
    const { data: rules } = await supabase
      .from("tagging_rules")
      .select("*, webinar:webinars(slug)")
      .eq("enabled", true);

    if (!rules?.length) {
      return new Response(JSON.stringify({ message: "No active rules" }));
    }

    // 2. Récupérer les sessions non-taguées avec email identifié
    //    Agrégées par (viewer_email, webinar_id) avec le MAX de max_video_percent
    const { data: sessions } = await supabase.rpc("get_untagged_sessions");
    // Cette RPC retourne :
    // { viewer_email, webinar_id, best_percent, session_ids[] }

    let processed = 0;
    let errors = 0;

    // 3. Pour chaque viewer/webinaire, déterminer le segment et taguer
    for (const session of sessions || []) {
      // Throttle : 300ms entre chaque appel API
      await new Promise(r => setTimeout(r, 300));

      const webinarRules = rules.filter(r => r.webinar_id === session.webinar_id);
      const segment = webinarRules.find(r =>
        session.best_percent >= r.min_percent &&
        (r.segment === "completed" ? true : session.best_percent < r.max_percent)
      );

      if (!segment) continue;

      // Chercher le contact dans Systeme.io
      const contact = await findContactByEmail(session.viewer_email);

      if (!contact) {
        await supabase.from("tagging_log").insert({
          viewer_email: session.viewer_email,
          webinar_id: session.webinar_id,
          segment: segment.segment,
          systemeio_tag_name: segment.systemeio_tag_name,
          status: "contact_not_found",
        });
        continue;
      }

      // Retirer les anciens tags de ce webinaire (upgrade de segment)
      const otherSegments = webinarRules.filter(
        r => r.segment !== segment.segment && r.systemeio_tag_id
      );
      for (const old of otherSegments) {
        const hasTag = contact.tags?.some(t => t.id === old.systemeio_tag_id);
        if (hasTag) {
          await removeTag(contact.id, old.systemeio_tag_id);
          await new Promise(r => setTimeout(r, 300));
        }
      }

      // Assigner le nouveau tag
      if (segment.systemeio_tag_id) {
        const success = await assignTag(contact.id, segment.systemeio_tag_id);

        await supabase.from("tagging_log").insert({
          viewer_email: session.viewer_email,
          webinar_id: session.webinar_id,
          segment: segment.segment,
          systemeio_tag_name: segment.systemeio_tag_name,
          systemeio_contact_id: contact.id,
          status: success ? "success" : "api_error",
        });

        if (success) processed++;
        else errors++;
      }

      // Marquer les sessions comme traitées
      for (const sid of session.session_ids) {
        await supabase
          .from("viewing_sessions")
          .update({ tagged_at: new Date().toISOString() })
          .eq("id", sid);
      }
    }

    return new Response(JSON.stringify({
      processed,
      errors,
      total: sessions?.length || 0,
    }));
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
```

### 5.1 RPC Supabase nécessaire

```sql
CREATE OR REPLACE FUNCTION get_untagged_sessions()
RETURNS TABLE (
  viewer_email TEXT,
  webinar_id UUID,
  best_percent REAL,
  session_ids UUID[]
) AS $$
  SELECT
    v.email AS viewer_email,
    s.webinar_id,
    MAX(s.max_video_percent) AS best_percent,
    ARRAY_AGG(s.id) AS session_ids
  FROM viewing_sessions s
  JOIN viewers v ON v.id = s.viewer_id
  WHERE s.tagged_at IS NULL
    AND v.email IS NOT NULL
    AND s.max_video_percent > 0
    AND s.started_at < NOW() - INTERVAL '1 hour'  -- attendre 1h après la session
  GROUP BY v.email, s.webinar_id
$$ LANGUAGE SQL;
```

Le filtre `started_at < NOW() - INTERVAL '1 hour'` est important : on ne tague pas une session en cours. On attend que le viewer ait eu le temps de finir ou de partir.

---

## 6. Déclenchement (cron)

### Option A : pg_cron (via Supabase)

```sql
-- Activer l'extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Appeler l'Edge Function toutes les heures
SELECT cron.schedule(
  'sync-webinar-tags',
  '0 * * * *',  -- toutes les heures, à la minute 0
  $$
  SELECT net.http_post(
    url := 'https://nrdiphkwejcghgeemjjb.supabase.co/functions/v1/sync-tags',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key')
    )
  );
  $$
);
```

### Option B : Vercel Cron (si le dev préfère rester dans l'écosystème Next.js)

```json
// vercel.json
{
  "crons": [{
    "path": "/api/sync-tags",
    "schedule": "0 * * * *"
  }]
}
```

Attention : Vercel Hobby a un timeout de 10s pour les API routes. Si tu as beaucoup de sessions à traiter, il faudra soit passer en Vercel Pro (timeout 60s), soit utiliser l'Edge Function Supabase.

---

## 7. Setup initial dans Systeme.io

Avant que le code ne fonctionne, il faut créer les tags dans Systeme.io. Deux approches :

**Approche manuelle** : créer les tags dans le CRM Systeme.io (onglet Tags), puis copier leurs IDs dans la table `tagging_rules`. C'est l'approche la plus sûre pour commencer.

**Approche automatisée** : l'Edge Function peut créer les tags via `POST /api/tags` au premier lancement si `systemeio_tag_id` est NULL dans `tagging_rules`. Mais ça ajoute de la complexité. À réserver pour la v2.

### Tags à créer pour chaque webinaire :

Pour un webinaire avec le slug `bootcamp-masterclass` :
- `wp-bootcamp-masterclass-bounce`
- `wp-bootcamp-masterclass-partial`
- `wp-bootcamp-masterclass-engaged`
- `wp-bootcamp-masterclass-completed`

### Automatisations à configurer dans Systeme.io :

Pour chaque tag, créer une règle d'automatisation :
- **Déclencheur** : "Quand le tag [X] est ajouté à un contact"
- **Action** : "Inscrire le contact à la campagne email [Y]"

---

## 8. Sécurité

### 8.1 La clé API Systeme.io

- Stockée en tant que **secret Supabase** (`SYSTEMEIO_API_KEY`), jamais dans le code, jamais dans les variables d'environnement publiques (pas de `NEXT_PUBLIC_`).
- Accessible uniquement par l'Edge Function via `Deno.env.get()`.
- Si l'approche Vercel Cron est choisie, la stocker dans les Environment Variables Vercel (non-public).

### 8.2 Endpoint de l'Edge Function

- L'Edge Function doit vérifier le JWT (`verify_jwt: true`) pour empêcher les appels non autorisés.
- Le cron pg_cron utilise le `service_role_key` pour s'authentifier.
- Alternative : ajouter un secret partagé dans le header que la fonction vérifie.

### 8.3 Protection contre les doublons

- Le champ `tagged_at` sur `viewing_sessions` empêche le retraitement.
- Avant d'assigner un tag, vérifier si le contact l'a déjà (via les tags retournés par `GET /contacts`).
- La table `tagging_log` permet de tracer et débugger.

---

## 9. Ajouts au dashboard

### 9.1 Indicateur de sync dans la table viewers

Ajouter une colonne "Tag Systeme.io" dans la ViewerTable du dashboard. Elle affiche un badge coloré avec le segment :

- 🟢 `completed` (vert)
- 🟡 `engaged` (jaune)
- 🟠 `partial` (orange)
- 🔴 `bounce` (rouge)
- ⚪ `non synchronisé` (gris) si tagged_at est NULL
- ⚫ `contact introuvable` si le log indique contact_not_found

### 9.2 Page de configuration des tags

Un onglet "Tags" dans le dashboard pour :
- Visualiser les règles de tagging par webinaire.
- Modifier les seuils (10/50/80 par défaut).
- Voir le log des dernières synchronisations.
- Bouton "Synchroniser maintenant" (appel manuel de l'Edge Function).

---

## 10. Points d'attention et pièges

### 10.1 Recherche de contact par email

L'API Systeme.io ne supporte peut-être pas le filtrage par email directement sur `GET /contacts`. Vérifier la doc exacte sur developer.systeme.io. Si ce n'est pas supporté, il y a deux workarounds :

- **Option A** : maintenir un cache local dans Supabase (table `systemeio_contacts` avec email → contactId), peuplé par un sync initial et mis à jour au fil de l'eau. C'est la meilleure option en termes de performance.
- **Option B** : paginer tous les contacts et chercher par email côté serveur. Non viable si la base contacts est grosse (>1000).

> **Update mars 2026** : vérifier si l'endpoint `GET /contacts?email=xxx` est maintenant disponible. La roadmap Systeme.io avait cette feature en demande.

### 10.2 Gestion de l'upgrade de segment

Un viewer peut revenir voir le webinaire et atteindre un meilleur pourcentage. L'Edge Function doit **remplacer** le tag, pas en ajouter un deuxième. Le flow est :

1. Vérifier les tags actuels du contact.
2. Retirer le tag du segment inférieur (s'il existe).
3. Assigner le tag du nouveau segment.

Cela garantit qu'un contact n'a jamais deux tags de segment pour le même webinaire.

### 10.3 Timing

Ne pas taguer une session qui date de moins d'une heure (`started_at < NOW() - INTERVAL '1 hour'`). Cela évite de taguer quelqu'un comme "bounce" alors qu'il est encore en train de regarder.

### 10.4 Sessions sans email

Les sessions anonymes (pas d'email dans l'URL) ne peuvent pas être taguées. C'est normal et attendu. On les ignore silencieusement.

### 10.5 Rate limit Systeme.io

Prévoir un traitement batch raisonnable. Avec 300ms entre chaque appel, on peut traiter ~200 contacts par minute. Si le volume dépasse ça, découper en plusieurs exécutions du cron.

---

## 11. Estimation de charge

| Métrique | Estimation |
|---|---|
| Sessions par jour | 10-50 |
| Sessions avec email identifié | 70-80% |
| Sessions uniques par jour (dédupliquées par email + webinaire) | 7-35 |
| Appels API Systeme.io par sync | 2-3 par viewer (GET contact + DELETE ancien tag + POST nouveau tag) |
| Appels API par heure (au pic) | 15-100 |
| Temps d'exécution Edge Function | 5-30 secondes |

Le volume est très faible. Aucun risque de rate limit avec un cron horaire.

---

## 12. Ordre d'implémentation recommandé

1. **Migration BDD** : ajouter `tagged_at` sur `viewing_sessions`, créer `tagging_rules` et `tagging_log`, créer la RPC `get_untagged_sessions`.
2. **Setup Systeme.io** : créer la clé API, créer les 4 tags par webinaire dans le CRM, noter les IDs.
3. **Peupler `tagging_rules`** : insérer les règles pour chaque webinaire.
4. **Développer l'Edge Function** : implémenter le flow décrit en section 5. Tester manuellement d'abord (`curl` sur l'endpoint).
5. **Configurer le cron** : activer pg_cron ou Vercel Cron.
6. **Configurer les automatisations Systeme.io** : créer les campagnes email déclenchées par l'ajout de chaque tag.
7. **Mettre à jour le dashboard** : ajouter l'indicateur de sync dans la ViewerTable et la page de configuration des tags.
8. **Monitorer** : vérifier les logs pendant 48h pour s'assurer que tout fonctionne.

---

## 13. Variables d'environnement à configurer

| Variable | Où | Valeur |
|---|---|---|
| `SYSTEMEIO_API_KEY` | Supabase Secrets (`supabase secrets set`) | Clé API publique Systeme.io |
| `SUPABASE_URL` | Auto-injecté dans Edge Functions | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injecté dans Edge Functions | — |

Si approche Vercel Cron :
| Variable | Où | Valeur |
|---|---|---|
| `SYSTEMEIO_API_KEY` | Vercel Environment Variables (non-public) | Clé API publique Systeme.io |
| `CRON_SECRET` | Vercel Environment Variables | Secret pour protéger l'endpoint cron |

---

## 14. Ressources

- **API Systeme.io** : https://developer.systeme.io/reference/api
- **Supabase Edge Functions** : https://supabase.com/docs/guides/functions
- **pg_cron** : https://supabase.com/docs/guides/database/extensions/pg_cron
- **Projet Supabase** : "Flow" (ID: `nrdiphkwejcghgeemjjb`, région eu-west-3)
- **Repo WebinarPulse** : projet Next.js 14 déployé sur Vercel
