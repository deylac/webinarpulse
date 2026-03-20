"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function SetupChecklist({ webinar, onOpenScript, onOpenSettings }) {
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkSetup();
  }, [webinar]);

  async function checkSetup() {
    setLoading(true);

    // Check if user already dismissed for this webinar
    try {
      const key = `wp_checklist_${webinar.id}`;
      if (localStorage.getItem(key) === "done") {
        setDismissed(true);
        setLoading(false);
        return;
      }
    } catch {}

    const results = [];

    // 1. Scripts — check if any sessions exist
    try {
      const { count } = await supabase
        .from("viewing_sessions")
        .select("id", { count: "exact", head: true })
        .eq("webinar_id", webinar.id);
      results.push({
        id: "scripts",
        label: "Installer les scripts",
        description: "Collez les 2 scripts sur vos pages Systeme.io pour capturer les emails et suivre le visionnage.",
        done: (count || 0) > 0,
        required: true,
        action: "script",
      });
    } catch {
      results.push({
        id: "scripts",
        label: "Installer les scripts",
        description: "Collez les 2 scripts sur vos pages Systeme.io pour capturer les emails et suivre le visionnage.",
        done: false,
        required: true,
        action: "script",
      });
    }

    // 2. Systeme.io account connected
    try {
      const { count } = await supabase
        .from("systemeio_accounts")
        .select("id", { count: "exact", head: true });
      results.push({
        id: "account",
        label: "Connecter un compte Systeme.io",
        description: "Ajoutez votre clé API pour activer l'auto-tagging et la synchronisation CRM.",
        done: (count || 0) > 0,
        required: true,
        action: "settings",
      });
    } catch {
      results.push({
        id: "account",
        label: "Connecter un compte Systeme.io",
        description: "Ajoutez votre clé API pour activer l'auto-tagging et la synchronisation CRM.",
        done: false,
        required: true,
        action: "settings",
      });
    }

    // 3. Webhooks — check if webhook_secret is set on any account
    try {
      const { count } = await supabase
        .from("systemeio_accounts")
        .select("id", { count: "exact", head: true })
        .not("webhook_secret", "is", null);
      results.push({
        id: "webhooks",
        label: "Configurer les webhooks",
        description: "Renforcez l'identification des viewers et activez le suivi des conversions (achats).",
        done: (count || 0) > 0,
        required: false,
        action: "settings",
      });
    } catch {
      results.push({
        id: "webhooks",
        label: "Configurer les webhooks",
        description: "Renforcez l'identification des viewers et activez le suivi des conversions (achats).",
        done: false,
        required: false,
        action: "settings",
      });
    }

    // 4. Tagging rules
    try {
      const { count } = await supabase
        .from("tagging_rules")
        .select("id", { count: "exact", head: true })
        .eq("webinar_id", webinar.id);
      results.push({
        id: "tagging",
        label: "Créer les règles de tagging",
        description: "Définissez les seuils pour taguer automatiquement vos contacts dans Systeme.io selon leur engagement.",
        done: (count || 0) > 0,
        required: false,
        action: "tags",
      });
    } catch {
      results.push({
        id: "tagging",
        label: "Créer les règles de tagging",
        description: "Définissez les seuils pour taguer automatiquement vos contacts dans Systeme.io selon leur engagement.",
        done: false,
        required: false,
        action: "tags",
      });
    }

    setSteps(results);
    setLoading(false);
  }

  function handleDismiss() {
    try {
      localStorage.setItem(`wp_checklist_${webinar.id}`, "done");
    } catch {}
    setDismissed(true);
  }

  if (loading || dismissed) return null;

  const doneCount = steps.filter((s) => s.done).length;
  const totalCount = steps.length;
  const progress = Math.round((doneCount / totalCount) * 100);

  // Hide if everything is done
  if (doneCount === totalCount) return null;

  return (
    <div className="mb-6 bg-pulse-surface border border-pulse-border rounded-2xl overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-pulse-accent to-purple-500 flex items-center justify-center text-sm">
            🚀
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">
              Configuration
            </h3>
            <p className="text-[11px] text-gray-500">
              {doneCount}/{totalCount} étapes terminées
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
        >
          Masquer
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-5 pb-3">
        <div className="h-1.5 bg-pulse-bg rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-pulse-accent to-purple-500 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="px-5 pb-4 space-y-1">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`flex items-start gap-3 px-3 py-2.5 rounded-xl transition-colors ${
              step.done
                ? "opacity-50"
                : "hover:bg-pulse-bg/50 cursor-pointer"
            }`}
            onClick={() => {
              if (step.done) return;
              if (step.action === "script") onOpenScript?.();
              else if (step.action === "settings") onOpenSettings?.();
              else if (step.action === "tags") {
                // Navigate to tags tab — dispatch custom event
                document.dispatchEvent(new CustomEvent("wp-goto-tab", { detail: "tags" }));
              }
            }}
          >
            {/* Checkbox */}
            <div
              className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${
                step.done
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "border border-pulse-border text-transparent"
              }`}
            >
              {step.done && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${step.done ? "text-gray-500 line-through" : "text-white"}`}>
                  {step.label}
                </span>
                {step.required && !step.done && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-medium">
                    requis
                  </span>
                )}
                {!step.required && !step.done && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-medium">
                    recommandé
                  </span>
                )}
              </div>
              {!step.done && (
                <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">
                  {step.description}
                </p>
              )}
            </div>

            {/* Arrow for incomplete steps */}
            {!step.done && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-600 flex-shrink-0 mt-1">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
