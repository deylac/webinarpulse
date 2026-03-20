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

async function fetchContactsByTag(apiKey, tagId, cursor = null) {
  const params = new URLSearchParams({ limit: '100' });
  if (cursor) params.set('after', cursor);
  const res = await systemeioFetch(apiKey, `/contacts?tagId=${tagId}&${params}`);
  if (!res.ok) return { items: [], hasMore: false };
  const data = await res.json();
  return {
    items: data.items || [],
    hasMore: data.hasMore || false,
    endCursor: data.endCursor || null
  };
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

// --- Batch matching: pending_registrations → anonymous sessions ---

async function runBatchMatching() {
  try {
    const { data: matches, error } = await supabase.rpc('match_pending_registrations');
    if (error || !matches || matches.length === 0) return 0;

    let matchCount = 0;
    for (const match of matches) {
      const { error: viewerErr } = await supabase
        .from('viewers')
        .update({ email: match.email })
        .eq('id', match.viewer_id);

      if (viewerErr) continue;

      await supabase
        .from('pending_registrations')
        .update({ matched: true, matched_session_id: match.session_id })
        .eq('id', match.registration_id);

      matchCount++;
    }
    return matchCount;
  } catch (e) {
    console.error('Batch matching error:', e);
    return 0;
  }
}

// --- Tag-based matching: use Systeme.io contact emails to identify anonymous viewers ---

async function runTagBasedMatching() {
  try {
    // Chercher les viewers anonymes qui ont des sessions
    const { data: anonViewers } = await supabase
      .from('viewers')
      .select('id, anonymous_id')
      .is('email', null)
      .not('anonymous_id', 'is', null);

    if (!anonViewers?.length) return 0;

    // Chercher les pending_registrations non matchées
    const { data: pendingRegs } = await supabase
      .from('pending_registrations')
      .select('id, email, created_at, client_ip')
      .eq('matched', false)
      .not('email', 'is', null);

    if (!pendingRegs?.length) return 0;

    let matchCount = 0;

    for (const reg of pendingRegs) {
      // Chercher les sessions de viewers anonymes proches de l'inscription
      const regTime = new Date(reg.created_at);
      const windowStart = new Date(regTime.getTime() - 5 * 60 * 1000).toISOString();
      const windowEnd = new Date(regTime.getTime() + 120 * 60 * 1000).toISOString();

      const { data: sessions } = await supabase
        .from('viewing_sessions')
        .select('id, viewer_id, client_ip, started_at, viewer:viewers(id, email)')
        .gte('started_at', windowStart)
        .lte('started_at', windowEnd);

      if (!sessions?.length) continue;

      const anonSessions = sessions.filter(s => s.viewer && !s.viewer.email);
      if (anonSessions.length === 0) continue;

      // Match par IP (le plus fiable)
      let match = null;
      if (reg.client_ip) {
        match = anonSessions.find(s => s.client_ip === reg.client_ip);
      }

      // Si une seule session anonyme dans la fenêtre
      if (!match && anonSessions.length === 1) {
        match = anonSessions[0];
      }

      if (!match) continue;

      // Assigner l'email
      await supabase.from('viewers').update({ email: reg.email }).eq('id', match.viewer_id);
      await supabase.from('pending_registrations')
        .update({ matched: true, matched_session_id: match.id })
        .eq('id', reg.id);
      matchCount++;
    }
    return matchCount;
  } catch (e) {
    console.error('Tag-based matching error:', e);
    return 0;
  }
}

// --- Stratégie 4: Systeme.io tag → identify anonymous viewers ---
// Fetch contacts with a "viewer" tag from Systeme.io and cross-reference

async function runSystemeioViewerMatching(apiKey) {
  if (!apiKey) return 0;

  try {
    // Get the viewer tag ID from app_settings
    const { data: setting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'systemeio_viewer_tag_id')
      .single();

    const viewerTagId = setting?.value;
    if (!viewerTagId) return 0;

    // Fetch contacts with this tag from Systeme.io
    let allContacts = [];
    let cursor = null;
    let hasMore = true;

    while (hasMore && allContacts.length < 500) { // Cap à 500 pour sécurité
      await new Promise(r => setTimeout(r, 300)); // Rate limit
      const result = await fetchContactsByTag(apiKey, viewerTagId, cursor);
      allContacts = allContacts.concat(result.items);
      hasMore = result.hasMore;
      cursor = result.endCursor;
    }

    if (allContacts.length === 0) return 0;

    // Get existing viewer emails
    const { data: existingViewers } = await supabase
      .from('viewers')
      .select('email')
      .not('email', 'is', null);

    const existingEmails = new Set((existingViewers || []).map(v => v.email?.toLowerCase()));

    let matchCount = 0;

    for (const contact of allContacts) {
      const email = contact.email?.trim()?.toLowerCase();
      if (!email || existingEmails.has(email)) continue;

      // Ce contact est tagué "Webi vu" mais pas dans nos viewers
      // Chercher une session anonyme qui pourrait être la sienne
      const { data: anonSessions } = await supabase
        .from('viewing_sessions')
        .select('id, viewer_id, started_at, viewer:viewers(id, email)')
        .is('viewer.email', null)
        .order('started_at', { ascending: false })
        .limit(50);

      // Filtrer les sessions vraiment anonymes
      const sessions = (anonSessions || []).filter(s => s.viewer && !s.viewer.email);

      if (sessions.length > 0) {
        // Prendre la session anonyme la plus récente (la plus probable)
        const match = sessions[0];
        await supabase.from('viewers').update({ email }).eq('id', match.viewer_id);
        existingEmails.add(email);
        matchCount++;
        console.log(`Systeme.io tag match: ${email} → viewer ${match.viewer_id}`);
      } else {
        // Pas de session anonyme → créer un viewer pour référence future
        await supabase.from('viewers').insert({ email, anonymous_id: null });
        existingEmails.add(email);
      }

      await new Promise(r => setTimeout(r, 100));
    }

    return matchCount;
  } catch (e) {
    console.error('Systeme.io viewer matching error:', e);
    return 0;
  }
}

// --- Main handler ---

export async function GET(request) {
  // Protect the endpoint with a secret (for Vercel Cron)
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 0a. Run batch matching (RPC-based)
    const matchCount = await runBatchMatching();
    if (matchCount > 0) {
      console.log(`Batch matching: ${matchCount} registration(s) matched`);
    }

    // 0b. Run tag-based matching (registration → anonymous session)
    const tagMatchCount = await runTagBasedMatching();
    if (tagMatchCount > 0) {
      console.log(`Tag-based matching: ${tagMatchCount} viewer(s) identified`);
    }
    // 1. Get active tagging rules with webinar account info
    const { data: rules, error: rulesErr } = await supabase
      .from("tagging_rules")
      .select("*, webinar:webinars(slug, systemeio_account_id)")
      .eq("enabled", true);

    if (rulesErr || !rules?.length) {
      return NextResponse.json({
        message: "Aucune règle de tagging active",
        hint: "Ajoutez des règles dans l'onglet Tags du dashboard",
      });
    }

    // 2. Collect unique account IDs from webinars that have rules
    const accountIds = [...new Set(rules.map((r) => r.webinar?.systemeio_account_id).filter(Boolean))];

    // Load accounts
    let accountsMap = {};
    if (accountIds.length) {
      const { data: accounts } = await supabase
        .from("systemeio_accounts")
        .select("id, api_key")
        .in("id", accountIds);
      if (accounts) {
        for (const acc of accounts) accountsMap[acc.id] = acc.api_key;
      }
    }

    // Fallback: try app_settings or env var for webinars without a specific account
    let fallbackKey = process.env.SYSTEMEIO_API_KEY || "";
    try {
      const { data: setting } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "systemeio_api_key")
        .single();
      if (setting?.value) fallbackKey = setting.value;
    } catch {}

    // 0c. Run Systeme.io tag-based viewer matching (tag "📹 Auto IA - Webi vu")
    const sioApiKey = Object.values(accountsMap)[0] || fallbackKey;
    const sioMatchCount = await runSystemeioViewerMatching(sioApiKey);
    if (sioMatchCount > 0) {
      console.log(`Systeme.io tag matching: ${sioMatchCount} viewer(s) identified`);
    }
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

    // 4. Process each viewer/webinar pair
    for (const session of sessions) {
      // Throttle: 300ms between API calls
      await new Promise((r) => setTimeout(r, 300));

      const webinarRules = rules.filter((r) => r.webinar_id === session.webinar_id);
      if (!webinarRules.length) {
        skipped++;
        continue;
      }

      // Resolve API key for this webinar's account
      const accountId = webinarRules[0]?.webinar?.systemeio_account_id;
      const apiKey = (accountId && accountsMap[accountId]) || fallbackKey;
      if (!apiKey) {
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
      const contact = await findContactByEmail(apiKey, session.viewer_email);

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
          await removeTag(apiKey, contact.id, old.systemeio_tag_id);
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      // Assign new tag
      if (segment.systemeio_tag_id) {
        const success = await assignTag(apiKey, contact.id, segment.systemeio_tag_id);

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
