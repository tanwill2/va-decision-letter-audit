import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Recreate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      // Tell Vite to bundle this HTML page (your React panel)
      input: {
        panel: resolve(__dirname, "panel.html"),
      },
    },
  },
});
