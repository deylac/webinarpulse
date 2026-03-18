# WebinarPulse 📊

Analytics pour webinaires evergreen Systeme.io avec tracking Vimeo.

## Fonctionnalités

- **Courbe de rétention** : visualise à quel moment les viewers décrochent
- **Détail par viewer** : qui a regardé, combien de temps, progression
- **Volume journalier** : nombre de sessions par jour
- **Identification** : récupère l'email depuis les paramètres d'URL Systeme.io
- **Tracking Vimeo** : se branche sur l'API Vimeo Player (play, pause, seeked, timeupdate, ended)

## Stack

- **Next.js 14** (App Router)
- **Tailwind CSS**
- **Supabase** (PostgreSQL + API REST)
- **Vimeo Player API** (côté client)

## Déploiement sur Vercel

### 1. Push sur GitHub

```bash
git init
git add .
git commit -m "WebinarPulse v1"
git remote add origin https://github.com/ton-user/webinarpulse.git
git push -u origin main
```

### 2. Connecte sur Vercel

1. Va sur [vercel.com/new](https://vercel.com/new)
2. Importe le repo GitHub
3. Ajoute les variables d'environnement :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Déploie

### 3. Ajoute le tracking à Systeme.io

1. Ouvre le dashboard WebinarPulse
2. Ajoute ton webinaire (nom, ID Vimeo, durée)
3. Clique sur "Script" pour obtenir le snippet
4. Colle-le dans ta page Systeme.io : Paramètres > Codes de suivi > Body

## Structure

```
webinarpulse/
├── app/
│   ├── api/script/route.js   # API pour générer le tracking script
│   ├── globals.css            # Styles globaux + Tailwind
│   ├── layout.js              # Root layout
│   └── page.js                # Page principale
├── components/
│   ├── AddWebinarModal.js     # Modal ajout webinaire
│   ├── Dashboard.js           # Dashboard analytics
│   ├── DailyChart.js          # Graphique volume journalier
│   ├── RetentionChart.js      # Courbe de rétention SVG
│   ├── StatCard.js            # Carte statistique
│   ├── TrackingScriptModal.js # Modal avec script à copier
│   ├── ViewerTable.js         # Table des sessions
│   └── WebinarList.js         # Liste des webinaires
├── lib/
│   ├── supabase.js            # Client Supabase
│   └── utils.js               # Fonctions utilitaires
├── .env.example
├── .env.local
├── package.json
├── tailwind.config.js
└── next.config.js
```

## Base de données Supabase

4 tables : `webinars`, `viewers`, `viewing_sessions`, `viewing_events`.
La migration est déjà appliquée sur le projet "Flow".
