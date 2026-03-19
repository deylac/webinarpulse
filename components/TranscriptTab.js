"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { formatDuration } from "@/lib/utils";

const CHAPTER_TYPES = [
  { value: "intro", label: "Intro", color: "bg-blue-500/20 text-blue-400" },
  { value: "hook", label: "Accroche", color: "bg-blue-500/20 text-blue-400" },
  { value: "problem", label: "Problème", color: "bg-orange-500/20 text-orange-400" },
  { value: "agitation", label: "Agitation", color: "bg-orange-500/20 text-orange-400" },
  { value: "story", label: "Histoire", color: "bg-purple-500/20 text-purple-400" },
  { value: "solution", label: "Solution", color: "bg-emerald-500/20 text-emerald-400" },
  { value: "demo", label: "Démo", color: "bg-emerald-500/20 text-emerald-400" },
  { value: "proof", label: "Preuve", color: "bg-emerald-500/20 text-emerald-400" },
  { value: "transition", label: "Transition", color: "bg-gray-500/20 text-gray-400" },
  { value: "pitch", label: "Pitch", color: "bg-indigo-500/20 text-indigo-400" },
  { value: "offer", label: "Offre", color: "bg-indigo-500/20 text-indigo-400" },
  { value: "objections", label: "Objections", color: "bg-indigo-500/20 text-indigo-400" },
  { value: "urgency", label: "Urgence", color: "bg-indigo-500/20 text-indigo-400" },
  { value: "bonus", label: "Bonus", color: "bg-indigo-500/20 text-indigo-400" },
  { value: "close", label: "Clôture", color: "bg-gray-500/20 text-gray-400" },
  { value: "qa", label: "Q&A", color: "bg-gray-500/20 text-gray-400" },
];

function getTypeInfo(type) {
  return CHAPTER_TYPES.find((t) => t.value === type) || CHAPTER_TYPES[8]; // default: transition
}

