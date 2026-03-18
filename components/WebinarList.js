"use client";

import { useState } from "react";
import { formatDuration } from "@/lib/utils";
import AddWebinarModal from "./AddWebinarModal";

export default function WebinarList({ webinars, demoMode, onSelect, onAdd, onDelete }) {
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e, webinar) {
    e.stopPropagation();
    if (confirmDelete === webinar.id) {
      setDeleting(true);
      await onDelete(webinar.id);
      setDeleting(false);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(webinar.id);
      // Auto-cancel after 3 seconds
      setTimeout(() => setConfirmDelete((c) => (c === webinar.id ? null : c)), 3000);
    }
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-5 py-12">
        {/* Header */}
        <div className="mb-10 animate-fade-in">
          <div className="flex items-center gap-3.5 mb-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-pulse-accent to-purple-500 flex items-center justify-center shadow-lg shadow-pulse-accent/20">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="20" x2="12" y2="10" />
                <line x1="18" y1="20" x2="18" y2="4" />
                <line x1="6" y1="20" x2="6" y2="16" />
              </svg>
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight text-white">
                WebinarPulse
              </h1>
              <p className="text-sm text-gray-500 font-body">
                Analytics pour webinaires evergreen
              </p>
            </div>
          </div>
        </div>

        {demoMode && (
          <div className="animate-fade-in animate-fade-in-delay-1 mb-6 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-5 py-3.5 text-sm text-yellow-400/90 leading-relaxed">
            <strong className="font-semibold text-yellow-400">Mode démo.</strong>{" "}
            Connecte Supabase via les variables d&apos;environnement pour voir tes données réelles.
          </div>
        )}

        {/* Webinar cards */}
        <div className="flex flex-col gap-3">
          {webinars.map((w, i) => (
            <div
              key={w.id}
              className={`animate-fade-in animate-fade-in-delay-${Math.min(i + 1, 4)} group relative`}
            >
              <button
                onClick={() => onSelect(w)}
                className="w-full text-left bg-pulse-surface border border-pulse-border rounded-2xl px-6 py-5 transition-all duration-200 hover:border-pulse-accent/50 hover:bg-pulse-accent/5 hover:shadow-lg hover:shadow-pulse-accent/5"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 pr-12">
                    <div className="text-[15px] font-semibold text-white truncate group-hover:text-pulse-accent-light transition-colors">
                      {w.name}
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
                      <span className="flex items-center gap-1.5">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        Vimeo: {w.vimeo_video_id}
                      </span>
                      {w.video_duration_seconds > 0 && (
                        <span className="flex items-center gap-1.5">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          {formatDuration(w.video_duration_seconds)}
                        </span>
                      )}
                    </div>
                  </div>
                  <svg
                    width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="text-gray-600 group-hover:text-pulse-accent-light group-hover:translate-x-0.5 transition-all flex-shrink-0"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </button>

              {/* Delete button */}
              <button
                onClick={(e) => handleDelete(e, w)}
                disabled={deleting && confirmDelete === w.id}
                className={`absolute top-3.5 right-3.5 z-10 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                  confirmDelete === w.id
                    ? "bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 scale-100"
                    : "opacity-0 group-hover:opacity-100 bg-pulse-bg/80 border border-pulse-border text-gray-500 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10"
                }`}
                title="Supprimer ce webinaire"
              >
                {deleting && confirmDelete === w.id ? (
                  <div className="w-3.5 h-3.5 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                ) : confirmDelete === w.id ? (
                  "Confirmer ?"
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                )}
              </button>
            </div>
          ))}

          <button
            onClick={() => setShowAdd(true)}
            className="w-full rounded-2xl border-2 border-dashed border-pulse-border px-6 py-5 text-sm text-gray-500 transition-all hover:border-pulse-accent/40 hover:text-pulse-accent-light hover:bg-pulse-accent/5"
          >
            + Ajouter un webinaire
          </button>
        </div>
      </div>

      {showAdd && (
        <AddWebinarModal
          onClose={() => setShowAdd(false)}
          onAdd={(w) => { onAdd(w); setShowAdd(false); }}
        />
      )}
    </div>
  );
}
