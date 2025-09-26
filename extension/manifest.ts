// extension/manifest.ts
import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "VA Decision Letter Summary",
  version: "0.1.0",
  description: "Reads VA decision letters and produces a plain-English summary.",

    icons: {
      "16": "assets/icons/icon16.png",
      "48": "assets/icons/icon48.png",
      "128": "assets/icons/icon128.png",
    },


  // ▶ Popup UI (no more side panel)
  action: {
    default_title: "VA Decision Letter Summary",
    default_popup: "popup.html",
  },
  
  // Optional: shows on your Web Store listing
  homepage_url: "https://kairobox.com",

  // no host permissions, no content scripts for popup-only flow
  permissions: [],
});
