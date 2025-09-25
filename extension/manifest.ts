// extension/manifest.ts
import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "VA Decision Letter Audit",
  version: "0.1.0",
  description: "Reads VA decision letters and produces a plain-English summary.",

  // icons: {
  //   "16": "extension/assets/icon16.png",
  //   "48": "extension/assets/icon48.png",
  //   "128": "extension/assets/icon128.png",
  // },

  // ▶ Popup UI (no more side panel)
  action: {
    default_title: "VA Decision Letter Audit",
    default_popup: "popup.html",
  },

  // no host permissions, no content scripts for popup-only flow
  permissions: [],
});
