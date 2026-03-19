import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseTranscript } from "@/lib/transcriptParser";

const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
  (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim()
);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SEGMENTATION_PROMPT = `Tu es un expert en analyse de webinaires de vente.

Voici le transcript complet d'un webinaire avec timecodes (en secondes).
Découpe-le en 5 à 15 chapitres thématiques.

Pour chaque chapitre, fournis :
- title : titre court et descriptif (max 50 caractères)
- chapter_type : un type parmi [intro, hook, problem, agitation, story, solution, demo, proof, transition, pitch, offer, objections, urgency, bonus, close, qa]
- start_seconds : timecode de début (entier)
- end_seconds : timecode de fin (entier)
- summary : résumé en 1-2 phrases de ce qui est dit

Règles :
- Les chapitres doivent être contigus (pas de trou entre les timecodes).
- Identifie précisément le moment où le pitch/l'offre commerciale commence.
- Identifie les transitions (moments où le ton ou le sujet change).
- Le résultat doit être un tableau JSON valide, rien d'autre. Pas de markdown, pas de backticks.

Transcript :
`;

export async function POST(request) {
  try {
    const { webinar_id, raw_text, source_format } = await request.json();

    if (!webinar_id || !raw_text) {
      return NextResponse.json(
        { error: "webinar_id et raw_text sont requis" },
        { status: 400 }
      );
    }

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY non configurée" },
        { status: 500 }
      );
    }

    // 1. Get the webinar to know duration
    const { data: webinar } = await supabase
      .from("webinars")
      .select("video_duration_seconds")
      .eq("id", webinar_id)
      .single();

    const videoDuration = webinar?.video_duration_seconds || 0;

    // 2. Parse the transcript
    const { format, segments } = parseTranscript(raw_text, videoDuration);
    const detectedFormat = source_format || format;

    if (!segments.length) {
      return NextResponse.json(
        { error: "Aucun segment trouvé dans le transcript" },
        { status: 400 }
      );
    }

    // 3. Store raw transcript (upsert)
    const { error: transcriptError } = await supabase
      .from("webinar_transcripts")
      .upsert(
        {
          webinar_id,
          raw_text,
          source_format: detectedFormat,
          processed_at: null,
        },
        { onConflict: "webinar_id" }
      );

    if (transcriptError) {
      console.error("Transcript upsert error:", transcriptError);
    }

    // 4. Prepare transcript for Claude
    const transcriptForAI = segments
      .map((s) => `[${s.start_seconds}s - ${s.end_seconds}s] ${s.text}`)
      .join("\n");

    // 5. Call Claude API for segmentation
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: SEGMENTATION_PROMPT + transcriptForAI,
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text();
      console.error("Claude API error:", claudeRes.status, errBody);
      return NextResponse.json(
        { error: "Erreur Claude API: " + claudeRes.status },
        { status: 502 }
      );
    }

    const claudeData = await claudeRes.json();
    const aiText = claudeData.content?.[0]?.text || "";

    // 6. Parse Claude response (JSON array)
    let chapters;
    try {
      // Try to extract JSON from the response (handles markdown code blocks too)
      const jsonMatch = aiText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No JSON array found");
      chapters = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("Failed to parse Claude response:", parseErr, aiText);
      return NextResponse.json(
        { error: "Impossible de parser la réponse IA", raw_response: aiText },
        { status: 502 }
      );
    }

    // 7. Delete existing chapters for this webinar
    await supabase
      .from("webinar_chapters")
      .delete()
      .eq("webinar_id", webinar_id);

    // 8. Insert new chapters
    const chaptersToInsert = chapters.map((ch, i) => ({
      webinar_id,
      sort_order: i + 1,
      title: ch.title || `Chapitre ${i + 1}`,
      chapter_type: ch.chapter_type || "transition",
      start_seconds: ch.start_seconds || 0,
      end_seconds: ch.end_seconds || 0,
      summary: ch.summary || "",
      transcript_excerpt: segments
        .filter(
          (s) =>
            s.start_seconds >= (ch.start_seconds || 0) &&
            s.start_seconds < (ch.end_seconds || 0)
        )
        .map((s) => s.text)
        .join(" ")
        .slice(0, 500),
      is_ai_generated: true,
    }));

    const { data: insertedChapters, error: insertError } = await supabase
      .from("webinar_chapters")
      .insert(chaptersToInsert)
      .select();

    if (insertError) {
      console.error("Chapter insert error:", insertError);
      return NextResponse.json(
        { error: "Erreur d'insertion des chapitres" },
        { status: 500 }
      );
    }

    // 9. Mark transcript as processed
    await supabase
      .from("webinar_transcripts")
      .update({ processed_at: new Date().toISOString() })
      .eq("webinar_id", webinar_id);

    return NextResponse.json({
      chapters: insertedChapters,
      format: detectedFormat,
      segments_count: segments.length,
    });
  } catch (err) {
    console.error("analyze-transcript error:", err);
    return NextResponse.json(
      { error: err.message || "Erreur interne" },
      { status: 500 }
    );
  }
}
