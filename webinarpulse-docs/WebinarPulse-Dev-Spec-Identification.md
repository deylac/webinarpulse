# WebinarPulse — Spec développeur
## Feature : Identification des viewers via cookie first-party + Générateur de scripts frontend

**Date** : 19 mars 2026
**Destinataire** : Développeur en charge de l'implémentation
**Priorité** : P0 (bloquant pour l'attribution achat/visionnage)
**Dépendances** : App Next.js déployée sur Vercel, Supabase projet "Flow"

---

## 1. Contexte

WebinarPulse est une app d'analytics pour webinaires evergreen sur Systeme.io. Un script de tracking est injecté dans les pages webinaire Systeme.io pour mesurer le visionnage des vidéos Vimeo.

**Problème actuel** : Le tracking fonctionne (18 sessions enregistrées, 153 événements), mais aucune session n'est identifiée. Toutes sont anonymes parce que Systeme.io ne transmet pas l'email du contact dans l'URL quand il redirige vers la page du webinaire.

**Solution retenue** : Deux scripts JavaScript, injectés via les codes de suivi Systeme.io, qui travaillent ensemble via un cookie first-party. L'utilisateur de l'app (le propriétaire du webinaire) n'a rien à modifier dans sa configuration Systeme.io à part coller les scripts. L'app doit générer ces scripts automatiquement et guider l'utilisateur pour l'installation.

---

## 2. Vue d'ensemble de l'architecture

```
┌──────────────────────────────────────────────────────────┐
│  SYSTEME.IO (même domaine *.systeme.io)                  │
│                                                          │
│  ┌─────────────────┐     ┌─────────────────────────┐     │
│  │ Page optin       │────▶│ Page webinaire           │     │
│  │                  │     │                          │     │
│  │ SCRIPT OPTIN     │     │ SCRIPT TRACKING          │     │
│  │ • Écoute submit  │     │ • Lit cookie wp_viewer   │     │
│  │ • Capte email    │     │ • Crée session identifiée│     │
│  │ • Pose cookie    │     │ • Tracke Vimeo events    │     │
│  │   wp_viewer      │     │ • Envoie à Supabase      │     │
│  │ • Envoie à SB    │     │                          │     │
│  └─────────────────┘     └─────────────────────────┘     │
│         │                         │                      │
│         │ Cookie first-party      │                      │
│         │ partagé (même domaine)  │                      │
│         └─────────────────────────┘                      │
└──────────────────────────────────────────────────────────┘
                    │                │
                    ▼                ▼
         ┌───────────────────────────────┐
         │  SUPABASE (projet Flow)       │
         │  • pending_registrations      │
         │  • viewers                    │
         │  • viewing_sessions           │
         │  • viewing_events             │
         └───────────────────────────────┘
                    │
                    ▼
         ┌───────────────────────────────┐
         │  DASHBOARD (Next.js / Vercel) │
         │  • Générateur de scripts      │
         │  • Analytics                  │
         └───────────────────────────────┘
```

Le cookie `wp_viewer` est posé sur le domaine Systeme.io de l'utilisateur. Comme la page optin et la page webinaire sont sur le même domaine (ex: `monsite.systeme.io`), le cookie est automatiquement partagé. Pas de cross-domain, pas de page intermédiaire.

---

## 3. Ce qui existe déjà

### 3.1 Base de données Supabase (projet "Flow", ID: nrdiphkwejcghgeemjjb)

Tables existantes et utilisées par cette feature :

| Table | Rôle | Lignes actuelles |
|---|---|---|
| `webinars` | Configuration des webinaires (id, name, slug, vimeo_video_id, video_duration_seconds, systemeio_url) | 4 |
| `viewers` | Contacts identifiés ou anonymes (id, email, anonymous_id) | 18 |
| `viewing_sessions` | Sessions de visionnage (webinar_id, viewer_id, max_video_percent, duration_seconds, tagged_at) | 18 |
| `viewing_events` | Événements granulaires (session_id, event_type, video_seconds, video_percent) | 153 |
| `pending_registrations` | Inscriptions captées par le script optin (email, webinar_slug, matched, matched_session_id) | 0 |
| `purchases` | Achats reçus par webhook (viewer_id, email, product_name, product_price) | 0 |

RLS activé sur toutes les tables avec des policies open (insert/select/update pour anon). Les scripts client utilisent la clé anon Supabase.

### 3.2 Dashboard existant

App Next.js 14 (App Router) avec Tailwind CSS. Composants existants :
- `WebinarList.js` : liste des webinaires sur la page d'accueil
- `Dashboard.js` : vue analytics d'un webinaire (stats, rétention, viewers, volume)
- `TrackingScriptModal.js` : modal qui affiche un script de tracking à copier

### 3.3 Script de tracking actuel

Le script actuel (dans `TrackingScriptModal.js`) crée un viewer anonyme et une session, puis écoute les événements Vimeo. Il cherche l'email dans `?email=`, `?contact_email=` ou `?e=` dans l'URL, mais Systeme.io ne les fournit pas.

---

## 4. Ce qu'il faut construire

### 4.1 Côté backend (Supabase)

Rien à créer. Toutes les tables nécessaires existent déjà (cf. section 3.1). La table `pending_registrations` est prête à recevoir les inscriptions.

### 4.2 Côté frontend (Dashboard Next.js)

Modifier le composant `TrackingScriptModal` (ou le remplacer) par un nouveau composant `ScriptGenerator` qui :

1. Génère **deux scripts** (optin + tracking) au lieu d'un seul.
2. Affiche des **instructions visuelles étape par étape** pour guider l'utilisateur dans l'installation.
3. Permet de **copier chaque script** individuellement.
4. Affiche un **statut de connexion** (est-ce que le script envoie des données ?).

---

## 5. Spécification du composant ScriptGenerator

### 5.1 Emplacement

Accessible depuis la vue Dashboard d'un webinaire via un bouton "Installer le tracking" (remplace ou complète le bouton "Script" actuel).

### 5.2 UI — Step-by-step wizard

Le composant affiche un wizard en 2 étapes avec des instructions visuelles.

#### Étape 1 : Script Optin

**Titre** : "Étape 1 — Script d'identification (page d'inscription)"

**Description** : "Collez ce script dans votre page d'inscription (optin) pour capturer l'email des viewers au moment de leur inscription."

**Instructions visuelles** (liste numérotée avec captures ou descriptions) :
1. Dans Systeme.io, ouvrez votre tunnel de vente.
2. Sélectionnez la page d'inscription (optin).
3. Cliquez sur "Edit page" pour ouvrir l'éditeur.
4. Cliquez sur "Settings" (icône engrenage, en haut à gauche).
5. Descendez jusqu'à la section "Tracking" (Codes de suivi).
6. Collez le script ci-dessous dans le champ "Body".
7. Sauvegardez.

**Bloc de code** : le script optin pré-rempli avec les valeurs du webinaire sélectionné (slug, Supabase URL, Supabase anon key). Bouton "Copier" avec feedback visuel.

#### Étape 2 : Script Tracking

**Titre** : "Étape 2 — Script de tracking (page du webinaire)"

**Description** : "Collez ce script dans votre page webinaire pour mesurer le visionnage de la vidéo Vimeo."

**Instructions** : identiques à l'étape 1, mais pour la page du webinaire au lieu de la page optin.

**Bloc de code** : le script tracking pré-rempli avec les valeurs du webinaire (ID, Supabase URL, Supabase anon key). Bouton "Copier".

**Avertissement** : "Si vous aviez déjà un script de tracking WebinarPulse sur cette page, remplacez-le par cette nouvelle version."

#### Indicateur de statut

Sous les deux étapes, afficher un indicateur :
- 🔴 "Aucune session détectée" (si aucune session pour ce webinaire)
- 🟡 "Sessions détectées mais aucune identifiée" (sessions avec email = null uniquement)
- 🟢 "Tracking actif — X sessions identifiées sur Y total" (au moins une session avec email)

Cet indicateur se rafraîchit toutes les 30 secondes ou au clic sur "Vérifier".

### 5.3 Génération dynamique des scripts

Les scripts ne sont PAS statiques. Ils sont générés dynamiquement à partir des données du webinaire sélectionné. Les variables injectées sont :

**Script Optin** :
- `SB_URL` : URL du projet Supabase (constante, `https://nrdiphkwejcghgeemjjb.supabase.co`)
- `SB_KEY` : clé anon Supabase (constante)
- `WEBINAR_SLUG` : le slug du webinaire (ex: `bootcamp-masterclass`)

**Script Tracking** :
- `SB_URL` : idem
- `SB_KEY` : idem
- `WEBINAR_ID` : l'UUID du webinaire (ex: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)

L'utilisateur n'a rien à modifier manuellement dans les scripts. Tout est pré-rempli.

---

## 6. Code des scripts à générer

### 6.1 Script Optin (template)

```javascript
function generateOptinScript(webinar) {
  return `<!-- WebinarPulse — Identification (page optin) -->
<script>
(function() {
  var SB_URL = "${SUPABASE_URL}";
  var SB_KEY = "${SUPABASE_ANON_KEY}";
  var WEBINAR_SLUG = "${webinar.slug}";

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

    // Cookie first-party (partagé avec la page webinaire, même domaine)
    var data = JSON.stringify({
      email: email,
      firstName: firstName,
      slug: WEBINAR_SLUG,
      ts: Date.now()
    });
    document.cookie = "wp_viewer=" + encodeURIComponent(data)
      + "; path=/; max-age=86400; SameSite=Lax";

    // Envoi à Supabase (ne bloque pas la redirection)
    fetch(SB_URL + "/rest/v1/pending_registrations", {
      method: "POST",
      headers: {
        "apikey": SB_KEY,
        "Authorization": "Bearer " + SB_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        email: email,
        webinar_slug: WEBINAR_SLUG,
        first_name: firstName,
        source: "form_intercept"
      }),
      keepalive: true
    }).catch(function() {});
  }, true);
})();
<\/script>`;
}
```

