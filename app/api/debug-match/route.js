import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim()
);

export async function GET() {
  // Get all viewer emails
  const { data: viewers, error: viewersErr } = await supabase
    .from("viewers")
    .select("id, email")
    .not("email", "is", null);

  // Get all purchase emails
  const { data: purchases, error: purchasesErr } = await supabase
    .from("purchases")
    .select("id, email, product_name, product_price")
    .is("cancelled_at", null);

  const viewerEmails = (viewers || []).map(v => v.email);
  const purchaseEmails = (purchases || []).map(p => p.email);

  // Check specific email
  const targetEmail = "carnaud@windigitalconseil.fr";
  const viewerMatch = viewerEmails.find(e => e === targetEmail);
  const viewerMatchLC = viewerEmails.find(e => e?.toLowerCase() === targetEmail.toLowerCase());
  const purchaseMatch = purchaseEmails.find(e => e === targetEmail);
  const purchaseMatchLC = purchaseEmails.find(e => e?.toLowerCase() === targetEmail.toLowerCase());

  // Find close matches (debugging)
  const closeViewerMatches = viewerEmails.filter(e => e?.includes("carnau") || e?.includes("windigital"));
  const closePurchaseMatches = purchaseEmails.filter(e => e?.includes("carnau") || e?.includes("windigital"));

  return NextResponse.json({
    viewerCount: viewerEmails.length,
    purchaseCount: purchaseEmails.length,
    viewersError: viewersErr?.message || null,
    purchasesError: purchasesErr?.message || null,
    target: targetEmail,
    viewerExactMatch: viewerMatch || null,
    viewerLCMatch: viewerMatchLC || null,
    purchaseExactMatch: purchaseMatch || null,
    purchaseLCMatch: purchaseMatchLC || null,
    closeViewerMatches,
    closePurchaseMatches,
    // Show hex codes of close matches to detect invisible characters
    closeViewerHex: closeViewerMatches.map(e => [...e].map(c => c.charCodeAt(0).toString(16)).join(' ')),
    closePurchaseHex: closePurchaseMatches.map(e => [...e].map(c => c.charCodeAt(0).toString(16)).join(' ')),
  });
}
