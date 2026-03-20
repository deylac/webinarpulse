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
  const email = payload?.contact?.email?.trim()?.toLowerCase();
  if (!email || !email.includes('@')) {
    await logWebhook(supabase, 'OPT_IN', payload, ip, signatureValid, false, 'No valid email');
    return NextResponse.json({ error: 'No valid email' }, { status: 400 });
  }

  // 4. Extraire le first_name des fields
  const firstName = payload?.contact?.fields?.find(f => f.slug === 'first_name')?.value || null;

  // 5. Insérer dans pending_registrations
  const { error: insertError } = await supabase.from('pending_registrations').insert({
    email,
    webinar_slug: '_webhook_optin',
    first_name: firstName,
    source: 'webhook_optin'
  });

  if (insertError) {
    await logWebhook(supabase, 'OPT_IN', payload, ip, signatureValid, false, insertError.message);
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
  }

  // 6. Matching temps réel : chercher des sessions anonymes récentes pour cet email
  await matchEmailToAnonymousSessions(supabase, email);

  // 7. Logger et répondre 200 rapidement
  await logWebhook(supabase, 'OPT_IN', payload, ip, signatureValid, true, signatureValid ? null : 'Processed without valid signature');
  return NextResponse.json({ ok: true }, { status: 200 });
}

async function matchEmailToAnonymousSessions(supabase, email) {
  try {
    // Chercher toutes les sessions anonymes des 30 dernières minutes
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: anonSessions } = await supabase
      .from('viewing_sessions')
      .select('id, viewer_id, viewer:viewers(id, email, anonymous_id)')
      .gte('started_at', thirtyMinAgo);

    if (!anonSessions || anonSessions.length === 0) return;

    // Filtrer les sessions dont le viewer est bien anonyme
    const sessionsToMatch = anonSessions.filter(s => s.viewer && !s.viewer.email);

    for (const session of sessionsToMatch) {
      // Mettre à jour le viewer avec l'email
      await supabase
        .from('viewers')
        .update({ email })
        .eq('id', session.viewer_id);

      // Marquer le pending_registration comme matché
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
