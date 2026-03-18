"use client";

import { useState, useMemo } from "react";
import { formatDuration } from "@/lib/utils";

export default function RetentionChart({ sessions, videoDuration }) {
  const [hover, setHover] = useState(null);

  const chartData = useMemo(() => {
    if (!sessions.length || !videoDuration) return [];
    const buckets = 50;
    const bucketSize = videoDuration / buckets;
    const total = sessions.length;
    const data = [];
    for (let i = 0; i <= buckets; i++) {
      const timePoint = i * bucketSize;
      const percent = (timePoint / videoDuration) * 100;
      const viewersAtPoint = sessions.filter((s) => s.max_video_seconds >= timePoint).length;
      const retention = (viewersAtPoint / total) * 100;
      data.push({
        time: timePoint,
        percent: Math.round(percent),
        retention: Math.round(retention * 10) / 10,
        viewers: viewersAtPoint,
      });
    }
    return data;
  }, [sessions, videoDuration]);

  if (!chartData.length) {
    return (
      <div className="py-16 text-center text-gray-500 text-sm">Aucune donnée de rétention</div>
    );
  }

  const W = 800, H = 300, PAD = { t: 20, r: 30, b: 50, l: 55 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const points = chartData.map((d, i) => ({
    x: PAD.l + (i / (chartData.length - 1)) * plotW,
    y: PAD.t + plotH - (d.retention / 100) * plotH,
    ...d,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${PAD.t + plotH} L${PAD.l},${PAD.t + plotH} Z`;

  // Find steepest drop
  let maxDrop = 0, dropIndex = 0;
  for (let i = 1; i < chartData.length; i++) {
    const drop = chartData[i - 1].retention - chartData[i].retention;
    if (drop > maxDrop) { maxDrop = drop; dropIndex = i; }
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        <defs>
          <linearGradient id="retGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Grid */}
        {[0, 25, 50, 75, 100].map((v) => {
          const y = PAD.t + plotH - (v / 100) * plotH;
          return (
            <g key={v}>
              <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#1c1c2e" strokeWidth="1" />
              <text x={PAD.l - 10} y={y + 4} textAnchor="end" fill="#4b5563" fontSize="11" fontFamily="DM Sans, system-ui">{v}%</text>
            </g>
          );
        })}

        {/* X-axis */}
        {[0, 25, 50, 75, 100].map((pct) => {
          const x = PAD.l + (pct / 100) * plotW;
          const timeAtPct = Math.round((pct / 100) * videoDuration);
          return (
            <text key={pct} x={x} y={H - 10} textAnchor="middle" fill="#4b5563" fontSize="11" fontFamily="DM Sans, system-ui">
              {formatDuration(timeAtPct)}
            </text>
          );
        })}

        {/* Area */}
        <path d={areaPath} fill="url(#retGrad)" />

        {/* Line */}
        <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round" />

        {/* Drop zone */}
        {dropIndex > 0 && (
          <rect
            x={points[dropIndex - 1].x}
            y={PAD.t}
            width={Math.max(points[dropIndex].x - points[dropIndex - 1].x, 8)}
            height={plotH}
            fill="#ef4444"
            opacity="0.07"
            rx="3"
          />
        )}

        {/* Hover zones */}
        {points.map((p, i) => (
          <rect
            key={i}
            x={p.x - plotW / points.length / 2}
            y={PAD.t}
            width={plotW / points.length}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: "crosshair" }}
          />
        ))}

        {/* Hover line + dot */}
        {hover !== null && points[hover] && (
          <g>
            <line x1={points[hover].x} y1={PAD.t} x2={points[hover].x} y2={PAD.t + plotH} stroke="#6366f1" strokeWidth="1" strokeDasharray="4,4" opacity="0.5" />
            <circle cx={points[hover].x} cy={points[hover].y} r="5" fill="#6366f1" stroke="#0a0a12" strokeWidth="2.5" />
          </g>
        )}
      </svg>

      {/* Tooltip */}
      {hover !== null && points[hover] && (
        <div
          className="absolute pointer-events-none z-10 bg-pulse-surface border border-pulse-border-hover rounded-xl px-3.5 py-2.5 shadow-xl"
          style={{
            left: `${(points[hover].x / W) * 100}%`,
            top: `${(points[hover].y / H) * 100 - 14}%`,
            transform: "translate(-50%, -100%)",
            minWidth: 150,
          }}
        >
          <div className="text-sm font-semibold text-white">{chartData[hover].retention}% encore là</div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            À {formatDuration(chartData[hover].time)} ({chartData[hover].percent}%)
          </div>
          <div className="text-[11px] text-gray-500">
            {chartData[hover].viewers} viewer{chartData[hover].viewers > 1 ? "s" : ""}
          </div>
        </div>
      )}

      {/* Drop label */}
      {dropIndex > 0 && (
        <div
          className="absolute bottom-12 pointer-events-none bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1 text-[11px] text-red-400 whitespace-nowrap font-medium"
          style={{
            left: `${((points[dropIndex].x + points[dropIndex - 1].x) / 2 / W) * 100}%`,
            transform: "translateX(-50%)",
          }}
        >
          Drop max: -{maxDrop.toFixed(1)}% à {formatDuration(chartData[dropIndex].time)}
        </div>
      )}
    </div>
  );
}
