import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./lib/migrate-bookings"; // Enable booking debug tools

// Unregister any leftover service workers (e.g. old MSW registration)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((reg) => {
      reg.unregister();
      console.info("[sw] Unregistered stale service worker:", reg.scope);
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
