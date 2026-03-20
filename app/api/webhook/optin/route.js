import { NextResponse } from 'next/server';
import { verifySignatureFromDb, getSupabaseAdmin, logWebhook } from '@/lib/webhookUtils';

export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  // 1. Lire le body brut AVANT le parsing (crucial pour la vérification HMAC)
  const rawBody = await request.text();
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 2. Vérifier la signature HMAC (soft check — process even if invalid)
  // Systeme.io header name is undocumented, try multiple possibilities
  const signature = request.headers.get('x-webhook-signature')
    || request.headers.get('x-signature')
    || request.headers.get('x-hub-signature-256')
    || request.headers.get('x-systeme-signature')
    || request.headers.get('signature');
  const signatureValid = signature
    ? await verifySignatureFromDb(supabase, rawBody, signature)
    : false;

  // Log signature status but ALWAYS process the webhook
  if (!signatureValid) {
    // Capture all headers for debugging
    const headers = {};
    request.headers.forEach((v, k) => { headers[k] = v; });
    await logWebhook(supabase, 'OPT_IN', { ...payload, _debug_headers: headers }, ip, false, false, signature ? 'Signature mismatch' : 'No signature header found');
  }

  // 3. Extraire l'email du payload
  // Systeme.io uses "customer" for sale webhooks, "contact" for optin
  const email = (payload?.contact?.email || payload?.customer?.email)?.trim()?.toLowerCase();
  if (!email || !email.includes('@')) {
    await logWebhook(supabase, 'OPT_IN', payload, ip, signatureValid, false, 'No valid email');
    return NextResponse.json({ error: 'No valid email' }, { status: 400 });
  }

  // 4. Extraire le first_name et le clientIp du payload Systeme.io
  const firstName = payload?.contact?.fields?.find(f => f.slug === 'first_name')?.value || null;
  const clientIp = payload?.contact?.clientIp || payload?.customer?.clientIp || ip;

  // 5. Insérer dans pending_registrations (avec IP pour matching)
  const { error: insertError } = await supabase.from('pending_registrations').insert({
    email,
    webinar_slug: '_webhook_optin',
    first_name: firstName,
    source: 'webhook_optin',
    client_ip: clientIp
  });

  if (insertError) {
    await logWebhook(supabase, 'OPT_IN', payload, ip, signatureValid, false, insertError.message);
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
  }

  // 6. Matching temps réel : chercher des sessions anonymes récentes par IP
  await matchEmailToAnonymousSessions(supabase, email, clientIp);

  // 7. Logger et répondre 200 rapidement
  await logWebhook(supabase, 'OPT_IN', payload, ip, signatureValid, true, signatureValid ? null : 'Processed without valid signature');
  return NextResponse.json({ ok: true }, { status: 200 });
}

async function matchEmailToAnonymousSessions(supabase, email, clientIp) {
  try {
    // Chercher les sessions anonymes des 60 dernières minutes
    const sixtyMinAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: anonSessions } = await supabase
      .from('viewing_sessions')
      .select('id, viewer_id, client_ip, viewer:viewers(id, email, anonymous_id)')
      .gte('started_at', sixtyMinAgo);

    if (!anonSessions || anonSessions.length === 0) return;

    // Filtrer les sessions dont le viewer est anonyme
    const sessionsToMatch = anonSessions.filter(s => s.viewer && !s.viewer.email);

    // Si on a une IP, matcher uniquement les sessions avec la même IP (fiable)
    // Sinon, ne pas matcher du tout (trop risqué sans critère de discrimination)
    if (!clientIp) return;

    const ipMatches = sessionsToMatch.filter(s => s.client_ip === clientIp);
    if (ipMatches.length === 0) return;

    for (const session of ipMatches) {
      await supabase
        .from('viewers')
        .update({ email })
        .eq('id', session.viewer_id);

      await supabase
        .from('pending_registrations')
        .update({ matched: true, matched_session_id: session.id })
        .eq('email', email)
        .eq('matched', false);
    }
  } catch (e) {
    console.error('Matching error:', e);
  }
}

