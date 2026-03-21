import { NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(request) {
  try {
    const { chapters, webinar_name, stats, video_duration, cta_stats, buyer_stats } = await request.json();

    if (!chapters?.length) {
      return NextResponse.json(
        { error: "Chapitres requis pour le diagnostic" },
        { status: 400 }
      );
    }

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY non configurée" },
        { status: 500 }
      );
    }

    const durationMin = Math.round((video_duration || 0) / 60);

    // --- Build chapters block ---
    const chaptersText = chapters
      .map((ch, i) => {
        const durSec = ch.end_seconds - ch.start_seconds;
        const durMin = (durSec / 60).toFixed(1);
        const pctOfVideo = Math.round((durSec / (video_duration || 1)) * 100);
        return `${i + 1}. [${ch.chapter_type || 'unknown'}] "${ch.title}" (${ch.start_seconds}s → ${ch.end_seconds}s, durée: ${durMin}min, ${pctOfVideo}% de la vidéo) — Rétention: ${ch.startRetention?.toFixed(1) || "?"}% → ${ch.endRetention?.toFixed(1) || "?"}% (drop: ${ch.drop?.toFixed(1) || "?"}%)`;
      })
      .join("\n");

    // --- Build stats block ---
    const statsText = stats ? `
STATISTIQUES GLOBALES :
- ${stats.total} sessions de visionnage (${stats.identified} identifiées, ${stats.total - stats.identified} anonymes)
- Durée moyenne de visionnage : ${Math.round(stats.avgDuration / 60)} min sur ${durationMin} min de vidéo (${stats.avgPercent}% de progression)
- Taux de complétion (>80% visionné) : ${stats.completionRate}% (${stats.completed}/${stats.total} viewers)
` : '';

    // --- Build CTA block ---
    let ctaText = '';
    if (cta_stats) {
      if (cta_stats.clicks > 0) {
        ctaText = `
DONNÉES CTA (Call-to-Action) :
- ${cta_stats.clicks} viewers ont cliqué sur le CTA (${cta_stats.clickRate}% des viewers)
- Moment moyen du clic : à ${Math.round(cta_stats.avgClickSeconds / 60)}min (${cta_stats.avgClickPercent}% de la vidéo)
${cta_stats.clickChapterTitle ? `- Les clics se concentrent dans le chapitre "${cta_stats.clickChapterTitle}" [${cta_stats.clickChapterType}]` : ''}
`;
      } else {
        ctaText = '\nDONNÉES CTA : Aucun clic CTA enregistré.\n';
      }
    }

    // --- Build buyer stats block ---
    let buyerText = '';
    if (buyer_stats && buyer_stats.buyerData) {
      buyerText = `
PROFIL ACHETEURS vs NON-ACHETEURS :
- ${buyer_stats.buyers} acheteurs identifiés sur ${buyer_stats.buyers + buyer_stats.nonBuyers} viewers identifiés
- Acheteurs : durée moy. ${Math.round(buyer_stats.buyerData.avgDuration / 60)} min, progression ${buyer_stats.buyerData.avgPercent}%, complétion ${buyer_stats.buyerData.completionRate}%
- Non-acheteurs : durée moy. ${Math.round(buyer_stats.nonBuyerData.avgDuration / 60)} min, progression ${buyer_stats.nonBuyerData.avgPercent}%, complétion ${buyer_stats.nonBuyerData.completionRate}%
- Point de bascule : 75% des acheteurs ont visionné au moins ${buyer_stats.tippingPoint}% de la vidéo
`;
    } else if (buyer_stats && buyer_stats.buyers === 0) {
      buyerText = '\nPROFIL ACHETEURS : Aucun achat enregistré pour les viewers identifiés de ce webinaire.\n';
    }

    // --- Build the full prompt ---
    const prompt = `Tu es un expert en optimisation de webinaires de vente evergreen. Tu dois analyser un webinaire et produire un diagnostic actionnable basé sur les données réelles et les benchmarks de l'industrie.

═══ BENCHMARKS DE RÉFÉRENCE (sources : ON24, GoToWebinar, BigMarker, BrightTALK, Contrast, 2023-2025) ═══

DURÉE OPTIMALE :
- Durée recommandée : 45-60 min. Au-delà, la rétention chute significativement
- Engagement moyen on-demand : 33 min (GoToWebinar 2023)
- Engagement moyen tous formats : 51 min (ON24 2024)

RÉTENTION (viewers restant jusqu'au pitch) :
- Excellent : >70% | Bon : 60-70% | Moyen : 50-60% | Mauvais : <50%
- Drop normal dans les 5 premières min : 15-25%
- Les webinaires avec guest speakers ont 3x plus d'engagement

CTA CLICK-THROUGH RATE (viewers → clic CTA) :
- Excellent : >17% | Bon : 10-17% | Moyen : 5-10% | Mauvais : <5%
- Moyenne du marché : 8.74% (BigMarker)
- 25% des participants cliquent sur un CTA en moyenne (MarketingProfs 2023)

STRUCTURE IDÉALE D'UN WEBINAIRE EVERGREEN :
- Hook percutant dans les 2 premières minutes
- Le pitch/offre devrait arriver entre 55-70% de la vidéo
- Max 3-4 démonstrations pour éviter la saturation
- Alterner contenu théorique et démonstrations pour maintenir l'engagement

DIAGNOSTIC DES PROBLÈMES TYPIQUES :
- Drop élevé dans l'intro → le contenu ne correspond pas à la promesse d'inscription
- Drop au milieu → problème de rythme ou de pertinence
- Drop avant le pitch → webinaire trop long, ou l'audience sent la vente arriver
- CTA clicks bas malgré bonne rétention → transition faible vers l'offre, proposition de valeur pas claire

═══ DONNÉES DU WEBINAIRE "${webinar_name || "sans nom"}" (durée : ${durationMin} min) ═══
${buyerText}
${statsText}${ctaText}
CHAPITRES ET RÉTENTION PAR SECTION :

${chaptersText}

═══ INSTRUCTIONS ═══

Analyse ces données et produis un diagnostic en 4 à 6 points. Structure ton analyse selon ces 3 axes :

1. AXE RÉTENTION : Compare la rétention de chaque chapitre aux benchmarks. Identifie les sections qui perdent le plus de viewers et pourquoi.

2. AXE STRUCTURE : Évalue le timing du pitch (position dans la vidéo vs recommandation 55-70%), la durée totale vs recommandation, et l'équilibre entre les types de chapitres.

3. AXE CONVERSION : Analyse le taux de CTA clicks vs benchmark (8-17%), le moment du clic, et les opportunités d'amélioration.

4. AXE PROFIL ACHETEUR (si des données d'achat sont disponibles) : Compare le comportement de visionnage des acheteurs vs non-acheteurs. Identifie le "point de bascule" — le seuil de visionnage au-delà duquel les viewers convertissent. Donne des recommandations pour amener plus de viewers au-delà de ce seuil.

Pour chaque point du diagnostic :
- Cite les CHIFFRES précis (rétention, drops, %, benchmarks)
- Compare aux benchmarks et donne un rating (EXCELLENT/BON/MOYEN/MAUVAIS)
- Donne une recommandation concrète et actionnable

Commence par un point de synthèse avec un score global sur 100.

Format : tableau JSON, chaque élément avec :
- "emoji": un seul emoji
- "title": titre court (max 60 cars)
- "detail": observation + benchmark + recommandation (3-4 phrases max)
- "type": "danger" | "warning" | "success" | "info"

Réponds UNIQUEMENT avec le tableau JSON, sans markdown ni backticks.`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error("Claude diagnostic error:", claudeRes.status, err);
      return NextResponse.json({ error: "Erreur Claude API" }, { status: 502 });
    }

    const claudeData = await claudeRes.json();
    const aiText = claudeData.content?.[0]?.text || "";

    let insights;
    try {
      const jsonMatch = aiText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No JSON");
      insights = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({ error: "Parse error", raw: aiText }, { status: 502 });
    }

    return NextResponse.json({ insights });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
