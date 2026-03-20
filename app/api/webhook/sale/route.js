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

  if (!signatureValid) {
    const headers = {};
    request.headers.forEach((v, k) => { headers[k] = v; });
    await logWebhook(supabase, 'SALE_RECEIVED', { ...payload, _debug_headers: headers }, ip, false, false, signature ? 'Signature mismatch' : 'No signature header found');
  }

  // 3. Extraire l'email — Systeme.io met le contact à la racine
  const email = (
    payload?.contact?.email ||
    payload?.email ||
    payload?.buyer?.email ||
    payload?.customer?.email ||
    payload?.order?.buyer_email ||
    payload?.data?.contact?.email
  )?.trim()?.toLowerCase();

  const systemeioContactId = (payload?.contact?.id || payload?.data?.contact?.id)?.toString() || null;

  if (!email) {
    await logWebhook(supabase, 'SALE_NO_EMAIL', payload, ip, signatureValid, false, 'No email found in any known field');
    return NextResponse.json({ error: 'No email' }, { status: 400 });
  }

  // 4. Déterminer le type d'événement via le header X-Webhook-Event
  const webhookEvent = request.headers.get('x-webhook-event')?.toUpperCase();
  const isCancelled = webhookEvent === 'SALE_CANCELLED' || payload?.event === 'SALE_CANCELLED' || !!payload?.cancelled;
  const eventType = isCancelled ? 'SALE_CANCELLED' : (webhookEvent || 'SALE_NEW');

  if (isCancelled) {
    // Marquer l'achat le plus récent comme annulé
    const { error: updateError } = await supabase
      .from('purchases')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('email', email)
      .is('cancelled_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    await logWebhook(supabase, 'SALE_CANCELLED', payload, ip, signatureValid, !updateError, updateError?.message);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // 5. Traiter comme un nouvel achat
  // Extraire les infos de la commande
  const order = payload?.order || payload?.sale || {};

  // Trouver le viewer par email
  const { data: viewers } = await supabase
    .from('viewers')
    .select('id')
    .eq('email', email)
    .limit(1);

  const viewerId = viewers?.[0]?.id || null;

  // Extraire prix et nom du produit
  const productName = order.plan_name || order.product_name || payload?.coupon?.code || null;
  const productPrice = order.totalPrice || order.amount || order.total_price || null;

  // Insérer l'achat
  const { error: insertError } = await supabase.from('purchases').insert({
    viewer_id: viewerId,
    email,
    product_name: productName,
    product_price: productPrice,
    systemeio_contact_id: systemeioContactId,
    webhook_payload: payload
  });

  if (insertError) {
    await logWebhook(supabase, eventType, payload, ip, signatureValid, false, insertError.message);
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
  }

  await logWebhook(supabase, eventType, payload, ip, signatureValid, true, null);
  return NextResponse.json({ ok: true }, { status: 200 });
}
