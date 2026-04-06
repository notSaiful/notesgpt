// ══════════════════════════════════════════════
// NotesGPT — Service Worker
// Handles: Web Push Notifications + Offline Cache
// ══════════════════════════════════════════════

const CACHE_NAME = "notesgpt-v2";
const STATIC_ASSETS = [
  "/",
  "/css/style.css",
  "/assets/logo.svg",
  "/assets/og-image.png",
];

// ── Install: Cache static assets ──────────────
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: Clean old caches ────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: Network first, cache fallback ──────
self.addEventListener("fetch", (e) => {
  // Only cache GET requests to our own origin
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin)) return;
  // Never cache API calls
  if (e.request.url.includes("/api/")) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── Push Notification Handler ─────────────────
self.addEventListener("push", (e) => {
  const data = e.data?.json() || {};
  const title = data.title || "NotesGPT";
  const options = {
    body: data.body || "Your study session is waiting!",
    icon: "/assets/icon-192.png",
    badge: "/assets/logo.svg",
    data: { url: data.url || "/" },
    actions: data.actions || [
      { action: "study", title: "📚 Start Studying" },
      { action: "dismiss", title: "Later" },
    ],
    vibrate: [100, 50, 100],
    requireInteraction: false,
    tag: data.tag || "notesgpt-reminder",
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification Click Handler ────────────────
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  if (e.action === "dismiss") return;

  const url = e.notification.data?.url || "/";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(url); }
      else clients.openWindow(url);
    })
  );
});
