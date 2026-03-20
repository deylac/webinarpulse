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

  // Extraire prix et nom du produit (structure Systeme.io)
  const productName = payload?.pricePlan?.innerName
    || payload?.pricePlan?.name
    || payload?.orderItem?.resources?.[0]?.course?.name
    || order.plan_name || order.product_name || null;
  const productPrice = order.totalPrice ?? order.amount ?? order.total_price ?? payload?.pricePlan?.amount ?? null;

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

  // 6. Sale-triggered matching : identifier les sessions anonymes de cet acheteur
  await matchBuyerToAnonymousSessions(supabase, email);

  await logWebhook(supabase, eventType, payload, ip, signatureValid, true, null);
  return NextResponse.json({ ok: true }, { status: 200 });
}

/**
 * Quand un achat est confirmé, on a l'email de l'acheteur.
 * On cherche s'il a des sessions anonymes qu'on peut lui attribuer :
 * 1. Vérifier si l'email est déjà associé à un viewer → pas besoin
 * 2. Chercher dans pending_registrations si cet email s'est inscrit
 * 3. Si oui, trouver les sessions anonymes proches de l'inscription
 * 4. Assigner l'email au viewer anonyme le plus probable
 */
async function matchBuyerToAnonymousSessions(supabase, email) {
  try {
    // Vérifier si cet email a déjà un viewer avec des sessions
    const { data: existingViewer } = await supabase
      .from('viewers')
      .select('id')
      .eq('email', email)
      .limit(1);

    if (existingViewer?.length > 0) return; // Déjà identifié, rien à faire

    // Chercher l'inscription la plus récente pour cet email
    const { data: registrations } = await supabase
      .from('pending_registrations')
      .select('id, created_at, client_ip')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!registrations?.length) return; // Pas d'inscription connue

    const reg = registrations[0];
    const regTime = new Date(reg.created_at);
    const windowStart = new Date(regTime.getTime() - 5 * 60 * 1000).toISOString();
    const windowEnd = new Date(regTime.getTime() + 120 * 60 * 1000).toISOString(); // 2h window

    // Chercher les sessions anonymes dans cette fenêtre
    const { data: anonSessions } = await supabase
      .from('viewing_sessions')
      .select('id, viewer_id, client_ip, started_at, viewer:viewers(id, email)')
      .gte('started_at', windowStart)
      .lte('started_at', windowEnd);

    if (!anonSessions?.length) return;

    // Filtrer : uniquement les sessions sans email
    const sessions = anonSessions.filter(s => s.viewer && !s.viewer.email);
    if (sessions.length === 0) return;

    // Stratégie de matching (par ordre de fiabilité)
    let bestMatch = null;

    // 1. Match par IP (le plus fiable)
    if (reg.client_ip) {
      bestMatch = sessions.find(s => s.client_ip === reg.client_ip);
    }

    // 2. Si une seule session anonyme dans la fenêtre → c'est probablement elle
    if (!bestMatch && sessions.length === 1) {
      bestMatch = sessions[0];
    }

    // 3. Session la plus proche de l'inscription
    if (!bestMatch) {
      bestMatch = sessions.sort((a, b) => {
        const diffA = Math.abs(new Date(a.started_at) - regTime);
        const diffB = Math.abs(new Date(b.started_at) - regTime);
        return diffA - diffB;
      })[0];
      // Seulement si c'est dans les 10 minutes de l'inscription (plus strict sans IP)
      const diff = Math.abs(new Date(bestMatch.started_at) - regTime) / 1000 / 60;
      if (diff > 10) bestMatch = null;
    }

    if (!bestMatch) return;

    // Assigner l'email au viewer anonyme
    await supabase
      .from('viewers')
      .update({ email })
      .eq('id', bestMatch.viewer_id);

    // Marquer le pending_registration comme matché
    await supabase
      .from('pending_registrations')
      .update({ matched: true, matched_session_id: bestMatch.id })
      .eq('id', reg.id);

    console.log(`Sale-triggered match: ${email} → session ${bestMatch.id}`);
  } catch (e) {
    console.error('Sale-triggered matching error:', e);
  }
}
