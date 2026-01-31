import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
 resolve: {
  alias: {
    '@': '/src',
  },
},

  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'https://book.eshiksavikas.in',
        // target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/public': {
        target: 'https://book.eshiksavikas.in',
        // target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/cover-library': {
        target: 'https://book.eshiksavikas.in',
        // target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
