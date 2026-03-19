# WebinarPulse — Feature Spec : Analyse de rétention par transcript
## Overlay contenu × comportement

**Date** : 19 mars 2026
**Auteur** : Brice / Superproductif
**Statut** : Spécification
**Dépendance** : WebinarPulse MVP (déployé)

---

## 1. Le problème

La courbe de rétention dit **quand** les gens partent. Mais elle ne dit pas **pourquoi**. Actuellement, pour comprendre la cause d'un drop, il faut ouvrir la vidéo séparément, aller au timecode en question, et deviner ce qui a fait décrocher les viewers. C'est fastidieux et subjectif.

L'objectif est de superposer le contenu (ce qui est dit à chaque instant) directement sur la courbe de rétention pour rendre le diagnostic immédiat.

---

## 2. Source des données : YouTube transcript

### Workflow utilisateur

1. L'utilisateur uploade la même vidéo sur YouTube en non-répertorié.
2. YouTube génère automatiquement les sous-titres avec timecodes.
3. L'utilisateur récupère le transcript (via YouTube Studio ou un outil tiers).
4. L'utilisateur colle le transcript dans le dashboard WebinarPulse.
5. L'app parse, segmente et stocke le transcript avec les timecodes.

### Format attendu en input

Le transcript YouTube a généralement ce format (SRT ou texte brut avec timecodes) :

**Format SRT (le plus propre)** :
```
1
00:00:01,000 --> 00:00:05,500
Bonjour et bienvenue dans ce webinaire

2
00:00:05,500 --> 00:00:12,000
Aujourd'hui on va parler de la prospection
inversée sur LinkedIn
```

**Format texte brut YouTube Studio** :
```
0:00 Bonjour et bienvenue dans ce webinaire
0:05 Aujourd'hui on va parler de la prospection inversée sur LinkedIn
0:12 Je m'appelle Brice et depuis 5 ans
```

L'app doit supporter les deux formats. Le parsing doit être robuste et tolérant.

---

## 3. Pipeline de traitement

Le transcript brut n'est pas directement exploitable pour l'analytics. Il faut le transformer en chapitres thématiques. Voici le pipeline :

```
[Transcript brut]               (input utilisateur)
       │
       ▼
[Parsing + normalisation]       (extraction timecodes + texte, nettoyage)
       │
       ▼
[Segmentation par IA]           (API Claude : regrouper en chapitres thématiques)
       │
       ▼
[Chapitres annotés]             (stockés en BDD, éditables par l'utilisateur)
       │
       ▼
[Overlay sur courbe rétention]  (affichage dans le dashboard)
```

### 3.1 Parsing du transcript

Le parser doit gérer :

- **Format SRT** : regex sur les blocs `index / timecode --> timecode / texte`.
- **Format texte YouTube** : regex sur les lignes `M:SS texte` ou `H:MM:SS texte`.
- **Format VTT** : similaire au SRT avec header `WEBVTT`.
- **Texte brut sans timecodes** : l'utilisateur colle juste le texte. L'app fait un découpage approximatif basé sur la durée de la vidéo (répartition linéaire).

Le résultat du parsing est un tableau de segments :
```json
[
  { "start_seconds": 0, "end_seconds": 5, "text": "Bonjour et bienvenue dans ce webinaire" },
  { "start_seconds": 5, "end_seconds": 12, "text": "Aujourd'hui on va parler de la prospection inversée sur LinkedIn" },
  ...
]
```

### 3.2 Segmentation par IA (API Claude)

Les segments bruts du transcript (une phrase toutes les 3-5 secondes) sont trop granulaires. On utilise l'API Claude pour les regrouper en chapitres thématiques.

**Prompt recommandé** :

