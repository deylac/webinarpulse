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

async function fetchContactsByTag(apiKey, tagId, page = 1) {
  const res = await systemeioFetch(apiKey, `/contacts?tagId=${tagId}&limit=100&page=${page}`);
  if (!res.ok) return { items: [], hasMore: false };
  const data = await res.json();
  return {
    items: data.items || [],
    hasMore: (data.items || []).length >= 100,
    nextPage: page + 1
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

// --- Purchase reconciliation: link orphaned purchases to existing viewers ---

async function runPurchaseReconciliation() {
  try {
    // Trouver les achats sans viewer_id qui ont un email
    const { data: orphanPurchases } = await supabase
      .from('purchases')
      .select('id, email')
      .is('viewer_id', null)
      .is('cancelled_at', null)
      .not('email', 'is', null);

    if (!orphanPurchases?.length) return 0;

    // Récupérer les emails uniques
    const uniqueEmails = [...new Set(orphanPurchases.map(p => p.email.toLowerCase()))];

    let reconciledCount = 0;
    for (const email of uniqueEmails) {
      // Chercher un viewer avec cet email
      const { data: viewers } = await supabase
        .from('viewers')
        .select('id')
        .eq('email', email)
        .limit(1);

      if (viewers?.length > 0) {
        // Lier toutes les purchases orphelines de cet email
        const { error } = await supabase
          .from('purchases')
          .update({ viewer_id: viewers[0].id })
          .eq('email', email)
          .is('viewer_id', null);

        if (!error) reconciledCount++;
      }
    }
    return reconciledCount;
  } catch (e) {
    console.error('Purchase reconciliation error:', e);
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
  if (!apiKey) return { matched: 0, error: 'no_api_key' };

  try {
    // Collect all viewer tag IDs: per-webinar + global fallback
    const tagIds = new Set();

    // Per-webinar tags
    const { data: webinarsWithTags } = await supabase
      .from('webinars')
      .select('id, systemeio_viewer_tag_id')
      .not('systemeio_viewer_tag_id', 'is', null);

    for (const w of (webinarsWithTags || [])) {
      if (w.systemeio_viewer_tag_id) tagIds.add(w.systemeio_viewer_tag_id);
    }

    // Global fallback from app_settings
    const { data: setting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'systemeio_viewer_tag_id')
      .single();
    if (setting?.value) tagIds.add(setting.value);

    if (tagIds.size === 0) return { matched: 0, error: 'no_tag_id_configured' };

    // Fetch contacts for all tag IDs from Systeme.io
    let allContacts = [];
    for (const tagId of tagIds) {
      let page = 1;
      let hasMore = true;
      while (hasMore && allContacts.length < 500) {
        await new Promise(r => setTimeout(r, 300));
        const result = await fetchContactsByTag(apiKey, tagId, page);
        allContacts = allContacts.concat(result.items);
        hasMore = result.hasMore;
        page = result.nextPage;
      }
    }

    if (allContacts.length === 0) return { matched: 0, contactsFetched: 0, tagIds: Array.from(tagIds) };

    // Get existing viewer emails
    const { data: existingViewers } = await supabase
      .from('viewers')
      .select('email')
      .not('email', 'is', null);

    const existingEmails = new Set((existingViewers || []).map(v => v.email?.toLowerCase()));

    // Get all anonymous sessions
    const { data: anonSessions } = await supabase
      .from('viewing_sessions')
      .select('id, viewer_id, started_at, viewer:viewers(id, email, anonymous_id)')
      .order('started_at', { ascending: false });

    // Filter to truly anonymous sessions
    const sessions = (anonSessions || []).filter(s => s.viewer && !s.viewer.email);

    let matchCount = 0;
    let newViewers = 0;
    let alreadyKnown = 0;

    for (const contact of allContacts) {
      const email = contact.email?.trim()?.toLowerCase();
      if (!email) continue;
      if (existingEmails.has(email)) { alreadyKnown++; continue; }

      // Find an anonymous session to assign
      const matchIdx = sessions.findIndex(s => s.viewer && !s.viewer.email);
      if (matchIdx >= 0) {
        const match = sessions[matchIdx];
        await supabase.from('viewers').update({ email }).eq('id', match.viewer_id);
        sessions.splice(matchIdx, 1); // Remove matched session
        existingEmails.add(email);
        matchCount++;
      } else {
        await supabase.from('viewers').upsert({ email, anonymous_id: null }, { onConflict: 'email', ignoreDuplicates: true });
        existingEmails.add(email);
        newViewers++;
      }

      await new Promise(r => setTimeout(r, 100));
    }

    return { matched: matchCount, contactsFetched: allContacts.length, alreadyKnown, newViewers, anonSessionsAvailable: (anonSessions || []).filter(s => s.viewer && !s.viewer.email).length, tagIds: Array.from(tagIds) };
  } catch (e) {
    console.error('Systeme.io viewer matching error:', e);
    return { matched: 0, error: e.message };
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

    // 0c-pre. Reconcile orphan purchases with known viewers
    const purchaseReconCount = await runPurchaseReconciliation();
    if (purchaseReconCount > 0) {
      console.log(`Purchase reconciliation: ${purchaseReconCount} purchase(s) linked`);
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
      matching: { batchRPC: matchCount, tagBased: tagMatchCount, systemeio: sioMatchCount, purchaseReconciliation: purchaseReconCount },
      tagging: { processed, errors, skipped, total: sessions.length },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("sync-tags error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
