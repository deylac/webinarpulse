"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const SEGMENTS = [
  { id: "bounce", label: "Bounce", color: "bg-red-500/20 text-red-400", emoji: "🔴", default_min: 0, default_max: 10 },
  { id: "partial", label: "Partiel", color: "bg-orange-500/20 text-orange-400", emoji: "🟠", default_min: 10, default_max: 50 },
  { id: "engaged", label: "Engagé", color: "bg-yellow-500/20 text-yellow-400", emoji: "🟡", default_min: 50, default_max: 80 },
  { id: "completed", label: "Complété", color: "bg-emerald-500/20 text-emerald-400", emoji: "🟢", default_min: 80, default_max: 100 },
];

export default function TaggingTab({ webinar, onOpenSettings }) {
  const [rules, setRules] = useState([]);
  const [logs, setLogs] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(webinar.systemeio_account_id || "");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    loadData();
  }, [webinar.id]);

  async function loadData() {
    setLoading(true);
    try {
      const [rulesRes, logsRes, accountsRes] = await Promise.all([
        supabase
          .from("tagging_rules")
          .select("*")
          .eq("webinar_id", webinar.id)
          .order("min_percent", { ascending: true }),
        supabase
          .from("tagging_log")
          .select("*")
          .eq("webinar_id", webinar.id)
          .order("processed_at", { ascending: false })
          .limit(20),
        supabase
          .from("systemeio_accounts")
          .select("id, name")
          .order("created_at", { ascending: true }),
      ]);
      setRules(rulesRes.data || []);
      setLogs(logsRes.data || []);
      setAccounts(accountsRes.data || []);
      setSelectedAccountId(webinar.systemeio_account_id || "");
    } catch {
      // ok
    } finally {
      setLoading(false);
    }
  }

  async function assignAccount(accountId) {
    setSelectedAccountId(accountId);
    await supabase
      .from("webinars")
      .update({ systemeio_account_id: accountId || null })
      .eq("id", webinar.id);
  }

  async function createDefaultRules() {
    const slug = webinar.slug || webinar.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const rulesData = SEGMENTS.map((seg) => ({
      webinar_id: webinar.id,
      segment: seg.id,
      min_percent: seg.default_min,
      max_percent: seg.default_max,
      systemeio_tag_name: `wp-${slug}-${seg.id}`,
      enabled: true,
    }));

    const { data, error } = await supabase.from("tagging_rules").insert(rulesData).select();
    if (!error && data) {
      setRules(data);
    }
  }

  async function updateRule(ruleId, updates) {
    await supabase.from("tagging_rules").update(updates).eq("id", ruleId);
    setRules((prev) => prev.map((r) => (r.id === ruleId ? { ...r, ...updates } : r)));
  }

  async function triggerSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync-tags");
      const data = await res.json();
      setSyncResult(data);
      loadData();
    } catch (err) {
      setSyncResult({ error: err.message });
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-pulse-border border-t-pulse-accent rounded-full animate-spin" />
      </div>
    );
  }

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-white">Auto-tagging Systeme.io</h3>
          <p className="text-xs text-gray-500 mt-1">
            Pose automatiquement des tags CRM en fonction du % de vidéo regardée.
          </p>
        </div>
        <button
          onClick={triggerSync}
          disabled={syncing || !rules.length || !selectedAccountId}
          className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-xl border border-pulse-border bg-pulse-surface text-pulse-accent-light hover:bg-pulse-accent/10 hover:border-pulse-accent/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {syncing ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-pulse-accent/30 border-t-pulse-accent rounded-full animate-spin" />
              Sync...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Synchroniser
            </>
          )}
        </button>
      </div>

      {/* Account selector */}
      <div className="mb-6 bg-pulse-surface border border-pulse-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-2.5 h-2.5 rounded-full ${selectedAccount ? "bg-emerald-400 shadow-emerald-400/30 shadow-sm" : "bg-gray-600"}`} />
            <h4 className="text-sm font-semibold text-white">
              Compte Systeme.io
            </h4>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${selectedAccount ? "bg-emerald-500/15 text-emerald-400" : "bg-gray-500/15 text-gray-500"}`}>
              {selectedAccount ? selectedAccount.name : "Non attribué"}
            </span>
          </div>
          <button
            onClick={onOpenSettings}
            className="text-xs text-gray-500 hover:text-pulse-accent-light transition-colors flex items-center gap-1.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Gérer les comptes
          </button>
        </div>

        {accounts.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-gray-400 mb-3">
              Aucun compte Systeme.io configuré.
            </p>
            <button
              onClick={onOpenSettings}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-pulse-accent to-purple-500 text-white transition-all hover:shadow-lg hover:shadow-pulse-accent/20"
            >
              Ajouter un compte
            </button>
          </div>
        ) : (
          <select
            value={selectedAccountId}
            onChange={(e) => assignAccount(e.target.value)}
            className="w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-pulse-accent/50 cursor-pointer"
          >
            <option value="">— Sélectionner un compte —</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {syncResult && (
        <div className={`mb-4 px-4 py-3 rounded-xl border text-sm ${syncResult.error ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"}`}>
          {syncResult.error ? (
            <span>❌ {syncResult.error}</span>
          ) : syncResult.message ? (
            <span>ℹ️ {syncResult.message}</span>
          ) : (
            <span>✅ {syncResult.processed} traité(s), {syncResult.skipped || 0} ignoré(s), {syncResult.errors || 0} erreur(s)</span>
          )}
        </div>
      )}

      {/* Rules */}
      {rules.length === 0 ? (
        <div className="bg-pulse-surface border border-pulse-border rounded-xl p-6 text-center">
          <p className="text-sm text-gray-400 mb-4">
            Aucune règle de tagging configurée pour ce webinaire.
          </p>
          <button
            onClick={createDefaultRules}
            className="px-5 py-2.5 bg-gradient-to-r from-pulse-accent to-purple-500 text-white text-sm font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-pulse-accent/20"
          >
            Créer les règles par défaut
          </button>
          <p className="text-[10px] text-gray-600 mt-3">
            4 segments : bounce (&lt;10%), partiel (10-50%), engagé (50-80%), complété (≥80%)
          </p>
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {rules.map((rule) => {
            const seg = SEGMENTS.find((s) => s.id === rule.segment) || SEGMENTS[0];
            return (
              <div
                key={rule.id}
                className="bg-pulse-surface border border-pulse-border rounded-xl px-5 py-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg">{seg.emoji}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${seg.color}`}>
                        {seg.label}
                      </span>
                      <span className="text-xs text-gray-500">
                        {rule.min_percent}% – {rule.max_percent}%
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1 font-mono">
                      {rule.systemeio_tag_name}
                    </div>
                    {rule.systemeio_tag_id && (
                      <div className="text-[10px] text-gray-600 mt-0.5">
                        ID tag: {rule.systemeio_tag_id}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {editing && (
                    <input
                      type="text"
                      defaultValue={rule.systemeio_tag_id || ""}
                      placeholder="Tag ID"
                      className="w-20 px-2 py-1 text-xs bg-pulse-bg border border-pulse-border rounded-lg text-gray-300 focus:outline-none focus:border-pulse-accent/50"
                      onBlur={(e) => updateRule(rule.id, { systemeio_tag_id: e.target.value || null })}
                    />
                  )}
                  <button
                    onClick={() => updateRule(rule.id, { enabled: !rule.enabled })}
                    className={`w-10 h-5 rounded-full transition-all relative ${rule.enabled ? "bg-pulse-accent" : "bg-gray-700"}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all`}
                      style={{ left: rule.enabled ? "calc(100% - 18px)" : "2px" }}
                    />
                  </button>
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditing(!editing)}
              className="text-xs text-gray-500 hover:text-pulse-accent-light transition-colors"
            >
              {editing ? "✓ Terminé" : "⚙️ Configurer les Tag IDs"}
            </button>
          </div>
        </div>
      )}

      {/* Sync log */}
      {logs.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-white mb-3">Historique de synchronisation</h4>
          <div className="bg-pulse-surface border border-pulse-border rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-pulse-border text-gray-500">
                  <th className="text-left px-4 py-2.5 font-medium">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium">Segment</th>
                  <th className="text-left px-4 py-2.5 font-medium">Tag</th>
                  <th className="text-left px-4 py-2.5 font-medium">Statut</th>
                  <th className="text-left px-4 py-2.5 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const seg = SEGMENTS.find((s) => s.id === log.segment);
                  return (
                    <tr key={log.id} className="border-b border-pulse-border/50 last:border-0">
                      <td className="px-4 py-2.5 text-gray-300">{log.viewer_email}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full ${seg?.color || "bg-gray-500/20 text-gray-400"}`}>
                          {seg?.label || log.segment}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 font-mono">{log.systemeio_tag_name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-semibold ${log.status === "success" ? "text-emerald-400" : log.status === "contact_not_found" ? "text-yellow-400" : "text-red-400"}`}>
                          {log.status === "success" ? "✅" : log.status === "contact_not_found" ? "⚠️ introuvable" : "❌ erreur"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {new Date(log.processed_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
