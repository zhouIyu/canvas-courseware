import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@canvas-courseware/core": fileURLToPath(
        new URL("../../packages/core/src/index.ts", import.meta.url),
      ),
      "@canvas-courseware/fabric": fileURLToPath(
        new URL("../../packages/fabric/src/index.ts", import.meta.url),
      ),
      "@canvas-courseware/vue": fileURLToPath(
        new URL("../../packages/vue/src/index.ts", import.meta.url),
      ),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 32173,
    strictPort: true,
  },
});
