"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";

export default function ConversionTab({ webinar, sessions, refreshKey }) {
  const [purchases, setPurchases] = useState([]);
  const [knownEmails, setKnownEmails] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPurchases();
  }, [webinar, refreshKey]);

  async function loadPurchases() {
    setLoading(true);
    try {
      // 1. Load all purchases
      const { data: purchasesData } = await supabase
        .from("purchases")
        .select("*")
        .is("cancelled_at", null)
        .order("created_at", { ascending: false });
      setPurchases(purchasesData || []);

      // 2. Extract unique purchase emails, then check which ones exist as viewers OF THIS WEBINAR
      const purchaseEmails = [...new Set(
        (purchasesData || []).map(p => p.email?.toLowerCase()).filter(Boolean)
      )];

      if (purchaseEmails.length > 0 && webinar?.id) {
        // Query viewers scoped to this webinar via viewing_sessions (not global viewers table)
        const { data: webinarSessions } = await supabase
          .from("viewing_sessions")
          .select("viewer:viewers(email)")
          .eq("webinar_id", webinar.id);
        const webinarViewerEmails = [...new Set(
          (webinarSessions || [])
            .map(s => s.viewer?.email?.toLowerCase())
            .filter(Boolean)
        )];
        // Only keep emails that are both webinar viewers AND purchasers
        setKnownEmails(webinarViewerEmails.filter(e => purchaseEmails.includes(e)));
      } else {
        setKnownEmails([]);
      }
    } catch {
      // pass
    } finally {
      setLoading(false);
    }
  }

  // Unique identified viewers for this webinar
  const uniqueViewers = useMemo(() => {
    const emails = sessions
      ?.filter((s) => s.viewer_email)
      .map((s) => s.viewer_email.toLowerCase());
    return [...new Set(emails)];
  }, [sessions]);

  // All known emails: from sessions of this webinar + from viewers table
  const allKnownEmails = useMemo(() => {
    return [...new Set([...uniqueViewers, ...knownEmails])];
  }, [uniqueViewers, knownEmails]);

  // Helper: check if product name matches the main product (fuzzy includes)
  const mainProductName = webinar?.main_product_name;
  function isMainProduct(productName) {
    if (!mainProductName || !productName) return false;
    return productName.toLowerCase().includes(mainProductName.toLowerCase());
  }

  // Helper: detect which payment plan a purchase matches
  const plansConfig = webinar?.main_product_plans;
  function detectPlan(purchase) {
    if (!plansConfig?.length) return null;
    const price = purchase.product_price || 0;
    for (const plan of plansConfig) {
      const tolerance = plan.price * 0.10; // 10% tolerance
      if (Math.abs(price - plan.price) <= tolerance) {
        return plan;
      }
    }
    return null;
  }

  // Buyers whose email is known AND whose purchase matches the main product
  const buyers = useMemo(() => {
    const known = purchases.filter((p) => p.email && allKnownEmails.includes(p.email.toLowerCase()));
    if (!mainProductName) return known;
    return known.filter((p) => isMainProduct(p.product_name));
  }, [purchases, allKnownEmails, mainProductName]);

  // Buyers NOT matched — email not in viewers table at all
  // Also filtered by main product name if configured
  const unmatchedBuyers = useMemo(() => {
    const unmatched = purchases.filter((p) => p.email && !allKnownEmails.includes(p.email.toLowerCase()));
    if (!mainProductName) return unmatched;
    return unmatched.filter((p) => isMainProduct(p.product_name));
  }, [purchases, allKnownEmails, mainProductName]);

  // Unique unmatched buyer emails
  const uniqueUnmatchedEmails = useMemo(() => {
    return [...new Set(unmatchedBuyers.map((b) => b.email))];
  }, [unmatchedBuyers]);

  // Unique buyer emails
  const uniqueBuyerEmails = useMemo(() => {
    return [...new Set(buyers.map((b) => b.email))];
  }, [buyers]);

  const conversionRate = useMemo(() => {
    if (uniqueViewers.length === 0) return 0;
    return Math.round((uniqueBuyerEmails.length / uniqueViewers.length) * 1000) / 10;
  }, [uniqueBuyerEmails, uniqueViewers]);

  // Group purchases by buyer email
  const buyerGroups = useMemo(() => {
    const groups = {};
    buyers.forEach((buyer) => {
      if (!groups[buyer.email]) {
        groups[buyer.email] = { email: buyer.email, purchases: [], totalCentimes: 0 };
      }
      // Detect plan for each purchase
      const plan = detectPlan(buyer);
      groups[buyer.email].purchases.push({ ...buyer, detectedPlan: plan });
      groups[buyer.email].totalCentimes += buyer.product_price || 0;
    });

    // Add viewing data to each group
    return Object.values(groups).map((group) => {
      const buyerSessions = sessions
        ?.filter((s) => s.viewer_email === group.email)
        .sort((a, b) => new Date(a.started_at) - new Date(b.started_at));
      const bestPercent = buyerSessions?.length > 0
        ? Math.max(...buyerSessions.map((s) => s.max_video_percent || 0))
        : null;
      const firstSession = buyerSessions?.[0];
      const firstPurchase = group.purchases.sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      )[0];
      let delay = null;
      if (firstSession && firstPurchase) {
        delay =
          (new Date(firstPurchase.created_at) - new Date(firstSession.started_at)) /
          (1000 * 60 * 60);
      }
      // Determine if buyer has session or is "known but no session"
      const hasSession = buyerSessions && buyerSessions.length > 0;
      return {
        ...group,
        percent: bestPercent,
        delay,
        date: new Date(firstPurchase.created_at),
        hasSession,
      };
    }).sort((a, b) => b.date - a.date);
  }, [buyers, sessions, plansConfig]);

  // Main product stats (buyers is already filtered by main product name)
  const mainProductStats = useMemo(() => {
    if (!mainProductName) return null;
    const uniqueMainBuyers = [...new Set(buyers.map((b) => b.email))];
    const totalCentimes = buyers.reduce((s, b) => s + (b.product_price || 0), 0);
    return {
      count: uniqueMainBuyers.length,
      totalPurchases: buyers.length,
      totalCentimes,
    };
  }, [buyers, mainProductName]);

  // Revenue forecast with installments (supports multiple plans)
  const forecast = useMemo(() => {
    if (!mainProductStats || !plansConfig?.length) return null;
    // Only show forecast if at least one plan has multiple payments
    const hasInstallments = plansConfig.some(p => p.payments > 1);
    if (!hasInstallments) return null;

    let totalForecasted = 0;
    let totalCollected = 0;
    const planBreakdown = [];

    plansConfig.forEach(plan => {
      const tolerance = plan.price * 0.10; // 10% tolerance for price matching
      const matched = buyers.filter(
        p => Math.abs((p.product_price || 0) - plan.price) <= tolerance
      );
      const uniqueEmails = [...new Set(matched.map(m => m.email))];
      if (uniqueEmails.length > 0) {
        const forecasted = uniqueEmails.length * plan.payments * plan.price;
        const collected = uniqueEmails.length * plan.price; // first payment
        totalForecasted += forecasted;
        totalCollected += collected;
        planBreakdown.push({
          count: uniqueEmails.length,
          payments: plan.payments,
          price: plan.price,
          total: forecasted,
        });
      }
    });

    if (totalForecasted === 0) return null;

    return {
      total: totalForecasted,
      collected: totalCollected,
      remaining: totalForecasted - totalCollected,
      breakdown: planBreakdown,
    };
  }, [mainProductStats, webinar, buyers, mainProductName]);

  // Threshold analysis
  const thresholdData = useMemo(() => {
    const thresholds = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    return thresholds.map((t) => {
      const viewersAbove = sessions?.filter(
        (s) => (s.max_video_percent || 0) >= t
      );
      const emailsAbove = [
        ...new Set(
          viewersAbove?.filter((s) => s.viewer_email).map((s) => s.viewer_email)
        ),
      ];
      const buyersAbove = emailsAbove.filter((e) =>
        buyers.some((b) => b.email === e)
      );
      return {
        threshold: t,
        viewers: emailsAbove.length,
        buyers: buyersAbove.length,
        rate:
          emailsAbove.length > 0
            ? Math.round((buyersAbove.length / emailsAbove.length) * 1000) / 10
            : 0,
      };
    });
  }, [sessions, buyers]);

  const criticalThreshold = useMemo(() => {
    let maxJump = 0;
    let critical = null;
    for (let i = 1; i < thresholdData.length; i++) {
      const jump = thresholdData[i].rate - thresholdData[i - 1].rate;
      if (jump > maxJump) {
        maxJump = jump;
        critical = thresholdData[i];
      }
    }
    return critical;
  }, [thresholdData]);

  // Average delay
  const avgDelay = useMemo(() => {
    const delays = buyerGroups.map((g) => g.delay).filter((d) => d !== null && d >= 0);
    if (!delays.length) return null;
    return delays.reduce((a, b) => a + b, 0) / delays.length;
  }, [buyerGroups]);

  function formatDelay(hours) {
    if (hours === null) return "–";
    if (hours < 1) return `${Math.round(hours * 60)}min`;
    if (hours < 24) return `${Math.round(hours)}h`;
    const days = Math.floor(hours / 24);
    const h = Math.round(hours % 24);
    return `${days}j ${h}h`;
  }

  function formatPrice(centimes) {
    if (centimes == null) return "–";
    return `${(centimes / 100).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€`;
  }



  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-pulse-border border-t-pulse-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (purchases.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="text-4xl mb-4">💰</div>
        <h3 className="font-display text-lg font-semibold text-white mb-2">
          Aucun achat enregistré
        </h3>
        <p className="text-sm text-gray-400 mb-4 max-w-md mx-auto leading-relaxed">
          Pour activer le suivi des achats, configurez le webhook{" "}
          <span className="text-pulse-accent font-medium">NEW_SALE</span> dans
          Systeme.io. Les achats apparaîtront automatiquement ici.
        </p>
        <p className="text-xs text-gray-500">
          Cliquez sur <span className="text-gray-300">« ◇ Script »</span> puis
          l'onglet <span className="text-gray-300">Webhooks</span> pour les
          instructions.
        </p>
      </div>
    );
  }

  const maxThresholdRate = Math.max(...thresholdData.map((t) => t.rate), 1);
  const totalCA = buyers.reduce((sum, b) => sum + (b.product_price || 0), 0);
  const panierMoyen = uniqueBuyerEmails.length > 0 ? Math.round(totalCA / uniqueBuyerEmails.length) : 0;

  return (
    <div className="p-6 space-y-8">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-pulse-deep rounded-xl p-4 border border-pulse-border">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            Taux de conversion
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            {conversionRate}%
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {uniqueBuyerEmails.length} acheteur{uniqueBuyerEmails.length > 1 ? "s" : ""} unique{uniqueBuyerEmails.length > 1 ? "s" : ""} / {uniqueViewers.length} identifié{uniqueViewers.length > 1 ? "s" : ""}
          </div>
        </div>

        {mainProductStats ? (
          <div className="bg-pulse-deep rounded-xl p-4 border border-pulse-border">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
              Produit principal
            </div>
            <div className="text-2xl font-bold text-purple-400">
              {mainProductStats.count}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {formatPrice(mainProductStats.totalCentimes)} CA
            </div>
          </div>
        ) : (
          <div className="bg-pulse-deep rounded-xl p-4 border border-pulse-border">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
              Chiffre d'affaires
            </div>
            <div className="text-2xl font-bold text-white">
              {formatPrice(totalCA)}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {buyers.length} achat{buyers.length > 1 ? "s" : ""}
            </div>
          </div>
        )}

        <div className="bg-pulse-deep rounded-xl p-4 border border-pulse-border">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            CA Total
          </div>
          <div className="text-2xl font-bold text-white">
            {formatPrice(totalCA)}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {buyers.length} achat{buyers.length > 1 ? "s" : ""} · panier moy. {formatPrice(panierMoyen)}
          </div>
        </div>

        <div className="bg-pulse-deep rounded-xl p-4 border border-pulse-border">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            Délai moyen
          </div>
          <div className="text-2xl font-bold text-blue-400">
            {formatDelay(avgDelay)}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            visionnage → achat
          </div>
        </div>
      </div>

      {/* Forecast block */}
      {forecast && (
        <div className="bg-gradient-to-r from-emerald-500/10 to-purple-500/10 border border-emerald-500/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">💰</span>
            <h4 className="text-sm font-semibold text-white">Forecast paiements en cours</h4>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-lg font-bold text-white">{formatPrice(forecast.total)}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">CA total attendu</div>
            </div>
            <div>
              <div className="text-lg font-bold text-emerald-400">{formatPrice(forecast.collected)}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">Encaissé (1er paiement)</div>
            </div>
            <div>
              <div className="text-lg font-bold text-amber-400">{formatPrice(forecast.remaining)}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">À venir</div>
            </div>
          </div>
          {forecast.breakdown.length > 0 && (
            <div className="mt-3 pt-3 border-t border-emerald-500/10 space-y-1">
              {forecast.breakdown.map((b, i) => (
                <div key={i} className="text-[10px] text-gray-400">
                  {b.count} vente{b.count > 1 ? "s" : ""} en {b.payments}× {formatPrice(b.price)} = {formatPrice(b.total)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Threshold Chart */}
      <div>
        <h3 className="font-display text-base font-semibold text-white mb-1">
          Conversion par palier de visionnage
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Taux de conversion en fonction du % de vidéo vu. Le seuil critique est
          le palier où le taux fait le plus grand bond.
        </p>
        <div className="flex items-end gap-1.5 h-40">
          {thresholdData.map((t) => (
            <div
              key={t.threshold}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <span className="text-[10px] text-gray-400">
                {t.rate > 0 ? `${t.rate}%` : ""}
              </span>
              <div
                className={`w-full rounded-t transition-all ${
                  criticalThreshold?.threshold === t.threshold
                    ? "bg-amber-500"
                    : t.rate > 0
                    ? "bg-emerald-500/70"
                    : "bg-pulse-border"
                }`}
                style={{
                  height: `${
                    maxThresholdRate > 0
                      ? (t.rate / maxThresholdRate) * 100
                      : 0
                  }%`,
                  minHeight: "4px",
                }}
              />
              <span className="text-[10px] text-gray-500">{t.threshold}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Buyers Table — grouped by email */}
      <div>
        <h3 className="font-display text-base font-semibold text-white mb-4">
          Acheteurs ({uniqueBuyerEmails.length}) · {buyers.length} achat{buyers.length > 1 ? "s" : ""}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-pulse-border">
                <th className="pb-3 pr-4">Acheteur</th>
                <th className="pb-3 pr-4">Achats</th>
                <th className="pb-3 pr-4">Total</th>
                <th className="pb-3 pr-4">% Vidéo</th>
                <th className="pb-3 pr-4">Délai</th>
                <th className="pb-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {buyerGroups.map((group) => (
                <tr
                  key={group.email}
                  className="border-b border-pulse-border/50 hover:bg-pulse-deep/50 transition-colors align-top"
                >
                  <td className="py-3 pr-4">
                    <div className="text-white font-medium text-[13px]">{group.email}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {group.purchases.length} achat{group.purchases.length > 1 ? "s" : ""}
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-col gap-1.5">
                      {group.purchases.map((p, j) => (
                        <div key={j} className="flex items-center gap-2">
                          <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                            isMainProduct(p.product_name)
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-gray-500/20 text-gray-400"
                          }`}>
                            {isMainProduct(p.product_name) ? "Principal" : "Upsell"}
                          </span>
                          <span className="text-gray-300 text-xs truncate max-w-[160px]">
                            {p.product_name || "–"}
                          </span>
                          <span className="text-emerald-400 text-xs font-medium ml-auto flex-shrink-0">
                            {formatPrice(p.product_price)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-white font-semibold">
                      {formatPrice(group.totalCentimes)}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    {group.percent !== null ? (
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-pulse-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-pulse-accent rounded-full"
                          style={{ width: `${Math.min(group.percent, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400">
                        {group.percent}%
                      </span>
                    </div>
                    ) : (
                      <span className="text-xs text-gray-600">–</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-gray-400">
                    {formatDelay(group.delay)}
                  </td>
                  <td className="py-3 text-gray-500 text-xs">
                    {group.date.toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                    })}
                  </td>
                </tr>
              ))}
              {buyerGroups.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-gray-500 text-sm"
                  >
                    Aucun acheteur identifié parmi les viewers de ce webinaire.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unmatched Buyers */}
      {/* Debug Panel */}
      <div className="mt-4 bg-pulse-deep/50 rounded-xl p-4 border border-pulse-border/50">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm">🔍</span>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Diagnostic conversion</h4>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-gray-500">Achats chargés</span>
            <div className="text-white font-medium">{purchases.length}</div>
          </div>
          <div>
            <span className="text-gray-500">Viewers webinaire (sessions)</span>
            <div className="text-white font-medium">{uniqueViewers.length}</div>
          </div>
          <div>
            <span className="text-gray-500">Acheteurs matchés</span>
            <div className="text-emerald-400 font-medium">{uniqueBuyerEmails.length}</div>
          </div>
          <div>
            <span className="text-gray-500">Acheteurs non rattachés</span>
            <div className="text-amber-400 font-medium">{uniqueUnmatchedEmails.length}</div>
          </div>
        </div>
        <div className="mt-2 text-[10px] text-gray-600">
          knownEmails (viewers webinaire ∩ acheteurs) : {knownEmails.length} · allKnownEmails : {allKnownEmails.length}
        </div>
      </div>

      {uniqueUnmatchedEmails.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⚠️</span>
            <h3 className="font-display text-base font-semibold text-amber-400">
              Acheteurs non rattachés ({uniqueUnmatchedEmails.length})
            </h3>
          </div>
          <p className="text-xs text-gray-500 mb-4 leading-relaxed">
            Ces personnes ont acheté mais n'ont pas été identifiées comme viewers de ce webinaire.
            Leur email ne correspond à aucune session de visionnage enregistrée.
            Elles seront automatiquement rattachées lors de la prochaine synchronisation si une session correspondante est trouvée.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-amber-500/20">
                  <th className="pb-3 pr-4">Email</th>
                  <th className="pb-3 pr-4">Produit</th>
                  <th className="pb-3 pr-4">Montant</th>
                  <th className="pb-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {uniqueUnmatchedEmails.map((email) => {
                  const emailPurchases = unmatchedBuyers.filter((b) => b.email === email);
                  const totalCentimes = emailPurchases.reduce((s, b) => s + (b.product_price || 0), 0);
                  const firstPurchase = emailPurchases.sort(
                    (a, b) => new Date(a.created_at) - new Date(b.created_at)
                  )[0];
                  return (
                    <tr
                      key={email}
                      className="border-b border-pulse-border/30 hover:bg-amber-500/5 transition-colors"
                    >
                      <td className="py-3 pr-4">
                        <div className="text-amber-300/90 font-medium text-[13px]">{email}</div>
                        <div className="text-[10px] text-gray-600 mt-0.5">
                          {emailPurchases.length} achat{emailPurchases.length > 1 ? "s" : ""}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-col gap-1">
                          {emailPurchases.map((p, j) => (
                            <span key={j} className="text-gray-400 text-xs truncate max-w-[200px]">
                              {p.product_name || "–"}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-amber-400 font-semibold">
                          {formatPrice(totalCentimes)}
                        </span>
                      </td>
                      <td className="py-3 text-gray-500 text-xs">
                        {new Date(firstPurchase.created_at).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
