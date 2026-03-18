"use client";

const colorMap = {
  indigo: { dot: "bg-indigo-500", glow: "shadow-indigo-500/10" },
  purple: { dot: "bg-purple-500", glow: "shadow-purple-500/10" },
  green: { dot: "bg-emerald-500", glow: "shadow-emerald-500/10" },
  yellow: { dot: "bg-yellow-500", glow: "shadow-yellow-500/10" },
};

export default function StatCard({ label, value, sub, color = "indigo" }) {
  const c = colorMap[color] || colorMap.indigo;
  return (
    <div className={`bg-pulse-surface border border-pulse-border rounded-2xl px-5 py-4 shadow-lg ${c.glow}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${c.dot}`} />
        <span className="text-[11px] uppercase tracking-widest text-gray-500 font-medium">
          {label}
        </span>
      </div>
      <div className="font-display text-2xl font-bold text-white leading-none">
        {value}
      </div>
      {sub && <div className="text-[11px] text-gray-500 mt-1.5">{sub}</div>}
    </div>
  );
}
