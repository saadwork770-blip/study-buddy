import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The Android shell.
 *
 * The app is not bundled into the APK: every AI feature runs through this
 * project's own server routes (they hold the Gemini SDK, the provider
 * rotation and the file relay), so there has to be a server. The shell
 * therefore loads the deployed site, which also means the app updates when
 * the site does — no new APK for a fix.
 *
 * STUDY_BUDDY_URL overrides the address at build time, so a fork or a
 * preview deployment can be wrapped without editing this file.
 */
const server = process.env.STUDY_BUDDY_URL?.trim() || "https://study-buddy-rosy-two.vercel.app";

const config: CapacitorConfig = {
  appId: "app.studybuddy.arabic",
  appName: "Study Buddy",
  // Only reached when the device is offline; the live site is the real UI.
  webDir: "native/www",
  android: {
    // Downloads and uploads both need this to behave like a normal browser.
    allowMixedContent: false,
  },
  server: {
    url: server,
    cleartext: false,
    // Anything not on this host opens in the phone's browser rather than
    // inside the app — a Google sign-in page in a bare WebView is a trap.
    allowNavigation: [new URL(server).host],
  },
};

export default config;
