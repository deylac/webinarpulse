export function formatDuration(seconds) {
  if (!seconds || seconds === 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}m`;
  if (m > 0) return `${m}m${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function generateDemoSessions(webinarId, webinars) {
  const sessions = [];
  const now = Date.now();
  const names = [
    "marie.dupont@gmail.com", "jean.martin@outlook.fr", "sophie.bernard@yahoo.fr",
    "pierre.durand@gmail.com", "claire.moreau@hotmail.com", "lucas.simon@gmail.com",
    "emma.laurent@free.fr", "hugo.garcia@gmail.com", "lea.roux@orange.fr",
    "thomas.fournier@gmail.com", "julie.morel@laposte.net", "antoine.girard@gmail.com",
    "camille.andre@outlook.fr", "maxime.lefebvre@gmail.com", "sarah.mercier@yahoo.fr",
    "nicolas.dupuis@gmail.com", "manon.lambert@free.fr", "alexandre.bonnet@gmail.com",
    null, null, null, null, null,
  ];
  const webinar = webinars.find((w) => w.id === webinarId) || webinars[0];
  const maxDuration = webinar?.video_duration_seconds || 3600;

  for (let i = 0; i < 45; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const startTime = new Date(now - daysAgo * 86400000 - Math.random() * 43200000);
    const r = Math.random();
    let watchPercent;
    if (r < 0.15) watchPercent = Math.random() * 0.05;
    else if (r < 0.35) watchPercent = 0.05 + Math.random() * 0.2;
    else if (r < 0.55) watchPercent = 0.25 + Math.random() * 0.25;
    else if (r < 0.75) watchPercent = 0.5 + Math.random() * 0.2;
    else if (r < 0.9) watchPercent = 0.7 + Math.random() * 0.2;
    else watchPercent = 0.9 + Math.random() * 0.1;

    const watchSeconds = Math.round(watchPercent * maxDuration);
    const email = names[i % names.length];
    sessions.push({
      id: `s${webinarId}-${i}`,
      webinar_id: webinarId,
      viewer_email: email,
      viewer_anonymous: email ? null : `anon-${Math.random().toString(36).substr(2, 8)}`,
      started_at: startTime.toISOString(),
      ended_at: new Date(startTime.getTime() + watchSeconds * 1000).toISOString(),
      duration_seconds: watchSeconds,
      max_video_percent: Math.round(watchPercent * 100),
      max_video_seconds: watchSeconds,
    });
  }
  return sessions;
}

export const DEMO_WEBINARS = [
  { id: "w1", name: "Bootcamp LinkedIn IA — Masterclass", vimeo_video_id: "123456", video_duration_seconds: 5400, slug: "bootcamp-masterclass" },
  { id: "w2", name: "Prospection Inversée™ — Workshop", vimeo_video_id: "789012", video_duration_seconds: 3600, slug: "prospection-workshop" },
  { id: "w3", name: "IA pour Indépendants — Webinaire", vimeo_video_id: "345678", video_duration_seconds: 4200, slug: "ia-independants" },
];
