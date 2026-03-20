import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Client Supabase côté serveur (service role, bypass RLS)
export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// IPs autorisées de Systeme.io
const ALLOWED_IPS = ['185.236.142.1', '185.236.142.2', '185.236.142.3'];

// Vérifier la signature HMAC SHA256
export function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

// Vérifier l'IP source (optionnel, car certains proxys modifient l'IP)
export function isAllowedIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : null;
  if (!ip) return true;
  return ALLOWED_IPS.includes(ip);
}

// Logger le webhook dans webhook_log
export async function logWebhook(supabase, eventType, payload, ip, signatureValid, processed, errorMessage) {
  await supabase.from('webhook_log').insert({
    event_type: eventType,
    payload,
    ip_address: ip,
    signature_valid: signatureValid,
    processed,
    error_message: errorMessage
  }).catch(() => {}); // Ne jamais bloquer sur le log
}
