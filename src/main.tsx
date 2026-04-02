// src/main.tsx
// UPDATED: Added ErrorBoundary to catch and handle app crashes
import {} from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { Capacitor } from "@capacitor/core";
import { defineCustomElements } from "@ionic/pwa-elements/loader";
import "./auction-room.css";

// Initialize PWA Elements ONLY on web platform (not on native iOS/Android)
// This allows native camera to work on mobile devices
if (Capacitor.getPlatform() === "web") {
  defineCustomElements(window);
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
