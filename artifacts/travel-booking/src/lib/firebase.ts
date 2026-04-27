/**
 * Firebase client-side SDK
 *
 * Config values come from environment variables (Vite exposes VITE_* vars at build time).
 * Set these in your environment secrets:
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_STORAGE_BUCKET
 *   VITE_FIREBASE_MESSAGING_SENDER_ID
 *   VITE_FIREBASE_APP_ID
 *   VITE_FIREBASE_VAPID_KEY
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, onMessage, type Messaging } from "firebase/messaging";
import { APP_NAME } from "@/lib/app-config";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || "",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || "",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || "",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || "",
};

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || "";

export const isFirebaseConfigured = (): boolean =>
  !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && VAPID_KEY);

let app: FirebaseApp | null   = null;
let messaging: Messaging | null = null;

function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (!app) {
    const existing = getApps();
    app = existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
  }
  return app;
}

function getFirebaseMessaging(): Messaging | null {
  if (!("serviceWorker" in navigator)) return null;
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!messaging) {
    try {
      messaging = getMessaging(firebaseApp);
    } catch {
      return null;
    }
  }
  return messaging;
}

// ── Permission & Token ────────────────────────────────────────────────────────

export async function requestPermissionAndGetToken(): Promise<string | null> {
  if (!isFirebaseConfigured()) {
    console.info("[firebase] Not configured — skipping push setup");
    return null;
  }

  if (!("Notification" in window)) {
    console.info("[firebase] Browser does not support notifications");
    return null;
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    console.info("[firebase] Notification permission denied");
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const msg = getFirebaseMessaging();
    if (!msg) return null;

    const token = await getToken(msg, {
      vapidKey:            VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    console.info("[firebase] FCM token obtained ✓");
    return token || null;
  } catch (err: any) {
    console.warn("[firebase] Token error:", err.message);
    return null;
  }
}

export function listenForForegroundMessages(
  callback: (payload: { title: string; body: string; url?: string }) => void,
): (() => void) | null {
  const msg = getFirebaseMessaging();
  if (!msg) return null;

  const unsubscribe = onMessage(msg, (payload) => {
    const n = payload.notification;
    callback({
      title: n?.title || APP_NAME,
      body:  n?.body  || "You have a new update",
      url:   (payload.data as any)?.url,
    });
  });

  return unsubscribe;
}
