self.smileVersion = "20261113a";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "Tritone", body: "Nuovo avviso nel quaderno.", url: "/notifiche" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Il testo di riserva basta.
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const visibile = list.some((client) => client.visibilityState === "visible");
      if (visibile && !payload.foreground) return;
      return self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/brand/mark-192.png",
        badge: "/brand/mark-192.png",
        data: { url: payload.url || "/notifiche" },
      });
    }),
  );
});

self.addEventListener("fetch", () => {
  // Il browser continua da solo. Intercettare ogni richiesta blocca l'avvio nell'APK.
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/notifiche", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (list) => {
      for (const client of list) {
        if ("navigate" in client && typeof client.navigate === "function") {
          try {
            await client.navigate(target);
            return client.focus();
          } catch {
            /* apre una finestra nuova */
          }
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
