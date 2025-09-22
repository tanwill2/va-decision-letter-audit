import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "VA Decision Letter Audit (MVP)",
  version: "0.1.0",
  description: "Plain-English summary of VA decision letters. Not legal advice.",
  action: { default_title: "VA Decision Letter Audit" },
  permissions: ["activeTab", "scripting", "storage", "downloads"],
  host_permissions: [
    "*://*.va.gov/*",
    "*://*/*.pdf",
    "*://*.googleusercontent.com/*",
    "*://drive.google.com/*",
    "<all_urls>"
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
