import { NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(request) {
  try {
    const { chapters, webinar_name, stats, video_duration } = await request.json();

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

    const chaptersText = chapters
      .map((ch, i) => `${i + 1}. [${ch.chapter_type}] "${ch.title}" (${ch.start_seconds}s-${ch.end_seconds}s, durée: ${ch.end_seconds - ch.start_seconds}s) — Rétention: ${ch.startRetention?.toFixed(1) || "?"}% → ${ch.endRetention?.toFixed(1) || "?"}% (drop: ${ch.drop?.toFixed(1) || "?"}%)`)
      .join("\n");

    const statsText = stats ? `
Statistiques globales du webinaire :
- ${stats.total} sessions de visionnage (${stats.identified} identifiées)
- Durée moyenne de visionnage : ${Math.round(stats.avgDuration / 60)} minutes sur ${Math.round((video_duration || 0) / 60)} minutes de vidéo
- Progression moyenne : ${stats.avgPercent}% de la vidéo
- Taux de complétion (>80%) : ${stats.completionRate}% (${stats.completed} viewers)
${stats.ctaClicks > 0 ? `- ${stats.ctaClicks} clics sur le bouton CTA (Call to Action)` : '- Aucun clic CTA enregistré'}
` : '';

    const prompt = `Tu es un expert en optimisation de webinaires de vente evergreen.

Voici les données du webinaire "${webinar_name || "sans nom"}" (durée totale : ${Math.round((video_duration || 0) / 60)} minutes) :
${statsText}
Chapitres avec les taux de rétention par section :

${chaptersText}

Analyse ces données et génère un diagnostic actionnable en 3 à 5 points. Pour chaque point :
- Appuie-toi sur les CHIFFRES (rétention, drops, durée, taux de complétion)
- Donne une recommandation concrète et actionnable
- Si les données de rétention sont toutes à 0%, signale que le tracking doit être vérifié

Format attendu : un tableau JSON avec pour chaque point :
- "emoji": un seul emoji
- "title": titre court (max 60 caractères)
- "detail": observation + recommandation (2-3 phrases max)
- "type": "danger" | "warning" | "success" | "info"

Réponds uniquement avec le tableau JSON, pas de markdown ni de backticks.`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
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
