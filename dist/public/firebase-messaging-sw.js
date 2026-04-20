/**
 * Firebase Cloud Messaging Service Worker
 *
 * This file MUST live at the root of the public folder so it controls
 * the full origin scope (/). The Firebase config values below are the
 * PUBLIC (non-secret) client-side config — safe to commit.
 *
 * Replace the placeholder values below with your actual Firebase config
 * once you have created a Firebase project.
 */

// PLACEHOLDER — replace with your Firebase config values
const FIREBASE_CONFIG = {
  apiKey:            "__FIREBASE_API_KEY__",
  authDomain:        "__FIREBASE_AUTH_DOMAIN__",
  projectId:         "__FIREBASE_PROJECT_ID__",
  storageBucket:     "__FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId:             "__FIREBASE_APP_ID__",
};

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp(FIREBASE_CONFIG);
const messaging = firebase.messaging();

// Handle background messages (when the app tab is not focused)
messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-sw] Background message received:", payload);

  const { title, body, icon, image } = payload.notification || {};
  const clickUrl = payload.data?.url || "/";

  self.registration.showNotification(title || "WanderWay", {
    body:  body  || "You have a new notification",
    icon:  icon  || "/favicon.svg",
    badge: "/favicon.svg",
    image: image || undefined,
    data:  { url: clickUrl },
    actions: [{ action: "open", title: "View" }],
    requireInteraction: false,
    vibrate: [200, 100, 200],
  });
});

// Open the app when notification is clicked
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
