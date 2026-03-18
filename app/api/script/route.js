import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const webinarId = searchParams.get("webinar_id");
  const webinarName = searchParams.get("name") || "Webinaire";

  if (!webinarId) {
    return NextResponse.json({ error: "webinar_id required" }, { status: 400 });
  }

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

  const script = `<!-- WebinarPulse Tracking — ${webinarName} -->
<script src="https://player.vimeo.com/api/player.js"><\/script>
<script>
(function() {
  var SB_URL = "${supabaseUrl}";
  var SB_KEY = "${supabaseKey}";
  var WEBINAR_ID = "${webinarId}";

  var params = new URLSearchParams(window.location.search);
  var email = params.get("email") || params.get("contact_email") || params.get("e") || null;
  var anonId = "anon-" + Math.random().toString(36).substr(2, 12);
  var sessionId = null;
  var lastUpdate = 0;
  var maxSec = 0;
  var maxPct = 0;

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
    var viewer = email
      ? { email: email, anonymous_id: null }
      : { email: null, anonymous_id: anonId };

    sb("viewers", "POST", viewer, { "Prefer": "return=representation,resolution=merge-duplicates" })
      .then(function(v) {
        var vid = Array.isArray(v) ? v[0].id : v.id;
        return sb("viewing_sessions", "POST", {
          webinar_id: WEBINAR_ID, viewer_id: vid,
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
    if (!iframes.length) return;
    var player = new Vimeo.Player(iframes[0]);

    player.on("play", function(d) { sendEvent("play", d.seconds, d.percent); });
    player.on("pause", function(d) { sendEvent("pause", d.seconds, d.percent); updateSession(d.seconds, d.percent); });
    player.on("seeked", function(d) { sendEvent("seeked", d.seconds, d.percent); });
    player.on("timeupdate", function(d) { updateSession(d.seconds, d.percent); });
    player.on("ended", function(d) { sendEvent("ended", d.seconds, 1); updateSession(d.seconds, 1); });

    document.addEventListener("visibilitychange", function() {
      player.getCurrentTime().then(function(sec) {
        player.getDuration().then(function(dur) {
          var pct = sec / dur;
          sendEvent(document.hidden ? "page_hidden" : "page_visible", sec, pct);
          if (document.hidden) updateSession(sec, pct);
        });
      });
    });

    window.addEventListener("beforeunload", function() {
      var data = JSON.stringify({
        session_id: sessionId, event_type: "page_leave",
        video_seconds: maxSec, video_percent: maxPct
      });
      navigator.sendBeacon(
        SB_URL + "/rest/v1/viewing_events",
        new Blob([data], { type: "application/json" })
      );
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initSession);
  else initSession();
})();
<\/script>`;

  return new NextResponse(script, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
