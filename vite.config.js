import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` -> regular static site in dist/
// `npm run build:single` -> one self-contained HTML file in dist-single/
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' || mode === 'artifact' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'single' ? 'dist-single' : mode === 'artifact' ? 'dist-artifact' : 'dist',
    chunkSizeWarningLimit: 1500,
  },
  server: { host: true },
}));
