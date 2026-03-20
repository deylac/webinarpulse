"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { formatDuration, generateDemoSessions } from "@/lib/utils";
import RetentionChart from "./RetentionChart";
import ViewerTable from "./ViewerTable";
import DailyChart from "./DailyChart";
import TranscriptTab from "./TranscriptTab";
import DiagnosticPanel from "./DiagnosticPanel";
import TaggingTab from "./TaggingTab";
import ConversionTab from "./ConversionTab";
import ScriptGenerator from "./ScriptGenerator";
import SettingsModal from "./SettingsModal";
import SetupChecklist from "./SetupChecklist";
import StatCard from "./StatCard";

export default function Dashboard({ webinar, demoMode, webinars, onBack }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("retention");
  const [dateRange, setDateRange] = useState("30d");
  const [showScript, setShowScript] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [chapters, setChapters] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [timeAgo, setTimeAgo] = useState("");
  const lastLoadRef = useRef(0);
  const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

  useEffect(() => {
    loadSessions();
    loadChapters();
  }, [webinar, dateRange]);

  // Auto-refresh when tab regains focus (with cooldown)
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        const elapsed = Date.now() - lastLoadRef.current;
        if (elapsed > COOLDOWN_MS) {
          loadSessions();
          loadChapters();
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [webinar, dateRange]);

  // Update relative time display every 30s
  useEffect(() => {
    function updateTimeAgo() {
      if (!lastUpdated) return;
      const diff = Math.round((Date.now() - lastUpdated) / 1000);
      if (diff < 10) setTimeAgo("à l'instant");
      else if (diff < 60) setTimeAgo(`il y a ${diff}s`);
      else if (diff < 3600) setTimeAgo(`il y a ${Math.floor(diff / 60)} min`);
      else setTimeAgo(`il y a ${Math.floor(diff / 3600)}h`);
    }
    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 30000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  // Listen for tab navigation events from SetupChecklist
  useEffect(() => {
    function handleGoTab(e) {
      setTab(e.detail);
    }
    document.addEventListener("wp-goto-tab", handleGoTab);
    return () => document.removeEventListener("wp-goto-tab", handleGoTab);
  }, []);

  async function loadChapters() {
    if (demoMode) return;
    try {
      const { data } = await supabase
        .from("webinar_chapters")
        .select("*")
        .eq("webinar_id", webinar.id)
        .order("sort_order", { ascending: true });
      setChapters(data || []);
    } catch {
      // no chapters yet
    }
  }

  async function loadSessions() {
    setLoading(true);

    if (demoMode) {
      setTimeout(() => {
        setSessions(generateDemoSessions(webinar.id, webinars));
        setLoading(false);
      }, 350);
      return;
    }

    try {
      let query = supabase
        .from("viewing_sessions")
        .select("*, viewer:viewers(email, anonymous_id)")
        .eq("webinar_id", webinar.id)
        .order("started_at", { ascending: false });

      if (dateRange !== "all") {
        const days = parseInt(dateRange);
        const since = new Date(Date.now() - days * 86400000).toISOString();
        query = query.gte("started_at", since);
      }

      const { data, error } = await query;
      if (!error && data) {
        setSessions(
          data.map((s) => ({
            ...s,
            viewer_email: s.viewer?.email || null,
            viewer_anonymous: s.viewer?.anonymous_id || null,
          }))
        );
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
      setLastUpdated(Date.now());
      lastLoadRef.current = Date.now();
    }
  }

  const stats = useMemo(() => {
    if (!sessions.length) return { total: 0, avgDuration: 0, avgPercent: 0, identified: 0, completionRate: 0 };
    const total = sessions.length;
    const avgDuration = Math.round(sessions.reduce((s, v) => s + (v.duration_seconds || 0), 0) / total);
    const avgPercent = Math.round(sessions.reduce((s, v) => s + (v.max_video_percent || 0), 0) / total);
    const identified = sessions.filter((s) => s.viewer_email).length;
    const completionRate = Math.round((sessions.filter((s) => (s.max_video_percent || 0) >= 80).length / total) * 100);
    return { total, avgDuration, avgPercent, identified, completionRate };
  }, [sessions]);

  const tabs = [
    { id: "retention", label: "Rétention", icon: "📉" },
    { id: "viewers", label: "Viewers", icon: "👥" },
    { id: "daily", label: "Volume", icon: "📊" },
    { id: "conversion", label: "Conversion", icon: "💰" },
    { id: "transcript", label: "Transcript", icon: "📝" },
    { id: "tags", label: "Tags", icon: "🏷️" },
  ];

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-5 py-8">
        {/* Top bar */}
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4 animate-fade-in">
          <div className="flex items-center gap-3.5">
            <button
              onClick={onBack}
              className="rounded-xl bg-pulse-surface border border-pulse-border px-3.5 py-2 text-sm text-gray-400 hover:text-white hover:border-pulse-accent/40 transition-all"
            >
              ←
            </button>
            <div>
              <h2 className="font-display text-xl font-bold text-white tracking-tight">
                {webinar.name}
              </h2>
              {webinar.video_duration_seconds > 0 && (
                <span className="text-xs text-gray-500">
                  {formatDuration(webinar.video_duration_seconds)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Date range pills */}
            <div className="flex rounded-xl bg-pulse-surface border border-pulse-border p-0.5">
              {["7d", "30d", "90d", "all"].map((r) => (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    dateRange === r
                      ? "bg-pulse-accent text-white shadow-md shadow-pulse-accent/20"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {r === "all" ? "Tout" : r}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowScript(true)}
              className="flex items-center gap-1.5 rounded-xl border border-pulse-border-hover bg-pulse-surface px-3.5 py-2 text-xs font-medium text-pulse-accent-light hover:bg-pulse-accent/10 hover:border-pulse-accent/30 transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              Script
            </button>
          </div>
        </div>

        {/* Last updated indicator */}
        {lastUpdated && !loading && (
          <div className="flex items-center gap-2 mb-4 animate-fade-in">
            <span className="text-[11px] text-gray-600">
              Mis à jour {timeAgo}
            </span>
            <button
              onClick={() => { loadSessions(); loadChapters(); }}
              className="text-gray-600 hover:text-pulse-accent-light transition-colors p-1 rounded-lg hover:bg-pulse-accent/5"
              title="Rafraîchir"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <div className="w-8 h-8 border-2 border-pulse-border border-t-pulse-accent rounded-full animate-spin mb-3" />
            <span className="text-sm">Chargement...</span>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 animate-fade-in animate-fade-in-delay-1">
              <StatCard
                label="Sessions"
                value={stats.total}
                sub={`${stats.identified} identifié${stats.identified > 1 ? "s" : ""}`}
                color="indigo"
              />
              <StatCard
                label="Durée moy."
                value={formatDuration(stats.avgDuration)}
                sub={`${stats.avgPercent}% de la vidéo`}
                color="purple"
              />
              <StatCard
                label="Complétion"
                value={`${stats.completionRate}%`}
                sub="Viewers à 80%+"
                color="green"
              />
              <StatCard
                label="Progression moy."
                value={`${stats.avgPercent}%`}
                sub={webinar.video_duration_seconds ? `sur ${formatDuration(webinar.video_duration_seconds)}` : ""}
                color="yellow"
              />
            </div>

            {/* Setup checklist */}
            {!demoMode && (
              <SetupChecklist
                webinar={webinar}
                onOpenScript={() => setShowScript(true)}
                onOpenSettings={() => setShowSettings(true)}
              />
            )}

            {/* Tabs */}
            <div className="flex gap-0 mb-5 border-b border-pulse-border animate-fade-in animate-fade-in-delay-2">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-5 py-3 text-sm font-medium transition-all -mb-px ${
                    tab === t.id
                      ? "text-white border-b-2 border-pulse-accent"
                      : "text-gray-500 hover:text-gray-300 border-b-2 border-transparent"
                  }`}
                >
                  <span className="mr-1.5">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="animate-fade-in animate-fade-in-delay-3 bg-pulse-surface border border-pulse-border rounded-2xl overflow-hidden">
              {tab === "retention" && (
                <div className="p-6">
                  <h3 className="font-display text-base font-semibold text-white mb-1">
                    Courbe de rétention
                  </h3>
                  <p className="text-xs text-gray-500 mb-5 leading-relaxed">
                    Pourcentage de viewers encore présents à chaque moment de la vidéo.
                    {chapters.length > 0 ? " Les bandes colorées représentent les chapitres du transcript." : " La zone rouge indique le plus gros décrochage."}
                  </p>
                  <RetentionChart sessions={sessions} videoDuration={webinar.video_duration_seconds} chapters={chapters} />
                  {chapters.length > 0 && (
                    <DiagnosticPanel
                      chapters={chapters}
                      retentionData={sessions}
                      videoDuration={webinar.video_duration_seconds}
                      webinarName={webinar.name}
                    />
                  )}
                </div>
              )}
              {tab === "viewers" && (
                <ViewerTable sessions={sessions} videoDuration={webinar.video_duration_seconds} />
              )}
              {tab === "daily" && (
                <div className="p-6">
                  <h3 className="font-display text-base font-semibold text-white mb-5">
                    Volume journalier
                  </h3>
                  <DailyChart sessions={sessions} />
                </div>
              )}
              {tab === "transcript" && (
                <div className="p-6">
                  <TranscriptTab webinar={webinar} />
                </div>
              )}
              {tab === "conversion" && (
                <ConversionTab webinar={webinar} sessions={sessions} />
              )}
              {tab === "tags" && (
                <div className="p-6">
                  <TaggingTab webinar={webinar} onOpenSettings={() => setShowSettings(true)} />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showScript && (
        <ScriptGenerator webinar={webinar} onClose={() => setShowScript(false)} />
      )}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