### 6.2 Script Tracking (template)

```javascript
function generateTrackingScript(webinar) {
  return `<!-- WebinarPulse — Tracking (page webinaire) -->
<script src="https://player.vimeo.com/api/player.js"><\/script>
<script>
(function() {
  var SB_URL = "${SUPABASE_URL}";
  var SB_KEY = "${SUPABASE_ANON_KEY}";
  var WEBINAR_ID = "${webinar.id}";

  var sessionId = null;
  var lastUpdate = 0;
  var maxSec = 0;
  var maxPct = 0;

  // --- Lire le cookie wp_viewer ---
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    if (match) {
      try { return JSON.parse(decodeURIComponent(match[2])); }
      catch(e) { return null; }
    }
    return null;
  }

  function getViewerEmail() {
    // Priorité 1 : cookie posé par le script optin
    var cookie = getCookie("wp_viewer");
    if (cookie && cookie.email) return cookie.email;

    // Priorité 2 : paramètre dans l'URL (fallback)
    var params = new URLSearchParams(window.location.search);
    return params.get("email")
      || params.get("contact_email")
      || params.get("e")
      || null;
  }

  function sb(path, method, body, extraHeaders) {
    var h = {
      "apikey": SB_KEY,
      "Authorization": "Bearer " + SB_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    };
    if (extraHeaders) for (var k in extraHeaders) h[k] = extraHeaders[k];
    return fetch(SB_URL + "/rest/v1/" + path, {
      method: method || "GET", headers: h,
      body: body ? JSON.stringify(body) : undefined
    }).then(function(r) { return r.json(); });
  }

  function initSession() {
    var email = getViewerEmail();
    var anonId = "anon-" + Math.random().toString(36).substr(2, 12);

    var viewerData = email
      ? { email: email, anonymous_id: null }
      : { email: null, anonymous_id: anonId };

    sb("viewers", "POST", viewerData,
      { "Prefer": "return=representation,resolution=merge-duplicates" }
    )
    .then(function(v) {
      var vid = Array.isArray(v) ? v[0].id : v.id;
      return sb("viewing_sessions", "POST", {
        webinar_id: WEBINAR_ID,
        viewer_id: vid,
        user_agent: navigator.userAgent,
        referrer: document.referrer || null
      });
    })
    .then(function(s) {
      sessionId = Array.isArray(s) ? s[0].id : s.id;
      initPlayer();
    })
    .catch(function(e) { console.warn("WebinarPulse:", e); });
  }

  function sendEvent(type, sec, pct) {
    if (!sessionId) return;
    sb("viewing_events", "POST", {
      session_id: sessionId, event_type: type,
      video_seconds: sec || 0, video_percent: pct || 0
    }).catch(function() {});
  }

  function updateSession(sec, pct) {
    if (!sessionId) return;
    if (sec > maxSec) maxSec = sec;
    if (pct > maxPct) maxPct = pct;
    var now = Date.now();
    if (now - lastUpdate < 10000) return;
    lastUpdate = now;
    fetch(SB_URL + "/rest/v1/viewing_sessions?id=eq." + sessionId, {
      method: "PATCH",
      headers: {
        "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY,
        "Content-Type": "application/json", "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        duration_seconds: Math.round(maxSec),
        max_video_percent: Math.round(maxPct * 100),
        max_video_seconds: Math.round(maxSec),
        ended_at: new Date().toISOString()
      })
    }).catch(function() {});
  }

  function initPlayer() {
    var iframes = document.querySelectorAll("iframe[src*='vimeo']");
    if (!iframes.length) {
      setTimeout(function() {
        iframes = document.querySelectorAll("iframe[src*='vimeo']");
        if (iframes.length) setupPlayer(iframes[0]);
      }, 2000);
      return;
    }
    setupPlayer(iframes[0]);
  }

  function setupPlayer(iframe) {
    var player = new Vimeo.Player(iframe);

    player.on("play", function(d) {
      sendEvent("play", d.seconds, d.percent);
    });
    player.on("pause", function(d) {
      sendEvent("pause", d.seconds, d.percent);
      updateSession(d.seconds, d.percent);
    });
    player.on("seeked", function(d) {
      sendEvent("seeked", d.seconds, d.percent);
    });
    player.on("timeupdate", function(d) {
      updateSession(d.seconds, d.percent);
    });
    player.on("ended", function(d) {
      sendEvent("ended", d.seconds, 1);
      updateSession(d.seconds, 1);
    });

    document.addEventListener("visibilitychange", function() {
      player.getCurrentTime().then(function(sec) {
        player.getDuration().then(function(dur) {
          var pct = dur > 0 ? sec / dur : 0;
          sendEvent(document.hidden ? "page_hidden" : "page_visible", sec, pct);
          if (document.hidden) updateSession(sec, pct);
        });
      });
    });

    window.addEventListener("beforeunload", function() {
      fetch(SB_URL + "/rest/v1/viewing_sessions?id=eq." + sessionId, {
        method: "PATCH",
        headers: {
          "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY,
          "Content-Type": "application/json", "Prefer": "return=minimal"
        },
        body: JSON.stringify({
          duration_seconds: Math.round(maxSec),
          max_video_percent: Math.round(maxPct * 100),
          max_video_seconds: Math.round(maxSec),
          ended_at: new Date().toISOString()
        }),
        keepalive: true
      }).catch(function() {});

      navigator.sendBeacon(
        SB_URL + "/rest/v1/viewing_events",
        new Blob([JSON.stringify({
          session_id: sessionId, event_type: "page_leave",
          video_seconds: maxSec, video_percent: maxPct
        })], { type: "application/json" })
      );
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initSession);
  else initSession();
})();
<\/script>`;
}
```

