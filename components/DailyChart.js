"use client";

import { useMemo } from "react";

export default function DailyChart({ sessions }) {
  const dailyData = useMemo(() => {
    const map = {};
    sessions.forEach((s) => {
      const day = s.started_at.split("T")[0];
      if (!map[day]) map[day] = 0;
      map[day]++;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
  }, [sessions]);

  if (!dailyData.length) {
    return <div className="py-16 text-center text-gray-500 text-sm">Aucune donnée</div>;
  }

  const maxCount = Math.max(...dailyData.map((d) => d.count));
  const W = 800, H = 180, PAD = { t: 15, r: 20, b: 35, l: 40 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const barW = Math.min(22, plotW / dailyData.length - 3);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {/* Grid lines */}
      {[0, 0.5, 1].map((frac) => {
        const y = PAD.t + plotH * (1 - frac);
        return (
          <line key={frac} x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#1c1c2e" strokeWidth="1" />
        );
      })}

      {dailyData.map((d, i) => {
        const x = PAD.l + (i / dailyData.length) * plotW + (plotW / dailyData.length - barW) / 2;
        const barH = maxCount > 0 ? (d.count / maxCount) * plotH : 0;
        const y = PAD.t + plotH - barH;
        const showLabel = dailyData.length <= 15 || i === 0 || i === dailyData.length - 1 || i % Math.ceil(dailyData.length / 7) === 0;
        return (
          <g key={d.date}>
            <rect x={x} y={y} width={barW} height={barH} rx={3} fill="#6366f1" opacity="0.75">
              <animate attributeName="height" from="0" to={barH} dur="0.5s" fill="freeze" />
              <animate attributeName="y" from={PAD.t + plotH} to={y} dur="0.5s" fill="freeze" />
            </rect>
            <text x={x + barW / 2} y={y - 5} textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="DM Sans, system-ui">
              {d.count}
            </text>
            {showLabel && (
              <text x={x + barW / 2} y={H - 8} textAnchor="middle" fill="#4b5563" fontSize="9" fontFamily="DM Sans, system-ui">
                {new Date(d.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
