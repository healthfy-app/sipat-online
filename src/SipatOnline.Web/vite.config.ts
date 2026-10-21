import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    basicSsl({ domains: ['localhost', '*.localhost'] }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['localhost', '.localhost'],
    proxy: {
      '/api': {
        target: process.env.SIPAT_API_TARGET ?? 'http://localhost:8080',
        changeOrigin: false,
        secure: false,
        configure(proxy) {
          proxy.on('proxyReq', (proxyRequest) => {
            proxyRequest.setHeader('X-Forwarded-Proto', 'https');
          });
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
});