```
Tu es un expert en analyse de webinaires de vente.

Voici le transcript complet d'un webinaire avec timecodes.
Découpe-le en 5 à 15 chapitres thématiques.

Pour chaque chapitre, fournis :
- title : titre court et descriptif (max 50 caractères)
- chapter_type : un type parmi [intro, hook, problem, agitation, story, solution, demo, proof, transition, pitch, offer, objections, urgency, bonus, close, qa]
- start_seconds : timecode de début
- end_seconds : timecode de fin
- summary : résumé en 1-2 phrases de ce qui est dit

Règles :
- Les chapitres doivent être contigus (pas de trou entre les timecodes).
- Identifie précisément le moment où le pitch/l'offre commerciale commence.
- Identifie les transitions (moments où le ton ou le sujet change).
- Le résultat doit être un tableau JSON, rien d'autre.

Transcript :
{transcript}
```

Le chapitre_type est important : il permet de croiser automatiquement les drops de rétention avec les types de contenu. On pourra dire : "En moyenne, vous perdez 18% de viewers pendant les transitions, et seulement 5% pendant les sections proof/demo."

### 3.3 Édition manuelle

Après la segmentation IA, l'utilisateur doit pouvoir :
- Renommer les titres des chapitres.
- Ajuster les timecodes de début/fin (drag & drop ou input numérique).
- Fusionner ou diviser des chapitres.
- Changer le `chapter_type`.
- Ajouter un chapitre manuellement.

L'IA fait 80% du travail. L'utilisateur affine les 20% restants.

---

## 4. Modèle de données

### 4.1 Nouvelle table : `webinar_transcripts`

