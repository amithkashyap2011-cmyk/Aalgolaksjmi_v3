/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:9991';

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
    port: 9996,
    proxy: {
      '/auth':          { target: backendTarget, changeOrigin: true },
      '/settings':      { target: backendTarget, changeOrigin: true },
      '/apikeys':       { target: backendTarget, changeOrigin: true },
      '/trading':       { target: backendTarget, changeOrigin: true },
      '/backtest':      { target: backendTarget, changeOrigin: true },
      '/agent':         { target: backendTarget, changeOrigin: true },
      '/wallet':        { target: backendTarget, changeOrigin: true },
      '/models':        { target: backendTarget, changeOrigin: true },
      '/platform':      { target: backendTarget, changeOrigin: true },
      '/ai-timeline':   { target: backendTarget, changeOrigin: true },
      '/system':        { target: backendTarget, changeOrigin: true },
      '/health':        { target: backendTarget, changeOrigin: true },
      '/indian-market': { target: backendTarget, changeOrigin: true },
      '/api':           { target: backendTarget, changeOrigin: true },
      '/aqea-ui':       { target: backendTarget, changeOrigin: true },
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
