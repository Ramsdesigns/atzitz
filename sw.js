/* sw.js — מעטפת האפליקציה במטמון (פתיחה מהירה גם בלי רשת) + קבלת התראות push. */
const VERSION = "20261010231116";
const SHELL = ["./","index.html","app.js","app.css","manifest.webmanifest","fonts/fonts.css","lib/care.js","lib/cloud.js","lib/config.js","lib/data.js","lib/ui.js","vendor/supabase.js","data/index.json","data/learn/lessons.json","data/learn/tips.json","data/learn/diagnosis.json","fonts/Rubik-400-hebrew.woff2","fonts/Rubik-400-latin.woff2","fonts/Rubik-500-hebrew.woff2","fonts/Rubik-500-latin.woff2","fonts/Rubik-600-hebrew.woff2","fonts/Rubik-600-latin.woff2","fonts/Rubik-700-hebrew.woff2","fonts/Rubik-700-latin.woff2","icons/192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// רשת קודם (עדכונים), מטמון כגיבוי. כרטיסי צמחים (data/p) נשמרים במטמון אחרי הקריאה הראשונה.
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // no-cache: תמיד לשאול את השרת אם יש גרסה חדשה (GitHub Pages שומר בדפדפן עד 10 דקות)
  const req = e.request.mode === "navigate" ? fetch(u.href, { cache: "no-cache" }) : fetch(e.request, { cache: "no-cache" });
  e.respondWith(
    req.then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request).then(r => r ?? caches.match("index.html"))),
  );
});

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: "עציץ", body: e.data?.text() ?? "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "עציץ", {
    body: d.body || "", tag: d.tag, renotify: !!d.tag, icon: "icons/192.png", badge: "icons/badge.png",
    data: { url: d.url || "./#today" }, lang: "he", dir: "rtl",
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./#today", self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) { await c.focus(); return c.navigate(url); }
    }
    return clients.openWindow(url);
  })());
});
