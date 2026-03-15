/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
    port: 5173,
    proxy: {
      '/auth':    { target: 'http://localhost:5050', changeOrigin: true },
      '/settings':{ target: 'http://localhost:5050', changeOrigin: true },
      '/apikeys': { target: 'http://localhost:5050', changeOrigin: true },
      '/trading': { target: 'http://localhost:5050', changeOrigin: true },
      '/backtest':{ target: 'http://localhost:5050', changeOrigin: true },
      '/agent':   { target: 'http://localhost:5050', changeOrigin: true },
      '/wallet':  { target: 'http://localhost:5050', changeOrigin: true },
      '/health':  { target: 'http://localhost:5050', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:5050', changeOrigin: true, ws: true },
    },
  },
});
