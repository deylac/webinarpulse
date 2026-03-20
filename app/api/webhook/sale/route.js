import { NextResponse } from 'next/server';
import { verifySignatureFromDb, getSupabaseAdmin, logWebhook } from '@/lib/webhookUtils';

export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  // 1. Lire le body brut
  const rawBody = await request.text();
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 2. Vérifier la signature HMAC (soft check — process even if invalid)
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
    const headers = {};
    request.headers.forEach((v, k) => { headers[k] = v; });
    await logWebhook(supabase, payload?.event || 'SALE', { ...payload, _debug_headers: headers }, ip, false, false, signature ? 'Signature mismatch' : 'No signature header found');
  }

  const eventType = payload?.event;
  const email = payload?.contact?.email?.trim()?.toLowerCase();
  const systemeioContactId = payload?.contact?.id?.toString() || null;

  if (!email) {
    await logWebhook(supabase, eventType, payload, ip, true, false, 'No email');
    return NextResponse.json({ error: 'No email' }, { status: 400 });
  }

  // 3. Traiter selon le type d'événement
  if (eventType === 'NEW_SALE') {
    const sale = payload?.sale || {};

    // Trouver le viewer par email
    const { data: viewers } = await supabase
      .from('viewers')
      .select('id')
      .eq('email', email)
      .limit(1);

    const viewerId = viewers?.[0]?.id || null;

    // Insérer l'achat
    const { error: insertError } = await supabase.from('purchases').insert({
      viewer_id: viewerId,
      email,
      product_name: sale.plan_name || null,
      product_price: sale.amount || null,
      systemeio_contact_id: systemeioContactId,
      webhook_payload: payload
    });

    if (insertError) {
      await logWebhook(supabase, eventType, payload, ip, true, false, insertError.message);
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
    }

    await logWebhook(supabase, eventType, payload, ip, true, true, null);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (eventType === 'SALE_CANCELLED') {
    // Marquer l'achat le plus récent comme annulé
    const { error: updateError } = await supabase
      .from('purchases')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('email', email)
      .is('cancelled_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    await logWebhook(supabase, eventType, payload, ip, true, !updateError, updateError?.message);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Événement non géré
  await logWebhook(supabase, eventType, payload, ip, true, false, 'Unknown event type');
  return NextResponse.json({ ok: true }, { status: 200 });
}
