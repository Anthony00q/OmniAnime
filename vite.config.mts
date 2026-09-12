import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// https://vitejs.dev/config/
// ESM siempre (.mts): rutas con import.meta.dirname (Node 20.11+).
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-splash-html',
      closeBundle() {
        const src = path.resolve(import.meta.dirname, 'src/renderer/splash.html');
        const dest = path.resolve(import.meta.dirname, 'dist/renderer/splash.html');
        try {
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
          }
        } catch (e) {
          void e;
        }
      },
    },
  ],
  root: path.resolve(import.meta.dirname, 'src/renderer'),
  base: './', // Use relative paths for Electron
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/renderer'),
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](react|react-dom|jotai|@tanstack[\\/]react-query)/,
              priority: 20,
            },
            {
              name: 'ui-vendor',
              test: /node_modules[\\/](lucide-react|sonner|@radix-ui|clsx|tailwind-merge)/,
              priority: 15,
            },
            {
              name: 'vendor',
              test: /node_modules[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src/renderer'),
    },
  },
});
