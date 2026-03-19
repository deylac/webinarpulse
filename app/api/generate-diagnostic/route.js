import { NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(request) {
  try {
    const { chapters, webinar_name } = await request.json();

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
      .map((ch, i) => `${i + 1}. [${ch.chapter_type}] "${ch.title}" (${ch.start_seconds}s-${ch.end_seconds}s) — Rétention: ${ch.startRetention?.toFixed(1) || "?"}% → ${ch.endRetention?.toFixed(1) || "?"}% (drop: ${ch.drop?.toFixed(1) || "?"}%)`)
      .join("\n");

    const prompt = `Tu es un expert en optimisation de webinaires de vente.

Voici les chapitres d'un webinaire "${webinar_name || "sans nom"}" avec les données de rétention pour chaque section :

${chaptersText}

Génère un diagnostic actionnable en 3 à 5 points. Pour chaque point, utilise un emoji pertinent et donne :
- Une observation factuelle basée sur les données
- Une recommandation concrète et actionnable

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
