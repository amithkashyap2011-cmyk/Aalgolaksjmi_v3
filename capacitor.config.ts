/*
 * ─── Capacitor Configuration ───────────────────────────
 *
 * Wraps the AALGOLAKSHMI V2 Vite build into a native
 * iOS / Android shell.  Run:
 *
 *   npm run build
 *   npx cap add ios        # or android
 *   npx cap sync
 *   npx cap open ios       # opens Xcode
 *
 * Requires: npm i -D @capacitor/core @capacitor/cli
 *           npx cap init AALGOLAKSHMI com.aalgo.v2
 */
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.aalgo.v2",
  appName: "AALGOLAKSHMI V2",
  webDir: "client/dist",
  server: {
    // In development, point Capacitor's WebView at the Vite dev server.
    // Comment this out for production builds.
    // url: "http://192.168.x.x:5173",
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#f7fbfa",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",          // dark icons on light background
      backgroundColor: "#f7fbfa",
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
  ios: {
    contentInset: "always",   // respects safe-area via CSS env()
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
