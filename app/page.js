"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DEMO_WEBINARS, generateDemoSessions } from "@/lib/utils";
import WebinarList from "@/components/WebinarList";
import Dashboard from "@/components/Dashboard";

export default function Home() {
  const [demoMode, setDemoMode] = useState(false);
  const [webinars, setWebinars] = useState([]);
  const [selectedWebinar, setSelectedWebinar] = useState(null);
  const [loading, setLoading] = useState(true);

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

      if (data && data.length > 0) {
        setWebinars(data);
      } else {
        setDemoMode(true);
        setWebinars(DEMO_WEBINARS);
      }
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
    <WebinarList
      webinars={webinars}
      demoMode={demoMode}
      onSelect={setSelectedWebinar}
      onAdd={addWebinar}
    />
  );
}
