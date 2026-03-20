"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";

export default function ConversionTab({ webinar, sessions }) {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPurchases();
  }, [webinar]);

  async function loadPurchases() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("purchases")
        .select("*")
        .is("cancelled_at", null)
        .order("created_at", { ascending: false });
      setPurchases(data || []);
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
      .map((s) => s.viewer_email);
    return [...new Set(emails)];
  }, [sessions]);

  // Buyers who are also viewers of this webinar
  const buyers = useMemo(() => {
    return purchases.filter((p) => uniqueViewers.includes(p.email));
  }, [purchases, uniqueViewers]);

  const conversionRate = useMemo(() => {
    if (uniqueViewers.length === 0) return 0;
    return Math.round((buyers.length / uniqueViewers.length) * 1000) / 10;
  }, [buyers, uniqueViewers]);

  // Threshold analysis: conversion rate at each 10% video milestone
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

  // Find critical threshold (biggest jump)
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

  // Average delay between first session and purchase
  const avgDelay = useMemo(() => {
    const delays = buyers
      .map((buyer) => {
        const buyerSessions = sessions
          ?.filter((s) => s.viewer_email === buyer.email)
          .sort(
            (a, b) => new Date(a.started_at) - new Date(b.started_at)
          );
        if (!buyerSessions?.length) return null;
        const firstSession = new Date(buyerSessions[0].started_at);
        const purchaseDate = new Date(buyer.created_at);
        return (purchaseDate - firstSession) / (1000 * 60 * 60);
      })
      .filter((d) => d !== null && d >= 0);

    if (!delays.length) return null;
    return delays.reduce((a, b) => a + b, 0) / delays.length;
  }, [buyers, sessions]);

  function formatDelay(hours) {
    if (hours === null) return "–";
    if (hours < 1) return `${Math.round(hours * 60)}min`;
    if (hours < 24) return `${Math.round(hours)}h`;
    const days = Math.floor(hours / 24);
    const h = Math.round(hours % 24);
    return `${days}j ${h}h`;
  }

  // Buyer details for the table
  const buyerDetails = useMemo(() => {
    return buyers.map((buyer) => {
      const buyerSessions = sessions
        ?.filter((s) => s.viewer_email === buyer.email)
        .sort(
          (a, b) => new Date(a.started_at) - new Date(b.started_at)
        );
      const bestPercent = Math.max(
        ...(buyerSessions?.map((s) => s.max_video_percent || 0) || [0])
      );
      const firstSession = buyerSessions?.[0];
      let delay = null;
      if (firstSession) {
        delay =
          (new Date(buyer.created_at) - new Date(firstSession.started_at)) /
          (1000 * 60 * 60);
      }
      return {
        email: buyer.email,
        product: buyer.product_name || "–",
        price: buyer.product_price,
        percent: bestPercent,
        delay,
        date: new Date(buyer.created_at),
      };
    });
  }, [buyers, sessions]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-pulse-border border-t-pulse-accent rounded-full animate-spin" />
      </div>
    );
  }

  // Helper: format price from centimes to euros
  function formatPrice(centimes) {
    if (centimes == null) return "–";
    return `${(centimes / 100).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€`;
  }

  // Empty state
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
            {buyers.length} acheteur{buyers.length > 1 ? "s" : ""} /{" "}
            {uniqueViewers.length} identifié{uniqueViewers.length > 1 ? "s" : ""}
          </div>
        </div>

        <div className="bg-pulse-deep rounded-xl p-4 border border-pulse-border">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            Chiffre d'affaires
          </div>
          <div className="text-2xl font-bold text-white">
            {formatPrice(buyers.reduce((sum, b) => sum + (b.product_price || 0), 0))}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {buyers.length} vente{buyers.length > 1 ? "s" : ""}
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

        {criticalThreshold && (
          <div className="bg-pulse-deep rounded-xl p-4 border border-pulse-border">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
              Seuil critique
            </div>
            <div className="text-2xl font-bold text-amber-400">
              {criticalThreshold.threshold}%
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              conversion → {criticalThreshold.rate}%
            </div>
          </div>
        )}
      </div>

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

      {/* Buyers Table */}
      <div>
        <h3 className="font-display text-base font-semibold text-white mb-4">
          Acheteurs ({buyerDetails.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-pulse-border">
                <th className="pb-3 pr-4">Email</th>
                <th className="pb-3 pr-4">Produit</th>
                <th className="pb-3 pr-4">Prix</th>
                <th className="pb-3 pr-4">% vidéo</th>
                <th className="pb-3 pr-4">Délai</th>
                <th className="pb-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {buyerDetails.map((b, i) => (
                <tr
                  key={i}
                  className="border-b border-pulse-border/50 hover:bg-pulse-deep/50 transition-colors"
                >
                  <td className="py-3 pr-4 text-white font-medium">
                    {b.email}
                  </td>
                  <td className="py-3 pr-4 text-gray-400">{b.product}</td>
                  <td className="py-3 pr-4 text-emerald-400 font-medium">
                    {formatPrice(b.price)}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-pulse-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-pulse-accent rounded-full"
                          style={{ width: `${Math.min(b.percent, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400">
                        {b.percent}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-gray-400">
                    {formatDelay(b.delay)}
                  </td>
                  <td className="py-3 text-gray-500 text-xs">
                    {b.date.toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                    })}
                  </td>
                </tr>
              ))}
              {buyerDetails.length === 0 && (
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
    </div>
  );
}
