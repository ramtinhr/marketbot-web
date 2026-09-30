import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs separately (marketbot-api, `npm run dev`, port
// 8080 by default). Proxying it keeps every request same-origin, exactly as it
// is in production behind nginx, so the app never has to know where it lives.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.API_PROXY_TARGET || 'http://127.0.0.1:8080';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true, ws: true },
        '/health': { target, changeOrigin: true },
      },
    },
    preview: {
      port: 4173,
      proxy: {
        '/api': { target, changeOrigin: true, ws: true },
        '/health': { target, changeOrigin: true },
      },
    },
    build: {
      chunkSizeWarningLimit: 1200,
    },
  };
});
