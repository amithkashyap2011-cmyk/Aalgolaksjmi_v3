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
    port: 9994,
    proxy: {
      '/auth':          { target: backendTarget, changeOrigin: true, bypass: (req) => (req.headers.accept?.includes('text/html') && !req.headers.accept?.includes('application/json')) ? '/index.html' : undefined },
      '/settings':      { target: backendTarget, changeOrigin: true, bypass: (req) => (req.headers.accept?.includes('text/html') && !req.headers.accept?.includes('application/json')) ? '/index.html' : undefined },
      '/apikeys':       { target: backendTarget, changeOrigin: true, bypass: (req) => (req.headers.accept?.includes('text/html') && !req.headers.accept?.includes('application/json')) ? '/index.html' : undefined },
      '/trading':       { target: backendTarget, changeOrigin: true, bypass: (req) => (req.headers.accept?.includes('text/html') && !req.headers.accept?.includes('application/json')) ? '/index.html' : undefined },
      '/backtest':      { target: backendTarget, changeOrigin: true, bypass: (req) => (req.headers.accept?.includes('text/html') && !req.headers.accept?.includes('application/json')) ? '/index.html' : undefined },
      '/agent':         { target: backendTarget, changeOrigin: true, bypass: (req) => (req.headers.accept?.includes('text/html') && !req.headers.accept?.includes('application/json')) ? '/index.html' : undefined },
      '/wallet':        { target: backendTarget, changeOrigin: true, bypass: (req) => (req.headers.accept?.includes('text/html') && !req.headers.accept?.includes('application/json')) ? '/index.html' : undefined },
      '/models':        { target: backendTarget, changeOrigin: true, bypass: (req) => (req.headers.accept?.includes('text/html') && !req.headers.accept?.includes('application/json')) ? '/index.html' : undefined },
      '/platform':      { target: backendTarget, changeOrigin: true, bypass: (req) => (req.headers.accept?.includes('text/html') && !req.headers.accept?.includes('application/json')) ? '/index.html' : undefined },
      '/ai-timeline':   { target: backendTarget, changeOrigin: true, bypass: (req) => (req.headers.accept?.includes('text/html') && !req.headers.accept?.includes('application/json')) ? '/index.html' : undefined },
      '/system':        { target: backendTarget, changeOrigin: true, bypass: (req) => (req.headers.accept?.includes('text/html') && !req.headers.accept?.includes('application/json')) ? '/index.html' : undefined },
      '/health':        { target: backendTarget, changeOrigin: true, bypass: (req) => (req.headers.accept?.includes('text/html') && !req.headers.accept?.includes('application/json')) ? '/index.html' : undefined },
      '/indian-market': { target: backendTarget, changeOrigin: true, bypass: (req) => (req.headers.accept?.includes('text/html') && !req.headers.accept?.includes('application/json')) ? '/index.html' : undefined },
      '/api':           { target: backendTarget, changeOrigin: true },
      '/aqea-ui':       { target: backendTarget, changeOrigin: true, bypass: (req) => (req.headers.accept?.includes('text/html') && !req.headers.accept?.includes('application/json')) ? '/index.html' : undefined },
      '/socket.io':     { target: backendTarget, changeOrigin: true, ws: true },
    },
  },
});
