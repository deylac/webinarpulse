# Plan d'Implémentation — Diagnostic IA Avancé

> Objectif : transformer le diagnostic IA de WebinarPulse en un outil d'analyse de funnel complet, basé sur des benchmarks réels et des données multi-dimensionnelles.

---

## Phase 1 — Benchmarks & Prompt Engineering
**Effort : faible | Impact : fort | Aucune donnée supplémentaire nécessaire**

### Objectif
Injecter les benchmarks du document de référence dans le prompt pour que l'IA compare les métriques du webinaire à des standards de l'industrie et donne des ratings (UNDERPERFORMING / AVERAGE / GOOD / EXCELLENT).

### Changements

#### [MODIFY] `app/api/generate-diagnostic/route.js`

**1. Injecter les benchmarks dans le prompt :**
Le fichier `webinar-benchmarks-reference.md` contient les seuils par étape du funnel. L'idée est de créer un bloc de benchmarks condensé, directement dans le prompt :
```
BENCHMARKS EVERGREEN :
- Rétention jusqu'au pitch : <50% = mauvais, 50-60% = moyen, 60-70% = bon, >70% = excellent
- CTA click rate : <5% = mauvais, 5-10% = moyen, 10-17% = bon, >17% = excellent
- Durée idéale : 45-60 min. Au-delà de 60 min, chaque minute supplémentaire réduit la rétention
- Engagement moyen on-demand : 33 min (GoToWebinar 2023)
```

**2. Structurer le prompt en 3 axes :**
Au lieu d'un prompt libre "donne-moi 5 points", demander à l'IA d'analyser selon :
- **Axe Rétention** : comparer la courbe de rétention aux benchmarks, identifier les drops critiques
- **Axe Structure** : évaluer le timing du pitch (idéalement 60-70% de la vidéo), la durée des sections, les transitions
- **Axe Conversion** : analyser le taux CTA click, le moment du CTA par rapport au pitch

**3. Demander un rating global :**
Le prompt demande un score par axe + un rating inspiré du Quick Evaluation Template du doc de référence.

### Format de sortie enrichi
```json
[
  { "emoji": "📊", "title": "Score global : BON (72/100)", "detail": "...", "type": "info" },
  { "emoji": "🎯", "title": "Rétention : MOYEN — 55% restent au pitch", "detail": "Benchmark: 60-70%. Votre hook retient bien (85% à 5 min) mais le milieu du webinaire perd 30% des viewers...", "type": "warning" },
  ...
]
```

---

## Phase 2 — Données Acheteurs vs Non-Acheteurs
**Effort : moyen | Impact : très fort | Nécessite un join sessions ↔ purchases**

### Objectif
Ajouter dans le prompt la comparaison entre le comportement de visionnage des **acheteurs** et celui des **non-acheteurs**. C'est l'insight le plus actionnable possible.

### Changements

#### [MODIFY] `components/DiagnosticPanel.js`

**1. Calculer les stats segmentées :**
```
Acheteurs (15 viewers) :
- Durée moyenne : 48 min (vs 12 min pour les non-acheteurs)
- Progression moyenne : 78% (vs 22%)
- 85% ont dépassé le chapitre "Démonstration"
- 93% ont vu le pitch

Non-acheteurs (62 viewers) :
- 45% décrochent avant 10 min
- Seulement 15% atteignent le pitch
```

Pour faire ce calcul, il faut :
- Joindre `viewing_sessions` → `viewers` (email) → `purchases` (email)
- Séparer les sessions en 2 groupes : ceux dont l'email apparaît dans `purchases` vs les autres
- Calculer durée/progression/rétention pour chaque groupe

#### [MODIFY] `app/api/generate-diagnostic/route.js`

**2. Enrichir le prompt :**
Ajouter un bloc dans le prompt :
```
Comportement acheteurs vs non-acheteurs :
- Les acheteurs ont regardé en moyenne X min (Y%) vs Z min (W%) pour les non-acheteurs
- X% des acheteurs ont dépassé le chapitre "[pitch]"
- Le "point de bascule" (seuil de visionnage au-delà duquel les viewers achètent) est à X%
```

**3. Demander à l'IA d'identifier le "point de bascule" :**
Le prompt demande : "Identifie le seuil de visionnage au-delà duquel un viewer a une forte probabilité d'acheter. Ce seuil correspond au moment où le contenu a suffisamment convaincu le viewer."

### Nouveau : indicateur de "Point de Bascule" dans le dashboard
Afficher une ligne verticale sur la courbe de rétention indiquant le "breakpoint" : le % de vidéo au-delà duquel la probabilité d'achat augmente significativement. Donnée très visuelle et actionnelle.

---

## Phase 3 — Analyse du Contenu via le Transcript
**Effort : moyen | Impact : fort | Nécessite un double appel IA**

### Objectif
Utiliser le transcript déjà uploadé pour que l'IA puisse critiquer le **contenu** du webinaire, pas seulement les métriques.

### Changements

#### [MODIFY] `components/DiagnosticPanel.js`

**1. Appel IA de résumé (étape 1) :**
Avant le diagnostic, faire un premier appel IA pour résumer chaque chapitre du transcript en 1-2 phrases. Le transcript complet étant trop long pour un seul prompt, on le découpe par chapitre et on résume.

```
Entrée : transcript brut du chapitre "Accroche" (0-120s)
Sortie : "Le présentateur commence par une statistique choc sur l'IA, 
          puis pose une question rhétorique sur l'avenir du métier."
```

#### [MODIFY] `app/api/generate-diagnostic/route.js`

**2. Appel IA de diagnostic enrichi (étape 2) :**
Le prompt reçoit maintenant :
- Les métriques (rétention, stats globales, acheteurs vs non-acheteurs)
- Les résumés de contenu par chapitre
- Les benchmarks

