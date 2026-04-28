import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./lib/migrate-bookings"; // Enable booking debug tools

createRoot(document.getElementById("root")!).render(<App />);
