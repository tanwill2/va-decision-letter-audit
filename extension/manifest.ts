import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "VA Decision Letter Audit (MVP)",
  version: "0.1.0",
  description: "Plain-English summary of VA decision letters. Not legal advice.",
  // icons for the extension
  icons: {
    16: "icons/icon16.png",
    48: "icons/icon48.png",
    128: "icons/icon128.png",
  },
  action: {
    default_title: "VA Decision Letter Audit",
    default_icon: {
      16: "icons/icon16.png",
      48: "icons/icon48.png",
      128: "icons/icon128.png",
    },
  },
  permissions: ["activeTab", "scripting", "storage", "downloads"],
  // keep minimal host permissions; request others at runtime
  host_permissions: [
    "*://*.va.gov/*",
    "*://*/*.pdf"
  ],
  optional_host_permissions: [
    "<all_urls>",           // we’ll request origin-specific permission when importing a URL
  ],
  background: { service_worker: "src/background.ts", type: "module" },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content.ts"],
      run_at: "document_idle"
    }
  ],
  web_accessible_resources: [
  { resources: ["panel.html", "assets/*", "pdf.worker.min.mjs", "ocr/*"], matches: ["<all_urls>"] }
  ],
});
