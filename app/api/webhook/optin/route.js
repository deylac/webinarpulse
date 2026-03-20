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

  // 2. Vérifier la signature HMAC (secrets depuis DB + env var fallback)
  const signature = request.headers.get('x-webhook-signature');
  const signatureValid = await verifySignatureFromDb(supabase, rawBody, signature);

  if (!signatureValid) {
    await logWebhook(supabase, 'OPT_IN', payload, ip, false, false, 'Invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  // 3. Extraire l'email du payload
  const email = payload?.contact?.email?.trim()?.toLowerCase();
  if (!email || !email.includes('@')) {
    await logWebhook(supabase, 'OPT_IN', payload, ip, true, false, 'No valid email');
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
    await logWebhook(supabase, 'OPT_IN', payload, ip, true, false, insertError.message);
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
  }

  // 6. Matching temps réel : chercher des sessions anonymes récentes pour cet email
  await matchEmailToAnonymousSessions(supabase, email);

  // 7. Logger et répondre 200 rapidement
  await logWebhook(supabase, 'OPT_IN', payload, ip, true, true, null);
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
