/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:9991';

const apiProxy = {
  target: backendTarget,
  changeOrigin: true,
  bypass: (req: any) => {
    const accept = req.headers?.accept || '';
    const dest = req.headers?.['sec-fetch-dest'] || '';
    if (accept.includes('text/html') || dest === 'document') {
      return '/index.html';
    }
  },
};

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/__tests__/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
  server: {
    host: '0.0.0.0',
    port: 9994,
    proxy: {
      '/auth':          apiProxy,
      '/settings/':     apiProxy,
      '/apikeys':       apiProxy,
      '/trading':       apiProxy,
      '/backtest/':     apiProxy,
      '/agent':         apiProxy,
      '/wallet/':       apiProxy,
      '/models':        apiProxy,
      '/platform':      apiProxy,
      '/ai-timeline':   apiProxy,
      '/system':        apiProxy,
      '/health':        apiProxy,
      '/api':           apiProxy,
      '/aqea-ui':       apiProxy,
      '/socket.io':     { target: backendTarget, changeOrigin: true, ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('highcharts')) {
              return 'vendor-highcharts';
            }
            if (id.includes('bootstrap') || id.includes('@popperjs')) {
              return 'vendor-bootstrap';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-lucide';
            }
            return 'vendor-core';
          }
        },
      },
    },
  },
});
