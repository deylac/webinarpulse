"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DEMO_WEBINARS, generateDemoSessions } from "@/lib/utils";
import WebinarList from "@/components/WebinarList";
import Dashboard from "@/components/Dashboard";
import SettingsModal from "@/components/SettingsModal";

export default function Home() {
  const [demoMode, setDemoMode] = useState(false);
  const [webinars, setWebinars] = useState([]);
  const [selectedWebinar, setSelectedWebinar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    loadWebinars();
  }, []);

  async function loadWebinars() {
    try {
      const { data, error } = await supabase
        .from("webinars")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Connected to Supabase — show real data (even if empty)
      setWebinars(data || []);
    } catch {
      setDemoMode(true);
      setWebinars(DEMO_WEBINARS);
    } finally {
      setLoading(false);
    }
  }

  async function addWebinar(webinarData) {
    if (demoMode) {
      setWebinars((prev) => [...prev, { ...webinarData, id: "w" + Date.now() }]);
      return;
    }
    const { data, error } = await supabase
      .from("webinars")
      .insert(webinarData)
      .select()
      .single();
    if (!error && data) {
      setWebinars((prev) => [data, ...prev]);
    }
  }

  async function deleteWebinar(webinarId) {
    if (demoMode) {
      setWebinars((prev) => prev.filter((w) => w.id !== webinarId));
      return;
    }
    // Delete cascade: all related data → webinar
    try {
      // 1. Get session IDs for this webinar
      const { data: sessions } = await supabase
        .from("viewing_sessions")
        .select("id")
        .eq("webinar_id", webinarId);
      if (sessions?.length) {
        const sessionIds = sessions.map((s) => s.id);
        await supabase.from("tagging_log").delete().in("session_id", sessionIds);
        await supabase.from("viewing_events").delete().in("session_id", sessionIds);
        await supabase.from("viewing_sessions").delete().eq("webinar_id", webinarId);
      }
      // 2. Delete webinar-level related data
      await supabase.from("tagging_rules").delete().eq("webinar_id", webinarId);
      await supabase.from("webinar_chapters").delete().eq("webinar_id", webinarId);
      await supabase.from("webinar_transcripts").delete().eq("webinar_id", webinarId);
      // 3. Delete the webinar itself
      const { error } = await supabase.from("webinars").delete().eq("id", webinarId);
      if (!error) {
        setWebinars((prev) => prev.filter((w) => w.id !== webinarId));
        if (selectedWebinar?.id === webinarId) setSelectedWebinar(null);
      } else {
        console.error("Delete webinar failed:", error);
      }
    } catch (err) {
      console.error("Delete cascade failed:", err);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-pulse-border border-t-pulse-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (selectedWebinar) {
    return (
      <Dashboard
        webinar={selectedWebinar}
        demoMode={demoMode}
        webinars={webinars}
        onBack={() => setSelectedWebinar(null)}
      />
    );
  }

  return (
    <>
      <WebinarList
        webinars={webinars}
        demoMode={demoMode}
        onSelect={setSelectedWebinar}
        onAdd={addWebinar}
        onDelete={deleteWebinar}
        onOpenSettings={() => setShowSettings(true)}
      />
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </>
  );
}
