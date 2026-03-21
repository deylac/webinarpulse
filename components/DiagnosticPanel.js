"use client";

import { useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";

const TYPE_STYLES = {
  danger: "border-red-500/20 bg-red-500/5",
  warning: "border-yellow-500/20 bg-yellow-500/5",
  success: "border-emerald-500/20 bg-emerald-500/5",
  info: "border-blue-500/20 bg-blue-500/5",
};

export default function DiagnosticPanel({ chapters, sessions, videoDuration, webinarName }) {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Compute retention data from sessions (same logic as RetentionChart)
  const retentionData = useMemo(() => {
    if (!sessions?.length || !videoDuration) return [];
    const buckets = 50;
    const bucketSize = videoDuration / buckets;
    const total = sessions.length;
    const data = [];
    for (let i = 0; i <= buckets; i++) {
      const timePoint = i * bucketSize;
      const viewersAtPoint = sessions.filter(s => (s.max_video_seconds || 0) >= timePoint).length;
      const retention = (viewersAtPoint / total) * 100;
      data.push({ time: timePoint, retention: Math.round(retention * 10) / 10, viewers: viewersAtPoint });
    }
    return data;
  }, [sessions, videoDuration]);

  // Compute global stats
  const globalStats = useMemo(() => {
    if (!sessions?.length) return null;
    const total = sessions.length;
    const identified = sessions.filter(s => s.viewer?.email).length;
    const avgDuration = Math.round(sessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / total);
    const avgPercent = Math.round(sessions.reduce((sum, s) => sum + (s.max_video_percent || 0), 0) / total);
    const completed = sessions.filter(s => (s.max_video_percent || 0) >= 80).length;
    return { total, identified, avgDuration, avgPercent, completed, completionRate: Math.round((completed / total) * 100) };
  }, [sessions]);

  // Fetch CTA events for this webinar's sessions
  async function fetchCtaStats() {
    if (!sessions?.length) return null;
    const sessionIds = sessions.map(s => s.id);
    
    // Fetch cta_click events
    const { data: ctaEvents } = await supabase
      .from("viewing_events")
      .select("session_id, video_seconds, video_percent")
      .eq("event_type", "cta_click")
      .in("session_id", sessionIds);

    if (!ctaEvents?.length) return { clicks: 0, clickRate: 0, avgClickTime: null, avgClickPercent: null };

    const uniqueClickers = new Set(ctaEvents.map(e => e.session_id));
    const clickRate = Math.round((uniqueClickers.size / sessions.length) * 100);
    const avgClickSeconds = Math.round(ctaEvents.reduce((sum, e) => sum + (e.video_seconds || 0), 0) / ctaEvents.length);
    const avgClickPercent = Math.round(ctaEvents.reduce((sum, e) => sum + (e.video_percent || 0), 0) / ctaEvents.length * 100);

    // Find which chapter the average click falls in
    let clickChapter = null;
    if (chapters?.length && avgClickSeconds) {
      clickChapter = chapters.find(ch => avgClickSeconds >= ch.start_seconds && avgClickSeconds < ch.end_seconds);
    }

    return {
      clicks: uniqueClickers.size,
      totalClicks: ctaEvents.length,
      clickRate,
      avgClickSeconds,
      avgClickPercent,
      clickChapterTitle: clickChapter?.title || null,
      clickChapterType: clickChapter?.chapter_type || null,
    };
  }

  // Fetch buyer vs non-buyer comparison stats
  async function fetchBuyerStats() {
    if (!sessions?.length) return null;

    // Get identified viewer emails from sessions
    const identifiedSessions = sessions.filter(s => s.viewer?.email);
    if (!identifiedSessions.length) return null;

    // Fetch all purchases
    const { data: purchases } = await supabase
      .from("purchases")
      .select("email");

    if (!purchases?.length) return null;

    const buyerEmails = new Set(purchases.map(p => p.email?.toLowerCase()).filter(Boolean));

    // Split sessions into buyers vs non-buyers
    const buyerSessions = identifiedSessions.filter(s => buyerEmails.has(s.viewer.email?.toLowerCase()));
    const nonBuyerSessions = identifiedSessions.filter(s => !buyerEmails.has(s.viewer.email?.toLowerCase()));

    if (!buyerSessions.length) return { buyers: 0, nonBuyers: nonBuyerSessions.length, buyerData: null, nonBuyerData: null };

    const computeStats = (arr) => {
      const total = arr.length;
      if (!total) return null;
      return {
        count: total,
        avgDuration: Math.round(arr.reduce((s, x) => s + (x.duration_seconds || 0), 0) / total),
        avgPercent: Math.round(arr.reduce((s, x) => s + (x.max_video_percent || 0), 0) / total),
        completed: arr.filter(x => (x.max_video_percent || 0) >= 80).length,
        completionRate: Math.round((arr.filter(x => (x.max_video_percent || 0) >= 80).length / total) * 100),
      };
    };

    // Find tipping point: the minimum progression beyond which most buyers watched
    const buyerPercents = buyerSessions.map(s => s.max_video_percent || 0).sort((a, b) => a - b);
    const tippingPoint = buyerPercents[Math.floor(buyerPercents.length * 0.25)]; // 75% of buyers watched beyond this point

    return {
      buyers: buyerSessions.length,
      nonBuyers: nonBuyerSessions.length,
      buyerData: computeStats(buyerSessions),
      nonBuyerData: computeStats(nonBuyerSessions),
      tippingPoint: Math.round(tippingPoint),
    };
  }

  async function generateDiagnostic() {
    if (!chapters?.length) return;
    setLoading(true);
    setError(null);

    // Compute retention per chapter
    const enrichedChapters = chapters.map((ch) => {
      if (!retentionData.length || !videoDuration) return ch;
      const startPct = ch.start_seconds / videoDuration;
      const endPct = ch.end_seconds / videoDuration;
      const startIdx = Math.min(Math.round(startPct * (retentionData.length - 1)), retentionData.length - 1);
      const endIdx = Math.min(Math.round(endPct * (retentionData.length - 1)), retentionData.length - 1);
      return {
        ...ch,
        startRetention: retentionData[startIdx]?.retention || 0,
        endRetention: retentionData[endIdx]?.retention || 0,
        drop: (retentionData[endIdx]?.retention || 0) - (retentionData[startIdx]?.retention || 0),
      };
    });

    // Fetch CTA stats and buyer stats in parallel
    const [ctaStats, buyerStats] = await Promise.all([
      fetchCtaStats(),
      fetchBuyerStats(),
    ]);

    try {
      const res = await fetch("/api/generate-diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapters: enrichedChapters,
          webinar_name: webinarName,
          stats: globalStats,
          video_duration: videoDuration,
          cta_stats: ctaStats,
          buyer_stats: buyerStats,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setInsights(data.insights || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!chapters?.length) return null;

  return (
    <div className="mt-5 animate-fade-in">
      {!insights && (
        <button
          onClick={generateDiagnostic}
          disabled={loading}
          className="w-full py-3.5 rounded-xl border border-dashed border-pulse-border text-sm text-gray-500 hover:text-pulse-accent-light hover:border-pulse-accent/40 hover:bg-pulse-accent/5 transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-gray-500/30 border-t-pulse-accent rounded-full animate-spin" />
              Diagnostic en cours...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              Générer le diagnostic IA
            </>
          )}
        </button>
      )}

      {error && (
        <div className="mt-3 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {error}
        </div>
      )}

      {insights && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white">Diagnostic IA</h4>
            <button
              onClick={() => { setInsights(null); generateDiagnostic(); }}
              className="text-[10px] text-gray-500 hover:text-pulse-accent-light transition-colors"
            >
              Régénérer
            </button>
          </div>
          {insights.map((insight, i) => (
            <div
              key={i}
              className={`rounded-xl border px-4 py-3.5 ${TYPE_STYLES[insight.type] || TYPE_STYLES.info}`}
            >
              <div className="flex items-start gap-2.5">
                <span className="text-lg flex-shrink-0 mt-0.5">{insight.emoji}</span>
                <div>
                  <div className="text-[13px] font-semibold text-white">
                    {insight.title}
                  </div>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    {insight.detail}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
