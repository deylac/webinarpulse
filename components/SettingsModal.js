"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function SettingsModal({ onClose }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [showKeys, setShowKeys] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    setLoading(true);
    const { data } = await supabase
      .from("systemeio_accounts")
      .select("*")
      .order("created_at", { ascending: true });
    setAccounts(data || []);
    setLoading(false);
  }

  async function addAccount() {
    if (!newName.trim() || !newKey.trim()) return;
    setAdding(true);
    const { data, error } = await supabase
      .from("systemeio_accounts")
      .insert({ name: newName.trim(), api_key: newKey.trim() })
      .select()
      .single();
    if (!error && data) {
      setAccounts((prev) => [...prev, data]);
      setNewName("");
      setNewKey("");
    }
    setAdding(false);
  }

  async function deleteAccount(id) {
    await supabase.from("systemeio_accounts").delete().eq("id", id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }

  async function renameAccount(id) {
    if (!editName.trim()) return;
    await supabase
      .from("systemeio_accounts")
      .update({ name: editName.trim(), updated_at: new Date().toISOString() })
      .eq("id", id);
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, name: editName.trim() } : a))
    );
    setEditingId(null);
  }

  function maskKey(key) {
    if (!key) return "—";
    return key.slice(0, 8) + "•".repeat(12) + key.slice(-4);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-pulse-surface border border-pulse-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-pulse-border">
          <div>
            <h2 className="text-lg font-bold text-white">Paramètres</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Gérez vos comptes Systeme.io
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-pulse-border transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-pulse-border border-t-pulse-accent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Existing accounts */}
              {accounts.length > 0 && (
                <div className="space-y-3 mb-6">
                  <h3 className="text-xs font-semibold uppercase text-gray-500 tracking-wider">
                    Comptes connectés
                  </h3>
                  {accounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="bg-pulse-bg border border-pulse-border rounded-xl px-4 py-3.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-emerald-400/30 shadow-sm flex-shrink-0" />
                          {editingId === acc.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="bg-pulse-surface border border-pulse-border rounded-lg px-2.5 py-1 text-sm text-white focus:outline-none focus:border-pulse-accent/50"
                                autoFocus
                                onKeyDown={(e) => e.key === "Enter" && renameAccount(acc.id)}
                              />
                              <button
                                onClick={() => renameAccount(acc.id)}
                                className="text-xs text-pulse-accent-light hover:text-white transition-colors"
                              >
                                ✓
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <span className="text-sm font-medium text-white truncate">
                              {acc.name}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => {
                              setEditingId(acc.id);
                              setEditName(acc.name);
                            }}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-pulse-accent-light hover:bg-pulse-accent/10 transition-all"
                            title="Renommer"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => deleteAccount(acc.id)}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            title="Supprimer"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-mono">
                          {showKeys[acc.id] ? acc.api_key : maskKey(acc.api_key)}
                        </span>
                        <button
                          onClick={() =>
                            setShowKeys((prev) => ({ ...prev, [acc.id]: !prev[acc.id] }))
                          }
                          className="text-gray-600 hover:text-gray-400 transition-colors"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            {showKeys[acc.id] ? (
                              <>
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                              </>
                            ) : (
                              <>
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </>
                            )}
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new account */}
              <div className="bg-pulse-bg border border-dashed border-pulse-border rounded-xl p-4">
                <h3 className="text-xs font-semibold uppercase text-gray-500 tracking-wider mb-3">
                  Ajouter un compte
                </h3>
                <div className="space-y-2.5">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nom du compte (ex: Mon agence)"
                    className="w-full bg-pulse-surface border border-pulse-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-pulse-accent/50"
                  />
                  <input
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    type="password"
                    placeholder="Clé API Systeme.io"
                    className="w-full bg-pulse-surface border border-pulse-border rounded-lg px-3 py-2 text-sm text-gray-300 font-mono placeholder:text-gray-600 focus:outline-none focus:border-pulse-accent/50"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-gray-600">
                      Systeme.io → Profil → Paramètres → Public API keys
                    </p>
                    <button
                      onClick={addAccount}
                      disabled={!newName.trim() || !newKey.trim() || adding}
                      className="px-4 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-pulse-accent to-purple-500 text-white transition-all hover:shadow-lg hover:shadow-pulse-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {adding ? "..." : "Ajouter"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
