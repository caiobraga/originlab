// import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc"; // Removido temporariamente devido a conflito com Vite 7
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "path";
import { defineConfig, loadEnv } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
import { apiPlugin } from "./vite-plugin-api";

const plugins = [react(), tailwindcss(), /* jsxLocPlugin(), */ vitePluginManusRuntime(), apiPlugin()];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(import.meta.dirname), "");
  const supabaseUrl = env.VITE_SUPABASE_URL;

  return {
  plugins,
  optimizeDeps: {
    exclude: ["pdf-parse", "pdfjs-dist"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: false, // Will find next available port if 3000 is busy
    host: true,
    proxy: supabaseUrl
      ? {
          "/supabase-proxy": {
            target: supabaseUrl,
            changeOrigin: true,
            secure: true,
            rewrite: (path) => path.replace(/^\/supabase-proxy/, ""),
          },
        }
      : undefined,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    hmr: {
      overlay: false, // Desabilitar overlay de erro temporariamente
    },
  },
};
});
