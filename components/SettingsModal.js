"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function SettingsModal({ onClose }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [adding, setAdding] = useState(false);
  const [showKeys, setShowKeys] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [editSecret, setEditSecret] = useState({});
  const [savingSecret, setSavingSecret] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
  const [webhookStatuses, setWebhookStatuses] = useState({});

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const optinUrl = `${baseUrl}/api/webhook/optin`;
  const saleUrl = `${baseUrl}/api/webhook/sale`;

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
      .insert({
        name: newName.trim(),
        api_key: newKey.trim(),
        webhook_secret: newSecret.trim() || null,
      })
      .select()
      .single();
    if (!error && data) {
      setAccounts((prev) => [...prev, data]);
      setNewName("");
      setNewKey("");
      setNewSecret("");
    }
    setAdding(false);
  }

  async function deleteAccount(id) {
    await supabase.from("systemeio_accounts").delete().eq("id", id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  async function renameAccount(id) {
    if (!editName.trim()) return;
    await supabase
      .from("systemeio_accounts")
      .update({ name: editName.trim() })
      .eq("id", id);
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, name: editName.trim() } : a))
    );
    setEditingId(null);
  }

  async function saveSecret(id) {
    setSavingSecret(id);
    const secret = editSecret[id] || "";
    await supabase
      .from("systemeio_accounts")
      .update({ webhook_secret: secret.trim() || null })
      .eq("id", id);
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, webhook_secret: secret.trim() || null } : a
      )
    );
    // Clear edit state so field shows saved value from account
    setEditSecret((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSavingSecret(null);
    // Show saved confirmation
    setCopiedField(`saved-${id}`);
    setTimeout(() => setCopiedField(null), 2000);
  }

  async function checkWebhookStatus(accountId) {
    try {
      const { data: logs } = await supabase
        .from("webhook_log")
        .select("event_type, signature_valid, created_at")
        .order("created_at", { ascending: false })
        .limit(10);

      if (!logs || logs.length === 0) {
        setWebhookStatuses((prev) => ({ ...prev, [accountId]: "none" }));
      } else if (logs.some((l) => l.signature_valid)) {
        setWebhookStatuses((prev) => ({ ...prev, [accountId]: "active" }));
      } else {
        setWebhookStatuses((prev) => ({ ...prev, [accountId]: "invalid" }));
      }
    } catch {
      setWebhookStatuses((prev) => ({ ...prev, [accountId]: "none" }));
    }
  }

  function maskKey(key) {
    if (!key) return "—";
    return key.slice(0, 8) + "•".repeat(12) + key.slice(-4);
  }

  function generateSecret() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let secret = "wp_";
    for (let i = 0; i < 24; i++) secret += chars[Math.floor(Math.random() * chars.length)];
    return secret;
  }

  function handleCopy(field, text) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  }

  const statusLabels = {
    none: { icon: "🔴", text: "Aucun webhook reçu", color: "text-red-400" },
    invalid: { icon: "🟡", text: "Signatures invalides", color: "text-yellow-400" },
    active: { icon: "🟢", text: "Webhooks actifs", color: "text-emerald-400" },
  };

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
                      className="bg-pulse-bg border border-pulse-border rounded-xl overflow-hidden"
                    >
                      {/* Account header — clickable to expand */}
                      <div
                        className="px-4 py-3.5 cursor-pointer hover:bg-pulse-surface/30 transition-colors"
                        onClick={() =>
                          setExpandedId(expandedId === acc.id ? null : acc.id)
                        }
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-emerald-400/30 shadow-sm flex-shrink-0" />
                            {editingId === acc.id ? (
                              <div
                                className="flex items-center gap-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="bg-pulse-surface border border-pulse-border rounded-lg px-2.5 py-1 text-sm text-white focus:outline-none focus:border-pulse-accent/50"
                                  autoFocus
                                  onKeyDown={(e) =>
                                    e.key === "Enter" && renameAccount(acc.id)
                                  }
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
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className={`text-gray-500 transition-transform ${
                                expandedId === acc.id ? "rotate-180" : ""
                              }`}
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* Expanded profile */}
                      {expandedId === acc.id && (
                        <div className="px-4 pb-4 pt-1 border-t border-pulse-border/50 space-y-4">
                          {/* API Key */}
                          <div>
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
                              Clé API Systeme.io
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 font-mono truncate flex-1">
                                {showKeys[acc.id]
                                  ? acc.api_key
                                  : maskKey(acc.api_key)}
                              </span>
                              <button
                                onClick={() =>
                                  setShowKeys((prev) => ({
                                    ...prev,
                                    [acc.id]: !prev[acc.id],
                                  }))
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

                          {/* Webhook Secret */}
                          <div>
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
                              Secret Webhook
                            </div>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={
                                  editSecret[acc.id] !== undefined
                                    ? editSecret[acc.id]
                                    : acc.webhook_secret || ""
                                }
                                onChange={(e) =>
                                  setEditSecret((prev) => ({
                                    ...prev,
                                    [acc.id]: e.target.value,
                                  }))
                                }
                                placeholder="Cliquez Générer →"
                                className="flex-1 bg-pulse-surface border border-pulse-border rounded-lg px-2.5 py-1.5 text-xs text-gray-300 font-mono placeholder:text-gray-600 focus:outline-none focus:border-pulse-accent/50"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setEditSecret((prev) => ({
                                    ...prev,
                                    [acc.id]: generateSecret(),
                                  }))
                                }
                                className="text-[10px] px-2 py-1.5 rounded-lg bg-pulse-surface border border-pulse-border text-gray-400 hover:text-white hover:border-pulse-accent/40 transition-all"
                                title="Générer un secret aléatoire"
                              >
                                🎲
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const val = editSecret[acc.id] !== undefined ? editSecret[acc.id] : acc.webhook_secret || "";
                                  if (val) handleCopy(`secret-${acc.id}`, val);
                                }}
                                className={`text-[10px] px-2 py-1.5 rounded-lg transition-all ${
                                  copiedField === `secret-${acc.id}`
                                    ? "bg-emerald-500 text-white"
                                    : "bg-pulse-surface border border-pulse-border text-gray-400 hover:text-white hover:border-pulse-accent/40"
                                }`}
                                title="Copier le secret"
                              >
                                {copiedField === `secret-${acc.id}` ? "✓" : "📋"}
                              </button>
                              <button
                                onClick={() => saveSecret(acc.id)}
                                disabled={savingSecret === acc.id}
                                className="text-[10px] px-2.5 py-1.5 rounded-lg bg-pulse-accent/20 text-pulse-accent-light hover:bg-pulse-accent/30 transition-colors disabled:opacity-40 font-medium"
                              >
                                {savingSecret === acc.id ? "..." : "Sauver"}
                              </button>
                            </div>
                            {copiedField === `saved-${acc.id}` && (
                              <p className="text-[10px] text-emerald-400 mt-1">
                                ✅ Secret sauvegardé
                              </p>
                            )}
                            <p className="text-[10px] text-gray-600 mt-1">
                              Copiez ce secret et collez-le dans le champ
                              « Secret » de chaque webhook dans Systeme.io
                            </p>
                          </div>

                          {/* Webhook URLs */}
                          <div>
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
                              URLs des webhooks
                            </div>
                            <div className="space-y-1.5">
                              <div>
                                <div className="text-[9px] text-gray-600 mb-0.5">URL Optin (inscriptions)</div>
                                <CopyRow
                                  label="Copier"
                                  value={optinUrl}
                                  copied={copiedField === `optin-${acc.id}`}
                                  onCopy={() =>
                                    handleCopy(`optin-${acc.id}`, optinUrl)
                                  }
                                />
                              </div>
                              <div>
                                <div className="text-[9px] text-gray-600 mb-0.5">URL Ventes (achats + annulations)</div>
                                <CopyRow
                                  label="Copier"
                                  value={saleUrl}
                                  copied={copiedField === `sale-${acc.id}`}
                                  onCopy={() =>
                                    handleCopy(`sale-${acc.id}`, saleUrl)
                                  }
                                />
                              </div>
                            </div>
                          </div>

                          {/* Instructions */}
                          <div className="bg-pulse-surface border border-pulse-border rounded-lg p-3">
                            <div className="text-[10px] text-gray-300 font-medium mb-2">
                              Créer 2 webhooks dans Systeme.io :
                            </div>
                            <div className="space-y-2.5">
                              <div className="text-[10px] text-gray-400">
                                <div className="text-gray-300 font-medium mb-0.5">Webhook 1 — Inscriptions</div>
                                <div>• <span className="text-gray-500">Nom :</span> <span className="text-gray-300">WebinarPulse - Optin</span></div>
                                <div>• <span className="text-gray-500">URL :</span> copier l'URL <span className="text-gray-300">Optin</span> ci-dessus</div>
                                <div>• <span className="text-gray-500">Secret :</span> coller le secret ci-dessus</div>
                                <div>• <span className="text-gray-500">Événement :</span> cocher <span className="text-white font-medium">« Opt-In »</span></div>
                              </div>
                              <div className="text-[10px] text-gray-400">
                                <div className="text-gray-300 font-medium mb-0.5">Webhook 2 — Ventes</div>
                                <div>• <span className="text-gray-500">Nom :</span> <span className="text-gray-300">WebinarPulse - Ventes</span></div>
                                <div>• <span className="text-gray-500">URL :</span> copier l'URL <span className="text-gray-300">Ventes</span> ci-dessus</div>
                                <div>• <span className="text-gray-500">Secret :</span> coller le même secret</div>
                                <div>• <span className="text-gray-500">Événements :</span> cocher <span className="text-white font-medium">« Nouvelle vente »</span> et <span className="text-white font-medium">« Vente annulée »</span></div>
                              </div>
                            </div>
                            <p className="text-[10px] text-gray-600 mt-2">
                              Accès : Photo de profil → Paramètres → Webhooks → Créer
                            </p>
                          </div>

                          {/* Webhook status + actions */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => checkWebhookStatus(acc.id)}
                                className="flex items-center gap-1.5 text-[10px] text-pulse-accent-light hover:text-white transition-colors"
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="23 4 23 10 17 10" />
                                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                </svg>
                                Vérifier
                              </button>
                              {webhookStatuses[acc.id] && (
                                <span
                                  className={`text-[10px] ${
                                    statusLabels[webhookStatuses[acc.id]].color
                                  }`}
                                >
                                  {statusLabels[webhookStatuses[acc.id]].icon}{" "}
                                  {statusLabels[webhookStatuses[acc.id]].text}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingId(acc.id);
                                  setEditName(acc.name);
                                }}
                                className="p-1.5 rounded-lg text-gray-500 hover:text-pulse-accent-light hover:bg-pulse-accent/10 transition-all"
                                title="Renommer"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteAccount(acc.id);
                                }}
                                className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                title="Supprimer"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add new account */}
              {accounts.length === 0 ? (
                <div className="bg-pulse-bg border border-dashed border-pulse-border rounded-xl p-4">
                  <h3 className="text-xs font-semibold uppercase text-gray-500 tracking-wider mb-3">
                    Connecter un compte Systeme.io
                  </h3>
                  <div className="space-y-2.5">
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Nom du compte (ex: Mon agence)"
                      className="w-full bg-pulse-surface border border-pulse-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-pulse-accent/50"
                    />
                    <p className="text-[10px] text-gray-500 mb-1">
                      Systeme.io → Profil → Paramètres → Public API keys
                    </p>
                    <input
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      type="password"
                      placeholder="Clé API Systeme.io"
                      className="w-full bg-pulse-surface border border-pulse-border rounded-lg px-3 py-2 text-sm text-gray-300 font-mono placeholder:text-gray-600 focus:outline-none focus:border-pulse-accent/50"
                    />
                    <div className="flex gap-2">
                      <input
                        value={newSecret}
                        onChange={(e) => setNewSecret(e.target.value)}
                        type="text"
                        placeholder="Secret Webhook"
                        className="flex-1 bg-pulse-surface border border-pulse-border rounded-lg px-3 py-2 text-sm text-gray-300 font-mono placeholder:text-gray-600 focus:outline-none focus:border-pulse-accent/50"
                      />
                      <button
                        type="button"
                        onClick={() => setNewSecret(generateSecret())}
                        className="px-3 py-2 text-xs font-medium rounded-lg bg-pulse-surface border border-pulse-border text-gray-400 hover:text-white hover:border-pulse-accent/40 transition-all whitespace-nowrap"
                      >
                        🎲 Générer
                      </button>
                    </div>
                    <div className="flex items-center justify-end">
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
              ) : (
                <>
                  <button
                    onClick={() => {
                      const el = document.getElementById('wp-add-account');
                      if (el) el.classList.toggle('hidden');
                    }}
                    className="w-full text-center py-2.5 text-xs text-gray-500 hover:text-pulse-accent-light transition-colors"
                  >
                    + Connecter un autre compte Systeme.io
                  </button>
                  <div id="wp-add-account" className="hidden bg-pulse-bg border border-dashed border-pulse-border rounded-xl p-4">
                    <h3 className="text-xs font-semibold uppercase text-gray-500 tracking-wider mb-3">
                      Nouveau compte
                    </h3>
                    <div className="space-y-2.5">
                      <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Nom du compte (ex: Mon agence)"
                        className="w-full bg-pulse-surface border border-pulse-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-pulse-accent/50"
                      />
                      <p className="text-[10px] text-gray-500 mb-1">
                        Systeme.io → Profil → Paramètres → Public API keys
                      </p>
                      <input
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value)}
                        type="password"
                        placeholder="Clé API Systeme.io"
                        className="w-full bg-pulse-surface border border-pulse-border rounded-lg px-3 py-2 text-sm text-gray-300 font-mono placeholder:text-gray-600 focus:outline-none focus:border-pulse-accent/50"
                      />
                      <div className="flex gap-2">
                        <input
                          value={newSecret}
                          onChange={(e) => setNewSecret(e.target.value)}
                          type="text"
                          placeholder="Secret Webhook"
                          className="flex-1 bg-pulse-surface border border-pulse-border rounded-lg px-3 py-2 text-sm text-gray-300 font-mono placeholder:text-gray-600 focus:outline-none focus:border-pulse-accent/50"
                        />
                        <button
                          type="button"
                          onClick={() => setNewSecret(generateSecret())}
                          className="px-3 py-2 text-xs font-medium rounded-lg bg-pulse-surface border border-pulse-border text-gray-400 hover:text-white hover:border-pulse-accent/40 transition-all whitespace-nowrap"
                        >
                          🎲 Générer
                        </button>
                      </div>
                      <div className="flex items-center justify-end">
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Copyable URL row
function CopyRow({ label, value, copied, onCopy }) {
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 text-[10px] text-gray-400 bg-pulse-deep border border-pulse-border rounded px-2 py-1 font-mono truncate">
        {value}
      </code>
      <button
        onClick={onCopy}
        className={`text-[10px] px-2 py-1 rounded font-medium transition-all flex-shrink-0 ${
          copied
            ? "bg-emerald-500 text-white"
            : "bg-pulse-surface border border-pulse-border text-gray-400 hover:text-white"
        }`}
      >
        {copied ? "✓" : label}
      </button>
    </div>
  );
}
