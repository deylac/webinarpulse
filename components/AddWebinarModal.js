"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function AddWebinarModal({ onClose, onAdd }) {
  const [name, setName] = useState("");
  const [vimeoId, setVimeoId] = useState("");
  const [duration, setDuration] = useState("");
  const [slug, setSlug] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountKey, setNewAccountKey] = useState("");
  const [addingAccount, setAddingAccount] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    const { data } = await supabase
      .from("systemeio_accounts")
      .select("id, name")
      .order("created_at", { ascending: true });
    const list = data || [];
    setAccounts(list);
    // Auto-select if only one account
    if (list.length === 1) setSelectedAccount(list[0].id);
  }

  async function createAccount() {
    if (!newAccountName.trim() || !newAccountKey.trim()) return;
    setAddingAccount(true);
    const { data, error } = await supabase
      .from("systemeio_accounts")
      .insert({ name: newAccountName.trim(), api_key: newAccountKey.trim() })
      .select()
      .single();
    if (!error && data) {
      setAccounts((prev) => [...prev, data]);
      setSelectedAccount(data.id);
      setShowNewAccount(false);
      setNewAccountName("");
      setNewAccountKey("");
    }
    setAddingAccount(false);
  }

  function handleSubmit() {
    if (!name || !vimeoId || !slug) return;
    onAdd({
      name,
      vimeo_video_id: vimeoId,
      video_duration_seconds: parseInt(duration) * 60 || 0,
      slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      systemeio_account_id: selectedAccount || null,
    });
  }

  const valid = name && vimeoId && slug;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-pulse-surface border border-pulse-border rounded-2xl p-7 animate-fade-in max-h-[90vh] overflow-y-auto"
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

          {/* Account selector */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-medium">
              Espace Systeme.io
            </label>
            {accounts.length > 0 ? (
              <>
                <select
                  value={selectedAccount}
                  onChange={(e) => {
                    if (e.target.value === "__new__") {
                      setShowNewAccount(true);
                      setSelectedAccount("");
                    } else {
                      setShowNewAccount(false);
                      setSelectedAccount(e.target.value);
                    }
                  }}
                  className="w-full bg-pulse-bg border border-pulse-border rounded-lg px-3.5 py-2.5 text-sm text-gray-300 outline-none focus:border-pulse-accent/50 focus:ring-1 focus:ring-pulse-accent/20 transition-all cursor-pointer"
                >
                  <option value="">— Aucun (configurer plus tard) —</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                  <option value="__new__">+ Ajouter un nouveau compte...</option>
                </select>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowNewAccount(true)}
                className="w-full text-left bg-pulse-bg border border-dashed border-pulse-border rounded-lg px-3.5 py-2.5 text-sm text-gray-500 hover:text-pulse-accent-light hover:border-pulse-accent/40 transition-all"
              >
                + Connecter un espace Systeme.io
              </button>
            )}

            {showNewAccount && (
              <div className="mt-3 bg-pulse-bg border border-pulse-border rounded-xl p-3.5 space-y-2.5">
                <input
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="Nom du compte (ex: Mon agence)"
                  className="w-full bg-pulse-surface border border-pulse-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 outline-none focus:border-pulse-accent/50"
                />
                <input
                  value={newAccountKey}
                  onChange={(e) => setNewAccountKey(e.target.value)}
                  type="password"
                  placeholder="Clé API Systeme.io"
                  className="w-full bg-pulse-surface border border-pulse-border rounded-lg px-3 py-2 text-sm text-gray-300 font-mono placeholder:text-gray-600 outline-none focus:border-pulse-accent/50"
                />
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-gray-600">
                    Profil → Paramètres → Public API keys
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowNewAccount(false)}
                      className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={createAccount}
                      disabled={!newAccountName.trim() || !newAccountKey.trim() || addingAccount}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-pulse-accent/20 text-pulse-accent-light hover:bg-pulse-accent/30 transition-colors disabled:opacity-40"
                    >
                      {addingAccount ? "..." : "Ajouter"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
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