Stocke le transcript brut (input de l'utilisateur) et les métadonnées.

```sql
CREATE TABLE public.webinar_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_id UUID NOT NULL REFERENCES public.webinars(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  source_format TEXT NOT NULL,           -- 'srt', 'vtt', 'youtube_text', 'plain'
  language TEXT DEFAULT 'fr',
  processed_at TIMESTAMPTZ,              -- NULL si pas encore segmenté
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT one_transcript_per_webinar UNIQUE (webinar_id)
);
```

### 4.2 Nouvelle table : `webinar_chapters`

Stocke les chapitres thématiques (résultat de la segmentation IA + éditions manuelles).

```sql
CREATE TABLE public.webinar_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_id UUID NOT NULL REFERENCES public.webinars(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  chapter_type TEXT NOT NULL,            -- cf. liste des types ci-dessus
  start_seconds INTEGER NOT NULL,
  end_seconds INTEGER NOT NULL,
  summary TEXT,
  transcript_excerpt TEXT,               -- extrait du transcript pour ce segment
  is_ai_generated BOOLEAN DEFAULT true,  -- false si créé/modifié manuellement
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chapters_webinar ON public.webinar_chapters(webinar_id, sort_order);
```

### 4.3 Policies RLS

```sql
-- Même logique que les tables existantes : lecture et écriture publiques
-- (à verrouiller avec auth dans une version ultérieure)
ALTER TABLE public.webinar_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webinar_chapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_transcripts" ON public.webinar_transcripts
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_chapters" ON public.webinar_chapters
  FOR ALL USING (true) WITH CHECK (true);
```

---

## 5. Modifications du dashboard

### 5.1 Nouvel onglet : "Transcript"

Accessible depuis la vue dashboard d'un webinaire (4e onglet après Rétention, Viewers, Volume).

**État initial (pas de transcript)** :
Zone de textarea avec placeholder "Collez ici le transcript YouTube de votre webinaire (format SRT, VTT ou texte avec timecodes)". Bouton "Analyser". Lien d'aide vers un mini-tutoriel expliquant comment récupérer le transcript depuis YouTube Studio.

**Après analyse** :
Liste des chapitres sous forme de cartes éditables. Chaque carte affiche le numéro, le titre, le type (badge coloré), la durée, le résumé, et le pourcentage de rétention à ce moment (calculé dynamiquement).

### 5.2 Overlay sur la courbe de rétention

La courbe de rétention existante (onglet "Rétention") est enrichie avec :

**Bandes verticales colorées** : chaque chapitre est représenté par une bande de couleur semi-transparente sur le graphique, avec le titre en bas. La couleur dépend du `chapter_type` :

| Type | Couleur | Opacité |
|---|---|---|
| intro, hook | Bleu | 0.06 |
| problem, agitation | Orange | 0.06 |
| story | Violet | 0.06 |
| solution, demo, proof | Vert | 0.06 |
| transition | Gris | 0.04 |
| pitch, offer, objections, urgency, bonus | Indigo | 0.08 |
| close, qa | Gris | 0.04 |

**Labels** : le titre de chaque chapitre est affiché sous la courbe, orienté à 45° si nécessaire, avec le timecode.

**Drop par chapitre** : pour chaque chapitre, afficher le delta de rétention (ex: "-12%") dans un petit badge au-dessus de la bande. Coloré en rouge si le drop est supérieur à la moyenne, en vert s'il est inférieur.

### 5.3 Nouveau widget : "Diagnostic"

Sous la courbe de rétention (ou dans un panneau latéral), un résumé automatique :

```
📉 Plus gros décrochage : -21% pendant "Présentation de l'offre" (28:00 - 35:00)
   → C'est 2.4× plus que la moyenne. Considérez adoucir la transition vers l'offre.

🔁 Section la plus rembobinée : "Démonstration méthode" (18:00 - 28:00)
   → 34% des viewers ont rembobiné ce passage. Le contenu intéresse mais n'est peut-être pas assez clair.

✅ Meilleure rétention : "Le problème" (5:00 - 12:00)
   → Seulement -3% de drop. L'accroche fonctionne.

💡 Recommandation : Le pitch arrive à 62% de rétention. En raccourcissant
   la section "Démonstration" de 10 à 7 minutes, vous pourriez atteindre
   le pitch avec 8-10% de viewers supplémentaires.
```

Ce diagnostic peut être généré par l'API Claude en lui envoyant les données de rétention par chapitre + les types de chapitres. Le prompt demanderait une analyse actionnable en 3-5 points.

---

## 6. API Route pour la segmentation

### 6.1 Endpoint

```
POST /api/analyze-transcript
Body: {
  "webinar_id": "uuid",
  "raw_text": "0:00 Bonjour...\n0:05 Aujourd'hui...",
  "source_format": "youtube_text"  // ou "srt", "vtt", "plain"
}
```

### 6.2 Logique

1. Parser le transcript selon le format.
2. Stocker le transcript brut dans `webinar_transcripts`.
3. Envoyer les segments à l'API Claude pour segmentation en chapitres.
4. Stocker les chapitres dans `webinar_chapters`.
5. Retourner les chapitres au frontend.

### 6.3 Considérations

- L'appel Claude est fait côté serveur (API Route Next.js ou Edge Function Supabase). La clé API Anthropic est dans les variables d'environnement serveur.
- Le modèle recommandé est `claude-sonnet-4-20250514` pour un bon ratio qualité/coût/vitesse.
- Le transcript d'un webinaire de 60-90 minutes représente ~10-15K tokens en input. Le coût est négligeable (~0.03-0.05$ par analyse).
- L'analyse est one-shot (pas de streaming nécessaire). Le résultat est mis en cache dans la BDD.

---

## 7. Récupération du transcript YouTube — guide utilisateur

Ce mini-guide sera intégré dans le dashboard (lien d'aide dans l'onglet Transcript).

### Méthode 1 : YouTube Studio (la plus fiable)

1. Uploade ta vidéo sur YouTube en **non-répertorié**.
2. Attends que YouTube génère les sous-titres automatiques (5-30 min selon la durée).
3. Va dans YouTube Studio → Sous-titres → clique sur ta vidéo.
4. Clique sur les trois points "..." à côté des sous-titres auto-générés.
5. Clique "Télécharger" → choisis le format **.srt**.
6. Colle le contenu du fichier .srt dans WebinarPulse.

### Méthode 2 : Transcript en texte (plus rapide)

1. Ouvre ta vidéo YouTube dans le navigateur.
2. Sous la vidéo, clique sur "...plus" puis "Afficher la transcription".
3. Sélectionne tout le texte du panneau de transcription (Ctrl+A).
4. Colle dans WebinarPulse.

### Méthode 3 : Outils tiers

Des outils comme Downsub.com ou YouTube Transcript API permettent de récupérer le transcript directement depuis l'URL de la vidéo.

### Note

La vidéo YouTube peut être supprimée après récupération du transcript. Elle ne sert qu'à exploiter le moteur de transcription de YouTube. Pense à la mettre en non-répertorié et non en public pour éviter la duplication de contenu.

---

## 8. Maquette de l'overlay (description visuelle)

### Courbe de rétention avec chapitres

```
100% ┤
     │ ████████████
 80% ┤ ▓▓▓▓▓▓▓▓▓▓▓▓█████████
     │  Intro       ▓▓▓▓▓▓▓▓▓▓████████
 60% ┤  -2%         Le problème ▓▓▓▓▓▓▓▓████████
     │               -8%        La solution ▓▓▓▓▓███
 40% ┤                          -12%        Le pitch ▓▓▓
     │                                      -21%  ▓▓ Close
 20% ┤                                             -3%
     │
  0% ┤───────────────────────────────────────────────────
     0    5min   10min  15min  20min  25min  30min  35min  40min
     │ Intro │ Problème │ Solution  │  Démo  │ Pitch │Close│
```

Chaque zone est colorée selon le type de chapitre. Le drop est affiché dans un petit badge flottant.

---

## 9. Variables d'environnement supplémentaires

| Variable | Où | Usage |
|---|---|---|
| `ANTHROPIC_API_KEY` | Vercel (non-public) ou Supabase Secrets | Appels API Claude pour segmentation transcript |

---

## 10. Estimation de charge

| Métrique | Estimation |
|---|---|
| Transcripts à analyser | 2-3 (un par webinaire) |
| Tokens par analyse | ~12K input + ~2K output |
| Coût par analyse (Claude Sonnet) | ~0.05$ |
| Temps de traitement | 5-10 secondes |
| Fréquence | One-shot par webinaire (+ réanalyse si transcript modifié) |

---

## 11. Ordre d'implémentation

1. **Migration BDD** : créer `webinar_transcripts` et `webinar_chapters`.
2. **Parser de transcript** : implémenter les parsers SRT, VTT et texte YouTube.
3. **API Route `/api/analyze-transcript`** : intégration avec l'API Claude pour la segmentation.
4. **Onglet Transcript dans le dashboard** : textarea + bouton analyser + liste de chapitres éditables.
5. **Overlay sur la courbe de rétention** : bandes colorées + labels + drops par chapitre.
6. **Widget diagnostic** : résumé automatique des insights via API Claude.
7. **Guide utilisateur** : intégrer le mini-tutoriel YouTube dans l'interface.

---

## 12. Évolutions futures

**Transcription directe depuis Vimeo** : si le client passe sur un plan Vimeo qui expose les sous-titres via l'API REST, on pourrait automatiser la récupération du transcript sans passer par YouTube.

**Transcription audio native** : intégrer l'API Whisper ou AssemblyAI pour transcrire directement depuis l'URL audio de la vidéo Vimeo, sans upload YouTube. Plus coûteux mais plus fluide.

**Analyse comparative** : comparer les courbes de rétention de deux versions d'un même webinaire (même structure de chapitres, contenu différent) pour identifier quelle formulation performe le mieux.

**Suggestions de montage** : à partir de l'analyse des drops, suggérer des coupes spécifiques ("Raccourcir le passage 12:30-15:00 qui a un drop de 15% et un faible taux de re-watch").
