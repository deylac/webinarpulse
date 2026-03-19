# Template : Rapport d'état MVP WebinarPulse

## 1. Schéma de la base de données

Copie-colle le résultat d'un export du schéma Supabase tel qu'il est en production. Pour chaque table :

- Nom de la table
- Colonnes (nom, type, nullable, default, contraintes)
- Clés primaires et étrangères
- Index
- Policies RLS actives

**Si possible, fournis le SQL de création** (un `pg_dump --schema-only` des tables `public.*`, ou le résultat de `\d+ nom_table` dans psql).

Si des tables de la spec n'ont pas été créées, ou si des colonnes ont été ajoutées/modifiées par rapport à la spec, indique-le explicitement.


## 2. Structure du projet

Fournis le résultat de la commande `tree` (ou équivalent) du projet Next.js, en excluant `node_modules` et `.next`. Pour chaque fichier significatif (composant, page, API route, lib), ajoute une ligne de description.

Exemple de format attendu :

```
webinarpulse/
├── app/
│   ├── layout.js                — Layout racine, metadata, import fonts
│   ├── page.js                  — Page d'accueil, routing vers WebinarList ou Dashboard
│   ├── api/
│   │   ├── script/route.js      — API qui génère le script de tracking
│   │   └── webhook/
│   │       └── (si implémenté)
│   └── globals.css              — Tailwind + custom styles
├── components/
│   ├── Dashboard.js             — Vue analytics principale
│   ├── ScriptGenerator.js       — Wizard de génération des 2 scripts (si implémenté)
│   ├── TrackingScriptModal.js   — Ancien modal (si encore utilisé)
│   ├── RetentionChart.js        — Courbe de rétention SVG
│   ├── ViewerTable.js           — Table des sessions
│   ├── DailyChart.js            — Volume journalier
│   ├── StatCard.js              — Carte de stat
│   ├── WebinarList.js           — Liste des webinaires
│   └── AddWebinarModal.js       — Modal d'ajout de webinaire
├── lib/
│   ├── supabase.js              — Client Supabase
│   └── utils.js                 — Helpers (formatDuration, demo data, etc.)
├── package.json
├── tailwind.config.js
├── next.config.js
└── .env.local                   — Variables d'environnement
```

Indique aussi les dépendances installées (`npm list --depth=0` ou le contenu de `package.json > dependencies`).


## 3. Scripts de tracking en production

Copie-colle le code exact des scripts tels qu'ils sont déployés sur les pages Systeme.io :

### 3.1 Script Optin (page d'inscription)

```html
(coller le code ici)
```

- Sur quelle(s) page(s) est-il installé ?
- Y a-t-il eu des modifications par rapport à la spec ?

### 3.2 Script Tracking (page webinaire)

```html
(coller le code ici)
```

- Sur quelle(s) page(s) est-il installé ?
- Y a-t-il eu des modifications par rapport à la spec ?


## 4. Variables d'environnement

Liste les variables configurées (sans les valeurs sensibles, juste les noms et où elles sont) :

| Variable | Où (Vercel / Supabase / .env.local) | Public ou privée | Utilisée par |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel | Public | Client Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel | Public | Client Supabase |
| ... | ... | ... | ... |


## 5. URLs et domaines

| Élément | URL |
|---|---|
| Dashboard en production | https://... |
| Domaine Systeme.io utilisé | https://....systeme.io |
| Page optin testée | https://....systeme.io/... |
| Page webinaire testée | https://....systeme.io/... |
| Projet Supabase | https://supabase.com/dashboard/project/... |


## 6. Rapport de test fonctionnel

Pour chaque fonctionnalité, indique si ça marche, si ça ne marche pas, ou si c'est non testé. Ajoute un commentaire si nécessaire.