export default function TranscriptTab({ webinar, retentionData }) {
  const [chapters, setChapters] = useState([]);
  const [transcript, setTranscript] = useState(null);
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    loadData();
  }, [webinar.id]);

  async function loadData() {
    setLoading(true);
    try {
      // Load existing transcript
      const { data: t } = await supabase
        .from("webinar_transcripts")
        .select("*")
        .eq("webinar_id", webinar.id)
        .single();
      setTranscript(t || null);

      // Load existing chapters
      const { data: ch } = await supabase
        .from("webinar_chapters")
        .select("*")
        .eq("webinar_id", webinar.id)
        .order("sort_order", { ascending: true });
      setChapters(ch || []);
    } catch {
      // No data yet
    } finally {
      setLoading(false);
    }
  }

  async function analyzeTranscript() {
    if (!rawText.trim()) return;
    setAnalyzing(true);
    setError(null);

    try {
      const res = await fetch("/api/analyze-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webinar_id: webinar.id,
          raw_text: rawText,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur d'analyse");
      }

      setChapters(data.chapters || []);
      setTranscript({ raw_text: rawText, processed_at: new Date().toISOString() });
      setRawText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function updateChapter(chapter, updates) {
    const { error: err } = await supabase
      .from("webinar_chapters")
      .update({ ...updates, is_ai_generated: false, updated_at: new Date().toISOString() })
      .eq("id", chapter.id);

    if (!err) {
      setChapters((prev) =>
        prev.map((c) => (c.id === chapter.id ? { ...c, ...updates } : c))
      );
    }
    setEditingId(null);
  }

  async function deleteChapter(chapterId) {
    await supabase.from("webinar_chapters").delete().eq("id", chapterId);
    setChapters((prev) => prev.filter((c) => c.id !== chapterId));
  }

  function getRetentionAtSecond(seconds) {
    if (!retentionData?.length) return null;
    const bucket = retentionData.find(
      (b) => seconds >= b.start && seconds < b.end
    );
    return bucket ? Math.round(bucket.percent) : null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-pulse-border border-t-pulse-accent rounded-full animate-spin" />
      </div>
    );
  }

  // If chapters exist, show them
  if (chapters.length > 0) {
    return (
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-white">
              {chapters.length} chapitres identifiés
            </h3>
            {transcript?.processed_at && (
              <p className="text-xs text-gray-500 mt-1">
                Analysé le {new Date(transcript.processed_at).toLocaleDateString("fr-FR")}
              </p>
            )}
          </div>
          <button
            onClick={() => {
              setChapters([]);
              setRawText(transcript?.raw_text || "");
            }}
            className="text-xs px-3 py-1.5 rounded-lg border border-pulse-border text-gray-400 hover:text-pulse-accent-light hover:border-pulse-accent/40 transition-all"
          >
            Ré-analyser
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {chapters.map((ch, i) => {
            const typeInfo = getTypeInfo(ch.chapter_type);
            const duration = ch.end_seconds - ch.start_seconds;
            const retention = getRetentionAtSecond(ch.start_seconds);
            const isEditing = editingId === ch.id;

            return (
              <div
                key={ch.id}
                className="group bg-pulse-surface border border-pulse-border rounded-xl px-5 py-4 transition-all hover:border-pulse-accent/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-pulse-bg flex items-center justify-center text-xs font-mono text-gray-500 mt-0.5">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <EditChapterForm
                          chapter={ch}
                          onSave={(updates) => updateChapter(ch, updates)}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        <>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[15px] font-medium text-white">
                              {ch.title}
                            </span>
                            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${typeInfo.color}`}>
                              {typeInfo.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                            <span>{formatDuration(ch.start_seconds)} → {formatDuration(ch.end_seconds)}</span>
                            <span>({formatDuration(duration)})</span>
                            {retention !== null && (
                              <span className={`font-medium ${retention > 60 ? "text-emerald-400" : retention > 30 ? "text-yellow-400" : "text-red-400"}`}>
                                {retention}% rétention
                              </span>
                            )}
                          </div>
                          {ch.summary && (
                            <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                              {ch.summary}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditingId(ch.id)}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-pulse-accent-light hover:bg-pulse-accent/10 transition-all"
                        title="Modifier"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => deleteChapter(ch.id)}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title="Supprimer"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // No transcript yet — show the input form
  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white mb-1">Analyser le transcript</h3>
        <p className="text-sm text-gray-500">
          Collez le transcript YouTube de votre webinaire. L&apos;IA le découpera en chapitres
          thématiques pour enrichir la courbe de rétention.
        </p>
      </div>

      <div className="bg-pulse-surface border border-pulse-border rounded-xl p-5">
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Collez ici le transcript (format SRT, VTT ou texte YouTube avec timecodes)..."
          rows={12}
          className="w-full bg-pulse-bg border border-pulse-border rounded-xl px-4 py-3 text-sm text-gray-300 font-mono placeholder:text-gray-600 focus:outline-none focus:border-pulse-accent/50 resize-y"
        />

        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="text-xs text-gray-500 hover:text-pulse-accent-light transition-colors flex items-center gap-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Comment récupérer le transcript ?
          </button>

          <button
            onClick={analyzeTranscript}
            disabled={!rawText.trim() || analyzing}
            className="px-5 py-2.5 bg-gradient-to-r from-pulse-accent to-purple-500 text-white text-sm font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-pulse-accent/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {analyzing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyse en cours...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                Analyser avec l&apos;IA
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="mt-3 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {error}
          </div>
        )}
      </div>

      {showHelp && (
        <div className="mt-4 bg-pulse-surface border border-pulse-border rounded-xl p-5 text-sm text-gray-400 leading-relaxed">
          <h4 className="text-white font-semibold mb-3">Comment récupérer le transcript YouTube ?</h4>

          <div className="space-y-4">
            <div>
              <p className="font-medium text-gray-300 mb-1">Méthode 1 — YouTube Studio (recommandé)</p>
              <ol className="list-decimal list-inside space-y-1 text-gray-500">
                <li>Uploadez la vidéo sur YouTube en <strong className="text-gray-400">non-répertorié</strong></li>
                <li>Attendez que YouTube génère les sous-titres (5-30 min)</li>
                <li>YouTube Studio → Sous-titres → votre vidéo</li>
                <li>Cliquez &quot;...&quot; → Télécharger → <strong className="text-gray-400">format .srt</strong></li>
                <li>Collez le contenu du fichier ici</li>
              </ol>
            </div>

            <div>
              <p className="font-medium text-gray-300 mb-1">Méthode 2 — Transcript rapide</p>
              <ol className="list-decimal list-inside space-y-1 text-gray-500">
                <li>Ouvrez votre vidéo YouTube</li>
                <li>Sous la vidéo : &quot;...plus&quot; → &quot;Afficher la transcription&quot;</li>
                <li>Sélectionnez tout (Ctrl+A) et collez ici</li>
              </ol>
            </div>
          </div>

          <p className="mt-3 text-xs text-gray-600">
            💡 La vidéo YouTube peut être supprimée après récupération du transcript.
          </p>
        </div>
      )}
    </div>
  );
}

function EditChapterForm({ chapter, onSave, onCancel }) {
  const [title, setTitle] = useState(chapter.title);
  const [type, setType] = useState(chapter.chapter_type);
  const [summary, setSummary] = useState(chapter.summary || "");

  return (
    <div className="space-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-pulse-accent/50"
      />
      <div className="flex items-center gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="bg-pulse-bg border border-pulse-border rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-pulse-accent/50"
        >
          {CHAPTER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={2}
        className="w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-pulse-accent/50 resize-none"
        placeholder="Résumé..."
      />
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSave({ title, chapter_type: type, summary })}
          className="px-3 py-1 text-xs font-medium bg-pulse-accent/20 text-pulse-accent-light rounded-lg hover:bg-pulse-accent/30 transition-colors"
        >
          Sauvegarder
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
