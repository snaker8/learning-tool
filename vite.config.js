import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, cpSync } from 'fs'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Firebase Hosting requires absolute paths; Electron needs relative paths
  const isElectron = mode === 'electron';
  const base = isElectron ? './' : '/';

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        // Copy pdfjs assets (worker, CMap, fonts) to dist/ for production
        name: 'copy-pdfjs-assets',
        closeBundle() {
          try {
            copyFileSync(
              resolve('node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
              resolve('dist/pdf.worker.min.mjs')
            );
            cpSync(
              resolve('node_modules/pdfjs-dist/cmaps'),
              resolve('dist/cmaps'),
              { recursive: true }
            );
            cpSync(
              resolve('node_modules/pdfjs-dist/standard_fonts'),
              resolve('dist/standard_fonts'),
              { recursive: true }
            );
          } catch (e) {
            console.warn('Could not copy pdfjs assets:', e.message);
          }
        }
      }
    ],
    base,
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 3000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('pdfjs-dist')) return 'pdfjs';
            if (id.includes('node_modules')) return 'vendor';
          }
        }
      }
    }
  };
})
