import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Deployed under krewesuite.noitgroup.com/app/kreweconnect/
export default defineConfig({
  plugins: [react()],
  base: "/app/kreweconnect/",
  server: {
    // Local dev: proxy API calls to the Functions host (`func start` in api/)
    proxy: {
      "/api": "http://localhost:7071",
    },
  },
  build: {
    // Production source maps were how the source was exposed publicly
    // (and later recovered). Keep them off for deployed builds.
    sourcemap: false,
  },
});