**Note importante pour le dev** : dans les template literals ci-dessus, les `${SUPABASE_URL}`, `${SUPABASE_ANON_KEY}`, `${webinar.slug}` et `${webinar.id}` sont des variables JavaScript côté frontend (pas des variables d'environnement). Les valeurs `SUPABASE_URL` et `SUPABASE_ANON_KEY` sont les constantes publiques du projet :
- `SUPABASE_URL` = `https://nrdiphkwejcghgeemjjb.supabase.co`
- `SUPABASE_ANON_KEY` = la clé anon publique (déjà utilisée côté client dans l'app)

Les valeurs `webinar.slug` et `webinar.id` viennent de l'objet webinaire sélectionné dans le dashboard.

---

## 7. Spécification UI du composant ScriptGenerator

### 7.1 Structure

```
┌─────────────────────────────────────────────────────────┐
│  Installer le tracking                              [X] │
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │ ÉTAPE 1 — Page d'inscription                        ││
│  │                                                     ││
│  │ Ce script capture l'email de vos visiteurs au       ││
│  │ moment de leur inscription. Il ne modifie pas le    ││
│  │ comportement de votre page.                         ││
│  │                                                     ││
│  │ Où le coller :                                      ││
│  │ ┌─────────────────────────────────────────────────┐ ││
│  │ │ 1. Systeme.io > Tunnels > votre tunnel          │ ││
│  │ │ 2. Sélectionnez la page optin                   │ ││
│  │ │ 3. Edit page > Settings (engrenage)             │ ││
│  │ │ 4. Section "Tracking" > champ "Body"            │ ││
│  │ │ 5. Collez le script, puis sauvegardez           │ ││
│  │ └─────────────────────────────────────────────────┘ ││
│  │                                                     ││
│  │ ┌─────────────────────────────────────┐             ││
│  │ │ <!-- WebinarPulse — Identif... -->  │  [Copier]   ││
│  │ │ <script>                            │             ││
│  │ │ (function() {                       │             ││
│  │ │   var SB_URL = "https://nrd...      │             ││
│  │ │   ...                               │             ││
│  │ └─────────────────────────────────────┘             ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │ ÉTAPE 2 — Page du webinaire                         ││
│  │                                                     ││
│  │ Ce script mesure le visionnage de la vidéo Vimeo    ││
│  │ et identifie le viewer grâce au cookie posé à       ││
│  │ l'étape 1.                                          ││
│  │                                                     ││
│  │ Où le coller :                                      ││
│  │ ┌─────────────────────────────────────────────────┐ ││
│  │ │ Même procédure que l'étape 1, mais sur la       │ ││
│  │ │ page du webinaire (celle avec la vidéo Vimeo)   │ ││
│  │ └─────────────────────────────────────────────────┘ ││
│  │                                                     ││
│  │ ⚠️ Si un ancien script WebinarPulse est déjà en    ││
│  │ place, remplacez-le par celui-ci.                   ││
│  │                                                     ││
│  │ ┌─────────────────────────────────────┐             ││
│  │ │ <!-- WebinarPulse — Tracking... --> │  [Copier]   ││
│  │ │ <script src="https://player...      │             ││
│  │ │ ...                                 │             ││
│  │ └─────────────────────────────────────┘             ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │ Statut : 🟡 Sessions détectées mais non identifiées ││
│  │ 18 sessions — 0 identifiées                         ││
│  │                                    [Vérifier]       ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 7.2 Comportement du bouton "Copier"

- Au clic : copie le script dans le presse-papier via `navigator.clipboard.writeText()`.
- Feedback : le bouton change de texte "Copier" → "Copié ✓" pendant 2.5 secondes, avec changement de couleur (indigo → vert).

### 7.3 Indicateur de statut

L'indicateur fait une requête Supabase à l'affichage du composant et au clic sur "Vérifier" :

```javascript
// Requête pour le statut
const { data: sessions } = await supabase
  .from("viewing_sessions")
  .select("id, viewer:viewers(email)")
  .eq("webinar_id", webinar.id);

const total = sessions?.length || 0;
const identified = sessions?.filter(s => s.viewer?.email).length || 0;

// Logique d'affichage
if (total === 0) → 🔴 "Aucune session détectée"
if (total > 0 && identified === 0) → 🟡 "Sessions détectées mais non identifiées"
if (identified > 0) → 🟢 "Tracking actif — {identified} sessions identifiées sur {total}"
```

---

## 8. Comment le script optin fonctionne (détail technique)

### 8.1 Interception du formulaire

Le script utilise `addEventListener("submit", ..., true)` avec `true` pour la phase de capture. Cela garantit que notre handler s'exécute avant celui de Systeme.io. L'appel `fetch()` avec `keepalive: true` survit à la navigation (la redirection de Systeme.io ne l'interrompt pas).

### 8.2 Le cookie wp_viewer

**Format** : JSON encodé en URI, stocké dans un cookie first-party.
```json
{
  "email": "viewer@example.com",
  "firstName": "Marie",
  "slug": "bootcamp-masterclass",
  "ts": 1710835200000
}
```

**Paramètres du cookie** :
- `path=/` : accessible sur toutes les pages du domaine
- `max-age=86400` : expire après 24h
- `SameSite=Lax` : compatible avec les redirections navigateur
- Pas de `Secure` flag (Systeme.io peut servir en HTTP dans certains cas)
- Pas de `HttpOnly` (le script tracking JS doit pouvoir le lire)

**Pourquoi ça fonctionne** : les deux pages (optin et webinaire) sont sur le même domaine `*.systeme.io` (confirmé par le client). Un cookie posé sur `monsite.systeme.io` est lisible par toutes les pages de `monsite.systeme.io`.

### 8.3 Envoi à pending_registrations

En parallèle du cookie, le script envoie l'email à la table `pending_registrations` dans Supabase. Ceci sert de backup et de log : même si le cookie est bloqué ou effacé, l'inscription est enregistrée.

---

## 9. Comment le script tracking fonctionne (détail technique)

### 9.1 Séquence d'identification

Au chargement de la page webinaire, le script exécute dans cet ordre :

1. **Chercher le cookie `wp_viewer`** : si trouvé et contient un email valide, l'utiliser.
2. **Chercher un paramètre d'URL** (`?email=`, `?contact_email=`, `?e=`) : fallback au cas où quelqu'un arrive via un lien avec email dans l'URL.
3. **Si aucun email** : créer une session anonyme (comportement actuel).

### 9.2 Création du viewer (upsert)

Le viewer est créé via un upsert PostgREST : si un viewer avec cet email existe déjà, on le réutilise (header `Prefer: resolution=merge-duplicates`). Si c'est un nouveau email, un nouveau viewer est créé. Si c'est anonyme, un viewer avec `anonymous_id` est créé.

### 9.3 Retry sur le player Vimeo

Le script tente de trouver l'iframe Vimeo au chargement. Si l'iframe n'est pas encore dans le DOM (chargement asynchrone par Systeme.io), il réessaie après 2 secondes. C'est important car Systeme.io peut charger le contenu de la page de manière dynamique.

---

## 10. Cas limites à gérer

| Cas | Comportement attendu |
|---|---|
| Viewer qui s'inscrit et regarde immédiatement | Cookie posé → tracking identifié ✅ |
| Viewer qui s'inscrit, part, revient le lendemain | Cookie expiré (24h). Session anonyme, sauf s'il repasse par la page optin |
| Viewer qui arrive directement sur la page webinaire (lien partagé, bookmark) | Pas de cookie. Session anonyme |
| Viewer qui s'inscrit sur mobile, regarde sur desktop | Pas de cookie partagé entre devices. Session anonyme sur desktop |
| Viewer qui a un bloqueur de cookies | Cookie non posé. L'email est quand même dans `pending_registrations` mais le tracking sur la page webinaire sera anonyme |
| Deux viewers différents sur le même navigateur | Le deuxième cookie écrase le premier. Le premier viewer est déjà en session. Le deuxième sera correctement identifié. Pas de conflit. |
| Navigateur en mode privé | Cookie fonctionne normalement dans la session de navigation privée. Mais ne persiste pas après fermeture. |
| Double soumission du formulaire | Deux entrées dans `pending_registrations` (pas grave, c'est dédupliqué par l'upsert viewers). Cookie écrasé avec les mêmes données. |

---

## 11. Modifications des composants existants

### 11.1 Remplacer TrackingScriptModal par ScriptGenerator

Le composant `TrackingScriptModal.js` actuel affiche un seul script. Il doit être remplacé (ou refactorisé) par le nouveau composant `ScriptGenerator` décrit en section 7.

**Fichiers à modifier/créer** :
- `components/ScriptGenerator.js` (nouveau) : le wizard step-by-step
- `components/Dashboard.js` : remplacer l'appel à `TrackingScriptModal` par `ScriptGenerator`

L'ancien `TrackingScriptModal.js` peut être supprimé ou gardé comme référence.

### 11.2 Ajouter l'indicateur de statut dans la vue webinaire

Dans la barre de stats en haut du dashboard (les 4 cartes StatCard), ajouter une indication du taux d'identification :

```
Identifiés : X / Y sessions (Z%)
```

Colorer en vert si >50%, jaune si 10-50%, rouge si <10%.

---

## 12. Considérations pour un usage multi-utilisateurs

Le document mentionne que l'app doit être "utilisable par n'importe qui". Voici les points à anticiper :

### 12.1 Les constantes Supabase sont hardcodées dans les scripts

Actuellement, les scripts contiennent l'URL et la clé anon du projet Supabase "Flow". Si l'app doit devenir un SaaS multi-tenant, chaque utilisateur devrait avoir ses propres credentials. Mais pour la version actuelle (usage interne Superproductif), le hardcoding est acceptable.

### 12.2 Le slug et l'ID du webinaire sont pré-remplis

L'utilisateur n'a rien à modifier dans les scripts. C'est essentiel pour l'UX : quelqu'un de non-technique doit pouvoir copier et coller sans comprendre le code.

### 12.3 Instructions en français

Toutes les instructions doivent être en français. Le guide d'installation dans le frontend est l'interface entre l'app et l'utilisateur non-technique.

---

## 13. Tests à effectuer

### 13.1 Test d'intégration complet

1. Ouvrir la page optin en navigation privée.
2. S'inscrire avec un email test (ex: `test-dev@webinarpulse.com`).
3. Vérifier dans Supabase :
   - Une ligne dans `pending_registrations` avec l'email test.
   - Le cookie `wp_viewer` est visible dans les DevTools du navigateur (Application > Cookies).
4. Systeme.io redirige vers la page webinaire.
5. Vérifier dans Supabase :
   - Un viewer avec l'email test dans `viewers`.
   - Une session dans `viewing_sessions` avec `viewer_id` pointant vers le viewer identifié.
6. Regarder quelques minutes de vidéo.
7. Vérifier dans Supabase :
   - `max_video_percent` > 0 sur la session.
   - Des événements dans `viewing_events`.
8. Quitter la page.
9. Vérifier : un événement `page_leave` dans `viewing_events`.

### 13.2 Test de régression

- Vérifier que les sessions anonymes continuent de fonctionner (arriver sur la page webinaire sans passer par l'optin).
- Vérifier que Systeme.io fonctionne normalement (contact enregistré, tags appliqués, campagne envoyée).

### 13.3 Test du dashboard

- Le statut dans ScriptGenerator passe de 🟡 à 🟢 après le test.
- La ViewerTable affiche l'email au lieu de "Anonyme" pour la session test.

---

## 14. Récapitulatif des livrables

| Livrable | Type | Description |
|---|---|---|
| `ScriptGenerator.js` | Composant React | Wizard 2 étapes avec génération de scripts, boutons copier, instructions visuelles, indicateur de statut |
| Modification de `Dashboard.js` | Modification | Remplacer l'appel à TrackingScriptModal par ScriptGenerator |
| Indicateur d'identification dans les stats | Modification | Ajouter le ratio identifiés/total dans la barre de stats |
| Tests | Manuel | Flow complet inscription → visionnage → vérification BDD |

Pas de migration BDD nécessaire. Pas de nouvelle API route. Pas de modification du backend. Tout se passe côté frontend (génération des scripts) et côté client (exécution des scripts dans le navigateur du viewer sur les pages Systeme.io).