| Fonctionnalité | Statut | Commentaire |
|---|---|---|
| Ajout d'un webinaire dans le dashboard | ✅ / ❌ / 🔶 non testé | |
| Script optin : email capté au submit | ✅ / ❌ / 🔶 | |
| Cookie wp_viewer posé après inscription | ✅ / ❌ / 🔶 | |
| Cookie wp_viewer lu par le script tracking | ✅ / ❌ / 🔶 | |
| Session identifiée (email visible dans le dashboard) | ✅ / ❌ / 🔶 | |
| Session anonyme (fallback sans cookie) | ✅ / ❌ / 🔶 | |
| Événements Vimeo captés (play, pause, timeupdate) | ✅ / ❌ / 🔶 | |
| Durée de visionnage mise à jour en temps réel | ✅ / ❌ / 🔶 | |
| Pourcentage de vidéo vu correct | ✅ / ❌ / 🔶 | |
| Événement page_leave envoyé à la fermeture | ✅ / ❌ / 🔶 | |
| Courbe de rétention affichée correctement | ✅ / ❌ / 🔶 | |
| ViewerTable triable | ✅ / ❌ / 🔶 | |
| Volume journalier affiché | ✅ / ❌ / 🔶 | |
| Filtres par période (7j/30j/90j/tout) | ✅ / ❌ / 🔶 | |
| Bouton "Copier" du script optin | ✅ / ❌ / 🔶 | |
| Bouton "Copier" du script tracking | ✅ / ❌ / 🔶 | |
| Instructions d'installation visibles | ✅ / ❌ / 🔶 | |
| Indicateur de statut (sessions identifiées) | ✅ / ❌ / 🔶 | |
| Mode démo (données simulées) | ✅ / ❌ / 🔶 | |
| Pending_registrations reçoit les inscriptions | ✅ / ❌ / 🔶 | |
| Responsive mobile du dashboard | ✅ / ❌ / 🔶 | |

### Navigateurs testés

| Navigateur | Version | Résultat |
|---|---|---|
| Chrome desktop | ... | OK / KO |
| Safari mobile | ... | OK / KO |
| Firefox | ... | OK / KO |
| ... | ... | ... |


## 7. Limites et bugs connus

Liste ici tout ce qui ne fonctionne pas comme prévu ou qui est fragile :

```
- [BUG] Description du bug, étapes pour reproduire, comportement attendu vs observé
- [LIMITE] Description de la limite (ex: "le cookie expire après 24h, les viewers qui reviennent après sont anonymes")
- [FRAGILE] Description de ce qui marche mais pourrait casser (ex: "le retry Vimeo après 2s fonctionne mais pas testé sur des pages très lentes")
```


## 8. Données actuelles en base

Fournis les résultats de ces requêtes SQL :

```sql
-- Nombre de sessions et taux d'identification
SELECT 
  COUNT(*) as total_sessions,
  COUNT(CASE WHEN v.email IS NOT NULL THEN 1 END) as identified,
  COUNT(CASE WHEN v.email IS NULL THEN 1 END) as anonymous
FROM viewing_sessions s
JOIN viewers v ON v.id = s.viewer_id;

-- Nombre d'événements par type
SELECT event_type, COUNT(*) 
FROM viewing_events 
GROUP BY event_type 
ORDER BY COUNT(*) DESC;

-- Nombre de webinaires configurés
SELECT id, name, slug, video_duration_seconds 
FROM webinars;

-- Inscriptions captées par le script optin
SELECT COUNT(*) as total, 
  COUNT(CASE WHEN matched THEN 1 END) as matched 
FROM pending_registrations;
```


## 9. Ce qui n'a pas été implémenté (par rapport aux specs)

Liste les éléments des specs qui n'ont pas été implémentés, volontairement ou non :

```
- [ ] Fonctionnalité X — Raison : pas prioritaire / bloqué par Y / pas compris
- [ ] Fonctionnalité Y — Raison : ...
```


## 10. Questions ou suggestions du dev

Si le dev a des questions, des doutes sur l'architecture, ou des suggestions d'amélioration basées sur ce qu'il a vu en implémentant, c'est l'endroit pour les noter. Toute observation est bienvenue.