L'IA peut alors dire :
> "Le chapitre 'Démonstration 3' perd 25% des viewers. Son contenu (résumé : 'présentation d'un cas client technique') est trop dense. Les benchmarks montrent qu'au-delà de 3 démos, l'engagement chute. Recommandation : condensez les démonstrations 2 et 3 en une seule plus percutante."

### Architecture du double appel
```
Chapitre 1 transcript → Résumé 1 ─┐
Chapitre 2 transcript → Résumé 2 ─┤
Chapitre 3 transcript → Résumé 3 ─┼──→ Prompt diagnostic complet
...                                │     + métriques
Benchmarks ────────────────────────┘     + acheteurs vs non-acheteurs
```

> [!IMPORTANT]
> Pour optimiser le coût et la latence, le résumé peut être fait en un seul appel avec tous les chapitres, pas un appel par chapitre. Utiliser un modèle rapide (Haiku) pour le résumé et un modèle puissant (Sonnet) pour le diagnostic.

---

## Phase 4 — Analyse CTA et Timing du Pitch
**Effort : faible | Impact : moyen | Données déjà disponibles**

### Objectif
Exploiter les événements `cta_click` pour analyser quand les viewers cliquent et à quel moment de la vidéo.

### Changements

#### [MODIFY] `components/DiagnosticPanel.js`

**1. Calculer les stats CTA :**
```
Clics CTA :
- 12 clics sur 77 viewers (15.6%) → GOOD (benchmark: 10-17%)
- Moment moyen du clic : 42 min (68% de la vidéo)
- 70% des clics arrivent dans les 5 min après le début du pitch
- 30% des cliqueurs n'ont PAS acheté (drop au checkout)
```

Pour ce calcul :
- Filtrer les `viewing_events` de type `cta_click`
- Récupérer le `video_seconds` et `video_percent` de chaque clic
- Croiser avec les chapitres pour identifier dans quel chapitre le clic a lieu
- Croiser avec les `purchases` pour savoir si le clic a mené à un achat

#### [MODIFY] `app/api/generate-diagnostic/route.js`

**2. Ajouter dans le prompt :**
```
Analyse CTA :
- CTA click rate : X% → [RATING selon benchmark]
- Moment moyen du clic : chapitre "[Pitch]", à Xmin (Y% de la vidéo)
- X% des cliqueurs ont acheté (checkout conversion)
- Benchmark CTA : 8-17% bon, >17% excellent
- Benchmark checkout : 10-25% pour offre <500€
```

L'IA pourra dire : "Vos clics CTA arrivent tard (42 min / 68%). Les benchmarks suggèrent de présenter l'offre à 60-70% de la vidéo. Votre pitch à 58% est bien placé, mais les viewers mettent 10 min de plus pour cliquer, ce qui suggère des hésitations. Ajoutez des preuves sociales juste avant le CTA."

---

## Phase 5 — Historisation et Comparaison
**Effort : moyen | Impact : moyen | Nécessite nouvelle table**

### Objectif
Stocker chaque diagnostic généré pour permettre la comparaison avant/après quand l'utilisateur modifie son webinaire.

### Changements

#### [NEW] Migration SQL `add_diagnostic_history.sql`

```sql
CREATE TABLE diagnostic_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_id UUID REFERENCES webinars(id) ON DELETE CASCADE,
  insights JSONB NOT NULL,
  stats JSONB,                    -- snapshot des stats au moment du diagnostic
  chapters_data JSONB,            -- snapshot des chapitres avec rétention
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### [MODIFY] `app/api/generate-diagnostic/route.js`

Après génération du diagnostic, sauvegarder automatiquement en base.

#### [MODIFY] `components/DiagnosticPanel.js`

**1. Afficher l'historique :**
- Bouton "Voir les précédents diagnostics"
- Comparaison visuelle : "Depuis le dernier diagnostic (il y a 14 jours), votre taux de complétion est passé de 5% → 12% (+140%)"

**2. Inclure l'historique dans le prompt :**
Si un diagnostic précédent existe, l'envoyer au prompt :
```
Diagnostic précédent (il y a 14 jours) :
- Complétion était à 5%, maintenant 12%
- CTA clicks étaient à 8%, maintenant 15%
- Recommandation précédente : "raccourcir les démos"
```

L'IA peut alors dire : "Suite à la réduction des démonstrations recommandée, votre taux de complétion a doublé (+140%). Continuez en optimisant maintenant le timing du pitch."

---

## Récapitulatif

| Phase | Effort | Impact | Données nécessaires | Résultat |
|-------|--------|--------|-------------------|----------|
| **1. Benchmarks** | Faible | Fort | Aucune nouvelle | Ratings UNDERPERFORMING → EXCELLENT, comparaison aux standards |
| **2. Acheteurs vs Non** | Moyen | Très fort | Join sessions ↔ purchases | Point de bascule, profil d'acheteur, recommandations ciblées |
| **3. Transcript** | Moyen | Fort | Double appel IA | Critique du contenu, pas juste des métriques |
| **4. Analyse CTA** | Faible | Moyen | Events cta_click existants | Timing du pitch, checkout conversion, recommandations CTA |
| **5. Historisation** | Moyen | Moyen | Nouvelle table | Suivi de progression, comparaison avant/après |

### Ordre recommandé
Phases 1 → 4 → 2 → 3 → 5

La Phase 1 (benchmarks) donne le plus gros gain pour le moindre effort. La Phase 4 (CTA) est presque gratuite car les données existent. La Phase 2 (acheteurs) est l'insight le plus puissant mais demande un peu plus de travail. La Phase 3 (transcript) est la plus ambitieuse. La Phase 5 (historique) prend tout son sens une fois les autres phases en place.
