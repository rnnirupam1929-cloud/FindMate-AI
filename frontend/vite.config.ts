import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  server: { port: 5173, proxy: { "/api": { target: process.env.VITE_API_PROXY ?? "http://127.0.0.1:8000", changeOrigin: true } } },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test/setup.ts"], exclude: ["e2e/**", "node_modules/**"] },
});
