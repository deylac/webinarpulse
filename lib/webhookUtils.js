import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Client Supabase côté serveur (service role, bypass RLS)
// Fallback to anon key if service role key is not set
export function getSupabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error('No Supabase key available (SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY)');
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    key
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

// Vérifier la signature en essayant tous les secrets stockés en DB + env var fallback
export async function verifySignatureFromDb(supabase, rawBody, signature) {
  if (!signature) return false;

  // Collecter tous les secrets possibles
  const secrets = [];

  // 1. Secrets depuis la DB (systemeio_accounts.webhook_secret)
  try {
    const { data: accounts } = await supabase
      .from('systemeio_accounts')
      .select('webhook_secret')
      .not('webhook_secret', 'is', null);
    if (accounts) {
      for (const acc of accounts) {
        if (acc.webhook_secret) secrets.push(acc.webhook_secret);
      }
    }
  } catch {
    // Continue avec le fallback
  }

  // 2. Fallback : variable d'environnement
  if (process.env.WEBHOOK_SECRET) {
    secrets.push(process.env.WEBHOOK_SECRET);
  }

  // 3. Essayer chaque secret
  for (const secret of secrets) {
    if (verifySignature(rawBody, signature, secret)) return true;
  }

  return false;
}
