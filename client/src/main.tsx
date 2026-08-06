import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import "./styles/index.css";
import "./styles/modern.css";
import "./styles/ui-modern-patch.css";
import "./styles/design-tokens.css"; // canonical tokens + hardening
import "./styles/responsive.css";    // responsive hardening — must load last
import { registerSW } from "./lib/registerSW";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

/* Register service worker for PWA install support */
registerSW();
