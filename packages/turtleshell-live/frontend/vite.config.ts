import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }
          if (
            id.includes('/node_modules/d3-') ||
            id.includes('/node_modules/victory-vendor/') ||
            id.includes('/node_modules/lodash')
          ) {
            return 'vendor-charts-deps';
          }
          if (id.includes('/node_modules/recharts/')) {
            return 'vendor-recharts';
          }
          if (id.includes('/node_modules/zustand/') || id.includes('/node_modules/lenis/')) {
            return 'vendor-state';
          }
        },
      },
    },
  },
});
