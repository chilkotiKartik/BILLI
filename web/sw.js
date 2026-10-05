// Service Worker for Billi: Offline Caching & Background Notifications
const CACHE_NAME = "billi-v2";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./login.html",
  "./today.html",
  "./timetable.html",
  "./tasks.html",
  "./timer.html",
  "./gate.html",
  "./mock.html",
  "./ask.html",
  "./class.html",
  "./settings.html",
  "./css/app.css",
  "./js/config.js",
  "./js/core.js",
  "./js/day.js",
  "./js/gate.js",
  "./js/mock.js",
  "./js/alarm.js",
  "./js/data.js",
  "./js/gate-data.js",
  "./vendor/supabase.js",
  "./icon.svg",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  
  // Cache-first for static JSON datasets (gate syllabus and past papers)
  if (url.pathname.includes("/data/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // Network-first with cache fallback for HTML and app scripts
  if (event.request.mode === "navigate" || event.request.destination === "script" || event.request.destination === "style") {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// Handle Background Alarm Notifications
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("today.html") && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("./today.html");
    })
  );
});
