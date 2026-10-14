import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// dev:web (scripts/dev-web.js) passa porta fixa e token por env; o proxy injeta o token,
// então o browser nunca o vê. No Tauri o token vem do invoke("api_info").
const { PORT, PATCHBAY_TOKEN } = process.env;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    proxy: PATCHBAY_TOKEN
      ? {
          "/api": {
            target: `http://127.0.0.1:${PORT}`,
            changeOrigin: true,
            ws: true, // WS /realtime: o header do token também vai no upgrade
            rewrite: (path) => path.replace(/^\/api/, ""),
            headers: { "x-session-token": PATCHBAY_TOKEN },
          },
        }
      : undefined,
  },
});
