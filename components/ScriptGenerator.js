"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function ScriptGenerator({ webinar, onClose }) {
  const [copiedStep, setCopiedStep] = useState(null);
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(true);

  const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const SB_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    setChecking(true);
    try {
      const { data: sessions } = await supabase
        .from("viewing_sessions")
        .select("id, viewer:viewers(email)")
        .eq("webinar_id", webinar.id);

      const total = sessions?.length || 0;
      const identified = sessions?.filter((s) => s.viewer?.email).length || 0;

      if (total === 0) setStatus({ level: "none", total: 0, identified: 0 });
      else if (identified === 0) setStatus({ level: "anonymous", total, identified: 0 });
      else setStatus({ level: "active", total, identified });
    } catch {
      setStatus({ level: "none", total: 0, identified: 0 });
    } finally {
      setChecking(false);
    }
  }

  // --- Script Optin ---
  const optinScript = `<!-- WebinarPulse — Identification (page optin) -->
<script>
(function() {
  var SB_URL = "${SB_URL}";
  var SB_KEY = "${SB_KEY}";
  var WEBINAR_SLUG = "${webinar.slug || ""}";

  document.addEventListener("submit", function(e) {
    var form = e.target;
    var emailInput = form.querySelector('input[type="email"]')
      || form.querySelector('input[name*="email"]');
    if (!emailInput || !emailInput.value) return;

    var email = emailInput.value.trim().toLowerCase();
    if (!email || email.indexOf("@") === -1) return;

    var firstNameInput = form.querySelector(
      'input[name*="first_name"], input[name*="prenom"], input[name*="fname"]'
    );
    var firstName = firstNameInput ? firstNameInput.value.trim() : null;

    var data = JSON.stringify({
      email: email,
      firstName: firstName,
      slug: WEBINAR_SLUG,
      ts: Date.now()
    });
    document.cookie = "wp_viewer=" + encodeURIComponent(data)
      + "; path=/; max-age=86400; SameSite=Lax";

    fetch(SB_URL + "/rest/v1/pending_registrations", {
      method: "POST",
      headers: {
        "apikey": SB_KEY,
        "Authorization": "Bearer " + SB_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        email: email,
        webinar_slug: WEBINAR_SLUG,
        first_name: firstName,
        source: "form_intercept"
      }),
      keepalive: true
    }).catch(function() {});
  }, true);
})();
<` + `/script>`;

  // --- Script Tracking ---
  const trackingScript = `<!-- WebinarPulse — Tracking (page webinaire) -->
<script src="https://player.vimeo.com/api/player.js"><` + `/script>
<script>
(function() {
  var SB_URL = "${SB_URL}";
  var SB_KEY = "${SB_KEY}";
  var WEBINAR_ID = "${webinar.id}";

  var sessionId = null;
  var lastUpdate = 0;
  var maxSec = 0;
  var maxPct = 0;

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    if (match) {
      try { return JSON.parse(decodeURIComponent(match[2])); }
      catch(e) { return null; }
    }
    return null;
  }

  function getViewerEmail() {
    var cookie = getCookie("wp_viewer");
    if (cookie && cookie.email) return cookie.email;
    var params = new URLSearchParams(window.location.search);
    return params.get("email")
      || params.get("contact_email")
      || params.get("e")
      || null;
  }

  function sb(path, method, body, extraHeaders) {
    var h = {
      "apikey": SB_KEY,
      "Authorization": "Bearer " + SB_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    };
    if (extraHeaders) for (var k in extraHeaders) h[k] = extraHeaders[k];
    return fetch(SB_URL + "/rest/v1/" + path, {
      method: method || "GET", headers: h,
      body: body ? JSON.stringify(body) : undefined
    }).then(function(r) { return r.json(); });
  }

  function initSession() {
    var email = getViewerEmail();
    var anonId = "anon-" + Math.random().toString(36).substr(2, 12);

    var viewerData = email
      ? { email: email, anonymous_id: null }
      : { email: null, anonymous_id: anonId };

    sb("viewers", "POST", viewerData,
      { "Prefer": "return=representation,resolution=merge-duplicates" }
    )
    .then(function(v) {
      var vid = Array.isArray(v) ? v[0].id : v.id;
      return sb("viewing_sessions", "POST", {
        webinar_id: WEBINAR_ID,
        viewer_id: vid,
        user_agent: navigator.userAgent,
        referrer: document.referrer || null
      });
    })
    .then(function(s) {
      sessionId = Array.isArray(s) ? s[0].id : s.id;
      initPlayer();
    })
    .catch(function(e) { console.warn("WebinarPulse:", e); });
  }

  function sendEvent(type, sec, pct) {
    if (!sessionId) return;
    sb("viewing_events", "POST", {
      session_id: sessionId, event_type: type,
      video_seconds: sec || 0, video_percent: pct || 0
    }).catch(function() {});
  }

  function updateSession(sec, pct) {
    if (!sessionId) return;
    if (sec > maxSec) maxSec = sec;
    if (pct > maxPct) maxPct = pct;
    var now = Date.now();
    if (now - lastUpdate < 10000) return;
    lastUpdate = now;
    fetch(SB_URL + "/rest/v1/viewing_sessions?id=eq." + sessionId, {
      method: "PATCH",
      headers: {
        "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY,
        "Content-Type": "application/json", "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        duration_seconds: Math.round(maxSec),
        max_video_percent: Math.round(maxPct * 100),
        max_video_seconds: Math.round(maxSec),
        ended_at: new Date().toISOString()
      })
    }).catch(function() {});
  }

  function initPlayer() {
    var iframes = document.querySelectorAll("iframe[src*='vimeo']");
    if (!iframes.length) {
      setTimeout(function() {
        iframes = document.querySelectorAll("iframe[src*='vimeo']");
        if (iframes.length) setupPlayer(iframes[0]);
      }, 2000);
      return;
    }
    setupPlayer(iframes[0]);
  }

  function setupPlayer(iframe) {
    var player = new Vimeo.Player(iframe);

    player.on("play", function(d) {
      sendEvent("play", d.seconds, d.percent);
    });
    player.on("pause", function(d) {
      sendEvent("pause", d.seconds, d.percent);
      updateSession(d.seconds, d.percent);
    });
    player.on("seeked", function(d) {
      sendEvent("seeked", d.seconds, d.percent);
    });
    player.on("timeupdate", function(d) {
      updateSession(d.seconds, d.percent);
    });
    player.on("ended", function(d) {
      sendEvent("ended", d.seconds, 1);
      updateSession(d.seconds, 1);
    });

    document.addEventListener("visibilitychange", function() {
      player.getCurrentTime().then(function(sec) {
        player.getDuration().then(function(dur) {
          var pct = dur > 0 ? sec / dur : 0;
          sendEvent(document.hidden ? "page_hidden" : "page_visible", sec, pct);
          if (document.hidden) updateSession(sec, pct);
        });
      });
    });

    window.addEventListener("beforeunload", function() {
      fetch(SB_URL + "/rest/v1/viewing_sessions?id=eq." + sessionId, {
        method: "PATCH",
        headers: {
          "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY,
          "Content-Type": "application/json", "Prefer": "return=minimal"
        },
        body: JSON.stringify({
          duration_seconds: Math.round(maxSec),
          max_video_percent: Math.round(maxPct * 100),
          max_video_seconds: Math.round(maxSec),
          ended_at: new Date().toISOString()
        }),
        keepalive: true
      }).catch(function() {});

      navigator.sendBeacon(
        SB_URL + "/rest/v1/viewing_events",
        new Blob([JSON.stringify({
          session_id: sessionId, event_type: "page_leave",
          video_seconds: maxSec, video_percent: maxPct
        })], { type: "application/json" })
      );
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initSession);
  else initSession();
})();
<` + `/script>`;

  function handleCopy(step, text) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedStep(step);
      setTimeout(() => setCopiedStep(null), 2500);
    });
  }

  const statusConfig = {
    none: {
      icon: "🔴",
      color: "border-red-500/20 bg-red-500/5 text-red-400",
      label: "Aucune session détectée",
      detail: "Les scripts n'ont pas encore envoyé de données.",
    },
    anonymous: {
      icon: "🟡",
      color: "border-yellow-500/20 bg-yellow-500/5 text-yellow-400",
      label: "Sessions détectées mais non identifiées",
      detail: null,
    },
    active: {
      icon: "🟢",
      color: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400",
      label: "Tracking actif",
      detail: null,
    },
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-pulse-surface border border-pulse-border rounded-2xl max-h-[90vh] overflow-auto animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-pulse-surface border-b border-pulse-border px-7 py-5 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-bold text-white">
                Installer le tracking
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {webinar.name}
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
        </div>

        <div className="px-7 py-5 space-y-5">
          {/* Step 1 — Optin */}
          <StepCard
            step={1}
            title="Script d'identification"
            subtitle="Page d'inscription (optin)"
            description="Ce script capture l'email de vos visiteurs au moment de leur inscription. Il ne modifie pas le comportement de votre page."
            instructions={[
              "Dans Systeme.io, ouvrez votre tunnel de vente.",
              "Sélectionnez la page d'inscription (optin).",
              "Cliquez sur \"Edit page\" pour ouvrir l'éditeur.",
              "Cliquez sur \"Settings\" (icône engrenage, en haut à gauche).",
              "Descendez jusqu'à la section \"Tracking\".",
              "Collez le script dans le champ \"Body\".",
              "Sauvegardez.",
            ]}
            script={optinScript}
            copied={copiedStep === 1}
            onCopy={() => handleCopy(1, optinScript)}
          />

          {/* Step 2 — Tracking */}
          <StepCard
            step={2}
            title="Script de tracking"
            subtitle="Page du webinaire"
            description="Ce script mesure le visionnage de la vidéo Vimeo et identifie le viewer grâce au cookie posé à l'étape 1."
            instructions={[
              "Même procédure que l'étape 1, mais sur la page du webinaire.",
              "Ouvrez la page qui contient la vidéo Vimeo.",
              "Settings → Tracking → champ \"Body\".",
              "Collez le script ci-dessous.",
              "Sauvegardez.",
            ]}
            script={trackingScript}
            copied={copiedStep === 2}
            onCopy={() => handleCopy(2, trackingScript)}
            warning="Si un ancien script WebinarPulse est déjà en place, remplacez-le par celui-ci."
          />

          {/* Status indicator */}
          {!checking && status && (
            <div className={`rounded-xl border px-5 py-4 ${statusConfig[status.level].color}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">{statusConfig[status.level].icon}</span>
                  <div>
                    <div className="text-sm font-semibold">
                      {statusConfig[status.level].label}
                      {status.level !== "none" && (
                        <span className="font-normal ml-1.5 opacity-80">
                          — {status.identified} identifiée{status.identified !== 1 ? "s" : ""} sur {status.total}
                        </span>
                      )}
                    </div>
                    {statusConfig[status.level].detail && (
                      <div className="text-xs opacity-70 mt-0.5">
                        {statusConfig[status.level].detail}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={checkStatus}
                  className="flex items-center gap-1.5 text-xs opacity-70 hover:opacity-100 transition-opacity"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  Vérifier
                </button>
              </div>
            </div>
          )}
          {checking && (
            <div className="flex items-center justify-center py-4">
              <div className="w-5 h-5 border-2 border-pulse-border border-t-pulse-accent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Step card sub-component ---
function StepCard({ step, title, subtitle, description, instructions, script, copied, onCopy, warning }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-pulse-bg border border-pulse-border rounded-xl overflow-hidden">
      {/* Step header */}
      <div className="px-5 py-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-pulse-accent to-purple-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
            {step}
          </div>
          <div>
            <div className="text-sm font-semibold text-white">{title}</div>
            <div className="text-[11px] text-gray-500">{subtitle}</div>
          </div>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed ml-10">
          {description}
        </p>
      </div>

      {/* Instructions toggle */}
      <div className="px-5 pb-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-[11px] text-pulse-accent-light hover:text-white transition-colors"
        >
          <svg
            width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            className={`transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          {expanded ? "Masquer" : "Voir"} les instructions d'installation
        </button>

        {expanded && (
          <ol className="mt-3 ml-3 space-y-1.5 text-xs text-gray-400 list-decimal list-inside">
            {instructions.map((inst, i) => (
              <li key={i} className="leading-relaxed">{inst}</li>
            ))}
          </ol>
        )}
      </div>

      {warning && (
        <div className="mx-5 mb-3 px-3 py-2 rounded-lg bg-yellow-500/5 border border-yellow-500/15 text-[11px] text-yellow-400/90">
          ⚠️ {warning}
        </div>
      )}

      {/* Script block */}
      <div className="relative mx-5 mb-5">
        <pre className="bg-pulse-surface border border-pulse-border rounded-xl p-4 text-[10px] text-gray-500 overflow-auto max-h-[200px] leading-relaxed font-mono">
          {script}
        </pre>
        <button
          onClick={onCopy}
          className={`absolute top-3 right-3 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white transition-all ${
            copied ? "bg-emerald-500" : "bg-pulse-accent hover:bg-indigo-500"
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {copied ? "Copié ✓" : "Copier"}
        </button>
      </div>
    </div>
  );
}
