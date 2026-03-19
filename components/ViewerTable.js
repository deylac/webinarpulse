"use client";

import { useState, useMemo } from "react";
import { formatDuration, formatDateTime } from "@/lib/utils";

export default function ViewerTable({ sessions }) {
  const [sortBy, setSortBy] = useState("started_at");
  const [sortDir, setSortDir] = useState("desc");

  const sorted = useMemo(() => {
    return [...sessions].sort((a, b) => {
      let va, vb;
      if (sortBy === "started_at") { va = new Date(a.started_at); vb = new Date(b.started_at); }
      else if (sortBy === "duration") { va = a.duration_seconds; vb = b.duration_seconds; }
      else if (sortBy === "percent") { va = a.max_video_percent; vb = b.max_video_percent; }
      else { va = a.viewer_email || "zzz"; vb = b.viewer_email || "zzz"; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [sessions, sortBy, sortDir]);

  function toggleSort(col) {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("desc"); }
  }

  function barColor(pct) {
    if (pct >= 80) return "bg-emerald-500";
    if (pct >= 50) return "bg-yellow-500";
    if (pct >= 20) return "bg-orange-500";
    return "bg-red-500";
  }

  function textColor(pct) {
    if (pct >= 80) return "text-emerald-400";
    if (pct >= 50) return "text-yellow-400";
    if (pct >= 20) return "text-orange-400";
    return "text-red-400";
  }

  const cols = [
    { id: "email", label: "Viewer" },
    { id: "started_at", label: "Date" },
    { id: "duration", label: "Durée" },
    { id: "percent", label: "Progression" },
    { id: "tag", label: "Tag SIO" },
  ];

  function tagBadge(s) {
    const pct = s.max_video_percent || 0;
    if (!s.tagged_at) return { label: "–", css: "text-gray-600" };
    if (pct >= 80) return { label: "🟢 Complété", css: "text-emerald-400" };
    if (pct >= 50) return { label: "🟡 Engagé", css: "text-yellow-400" };
    if (pct >= 10) return { label: "🟠 Partiel", css: "text-orange-400" };
    return { label: "🔴 Bounce", css: "text-red-400" };
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            {cols.map((col) => (
              <th
                key={col.id}
                onClick={() => toggleSort(col.id)}
                className={`px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider border-b border-pulse-border cursor-pointer select-none transition-colors ${
                  sortBy === col.id ? "text-indigo-400" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {col.label}
                {sortBy === col.id && (
                  <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 50).map((s, i) => {
            const pct = s.max_video_percent || 0;
            return (
              <tr
                key={s.id || i}
                className="border-b border-pulse-border/50 hover:bg-white/[0.015] transition-colors"
              >
                <td className="px-5 py-3 text-sm">
                  {s.viewer_email ? (
                    <span className="text-white">{s.viewer_email}</span>
                  ) : (
                    <span className="text-gray-600 italic">Anonyme</span>
                  )}
                </td>
                <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">
                  {formatDateTime(s.started_at)}
                </td>
                <td className="px-5 py-3 text-sm text-white font-mono">
                  {formatDuration(s.duration_seconds)}
                </td>
                <td className="px-5 py-3 min-w-[180px]">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-pulse-border rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor(pct)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={`text-xs font-semibold font-mono min-w-[36px] text-right ${textColor(pct)}`}>
                      {pct}%
                    </span>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <span className={`text-[10px] font-semibold ${tagBadge(s).css}`}>
                    {tagBadge(s).label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sessions.length > 50 && (
        <div className="px-5 py-3 text-center text-xs text-gray-500">
          50 premières sessions sur {sessions.length}
        </div>
      )}
    </div>
  );
}
