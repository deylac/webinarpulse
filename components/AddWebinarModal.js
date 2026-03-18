"use client";

import { useState } from "react";

export default function AddWebinarModal({ onClose, onAdd }) {
  const [name, setName] = useState("");
  const [vimeoId, setVimeoId] = useState("");
  const [duration, setDuration] = useState("");
  const [slug, setSlug] = useState("");

  function handleSubmit() {
    if (!name || !vimeoId || !slug) return;
    onAdd({
      name,
      vimeo_video_id: vimeoId,
      video_duration_seconds: parseInt(duration) * 60 || 0,
      slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    });
  }

  const valid = name && vimeoId && slug;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-pulse-surface border border-pulse-border rounded-2xl p-7 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg font-bold text-white mb-6">
          Ajouter un webinaire
        </h3>

        <div className="flex flex-col gap-4">
          <Field label="Nom du webinaire" value={name} onChange={setName} placeholder="Bootcamp LinkedIn IA" />
          <Field label="ID Vimeo (le numéro dans l'URL)" value={vimeoId} onChange={setVimeoId} placeholder="123456789" />
          <Field label="Durée de la vidéo (minutes)" value={duration} onChange={setDuration} placeholder="90" type="number" />
          <Field label="Slug (identifiant URL unique)" value={slug} onChange={setSlug} placeholder="bootcamp-linkedin" />
        </div>

        <div className="flex gap-3 mt-7">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-pulse-border px-4 py-2.5 text-sm text-gray-400 hover:bg-white/5 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={!valid}
            className="flex-1 rounded-xl bg-pulse-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5 font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-pulse-bg border border-pulse-border rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-gray-600 outline-none focus:border-pulse-accent/50 focus:ring-1 focus:ring-pulse-accent/20 transition-all"
      />
    </div>
  );
}
