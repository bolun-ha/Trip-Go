import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), cloudflare()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY || env.GEMINI_API_KEY),
      'process.env.VITE_AMAP_API_KEY': JSON.stringify(process.env.VITE_AMAP_API_KEY || env.VITE_AMAP_API_KEY),
      'process.env.VITE_AMAP_SECURITY_CODE': JSON.stringify(process.env.VITE_AMAP_SECURITY_CODE || env.VITE_AMAP_SECURITY_CODE),
      'process.env.VITE_AMAP_REST_API_KEY': JSON.stringify(process.env.VITE_AMAP_REST_API_KEY || env.VITE_AMAP_REST_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Proxy API requests through dev server to bypass network restrictions
      proxy: {
        '/api/deepseek': {
          target: 'https://api.deepseek.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/deepseek/, ''),
        },
      },
    },
  };
});