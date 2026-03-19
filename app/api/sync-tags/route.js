import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SYSTEMEIO_API_URL = "https://api.systeme.io/api";
const CRON_SECRET = process.env.CRON_SECRET;

const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
  // Use service role for server-side operations
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim()
);

// --- Systeme.io API helpers ---

async function systemeioFetch(apiKey, path, options = {}) {
  const res = await fetch(`${SYSTEMEIO_API_URL}${path}`, {
    ...options,
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  // Handle rate limit
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") || "5");
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return systemeioFetch(apiKey, path, options);
  }

  return res;
}

async function findContactByEmail(apiKey, email) {
  const res = await systemeioFetch(apiKey, `/contacts?email=${encodeURIComponent(email)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.items?.[0] || null;
}

async function assignTag(apiKey, contactId, tagId) {
  const res = await systemeioFetch(apiKey, `/contacts/${contactId}/tags`, {
    method: "POST",
    body: JSON.stringify({ tagId: Number(tagId) }),
  });
  return res.ok;
}

async function removeTag(apiKey, contactId, tagId) {
  const res = await systemeioFetch(apiKey, `/contacts/${contactId}/tags/${tagId}`, {
    method: "DELETE",
  });
  return res.ok;
}

// --- Main handler ---

export async function GET(request) {
  // Protect the endpoint with a secret (for Vercel Cron)
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get API key: first from DB (app_settings), fallback to env var
  let SYSTEMEIO_API_KEY = process.env.SYSTEMEIO_API_KEY || "";
  try {
    const { data: setting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "systemeio_api_key")
      .single();
    if (setting?.value) SYSTEMEIO_API_KEY = setting.value;
  } catch {}

  if (!SYSTEMEIO_API_KEY) {
    return NextResponse.json(
      { error: "Clé API Systeme.io non configurée. Ajoutez-la dans l'onglet Tags du dashboard." },
      { status: 500 }
    );
  }

  try {
    // 1. Get active tagging rules
    const { data: rules, error: rulesErr } = await supabase
      .from("tagging_rules")
      .select("*, webinar:webinars(slug)")
      .eq("enabled", true);

    if (rulesErr || !rules?.length) {
      return NextResponse.json({
        message: "Aucune règle de tagging active",
        hint: "Ajoutez des règles dans l'onglet Tags du dashboard",
      });
    }

    // 2. Get untagged sessions (aggregated by viewer + webinar)
    const { data: sessions, error: sessErr } = await supabase.rpc("get_untagged_sessions");

    if (sessErr) {
      console.error("RPC error:", sessErr);
      return NextResponse.json({ error: "Erreur RPC get_untagged_sessions" }, { status: 500 });
    }

    if (!sessions?.length) {
      return NextResponse.json({ message: "Aucune session à traiter", processed: 0 });
    }

    let processed = 0;
    let errors = 0;
    let skipped = 0;

    // 3. Process each viewer/webinar pair
    for (const session of sessions) {
      // Throttle: 300ms between API calls
      await new Promise((r) => setTimeout(r, 300));

      const webinarRules = rules.filter((r) => r.webinar_id === session.webinar_id);
      if (!webinarRules.length) {
        skipped++;
        continue;
      }

      // Find matching segment (best percent)
      const segment = webinarRules
        .sort((a, b) => b.min_percent - a.min_percent)
        .find((r) =>
          session.best_percent >= r.min_percent &&
          (r.segment === "completed" ? true : session.best_percent < r.max_percent)
        );

      if (!segment) {
        skipped++;
        continue;
      }

      // Find contact in Systeme.io
      const contact = await findContactByEmail(SYSTEMEIO_API_KEY, session.viewer_email);

      if (!contact) {
        await supabase.from("tagging_log").insert({
          viewer_email: session.viewer_email,
          webinar_id: session.webinar_id,
          segment: segment.segment,
          systemeio_tag_name: segment.systemeio_tag_name,
          status: "contact_not_found",
        });
        skipped++;
        continue;
      }

      // Remove old tags for this webinar (segment upgrade)
      const otherSegments = webinarRules.filter(
        (r) => r.segment !== segment.segment && r.systemeio_tag_id
      );
      for (const old of otherSegments) {
        const hasTag = contact.tags?.some((t) => String(t.id) === String(old.systemeio_tag_id));
        if (hasTag) {
          await removeTag(SYSTEMEIO_API_KEY, contact.id, old.systemeio_tag_id);
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      // Assign new tag
      if (segment.systemeio_tag_id) {
        const success = await assignTag(SYSTEMEIO_API_KEY, contact.id, segment.systemeio_tag_id);

        await supabase.from("tagging_log").insert({
          viewer_email: session.viewer_email,
          webinar_id: session.webinar_id,
          segment: segment.segment,
          systemeio_tag_name: segment.systemeio_tag_name,
          systemeio_contact_id: String(contact.id),
          status: success ? "success" : "api_error",
          error_message: success ? null : "Failed to assign tag",
        });

        if (success) processed++;
        else errors++;
      }

      // Mark sessions as tagged
      for (const sid of session.session_ids) {
        await supabase
          .from("viewing_sessions")
          .update({ tagged_at: new Date().toISOString() })
          .eq("id", sid);
      }
    }

    return NextResponse.json({
      processed,
      errors,
      skipped,
      total: sessions.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("sync-tags error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
