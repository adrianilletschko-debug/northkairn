import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `SINGLE=1 npm run build` produces one self-contained dist/index.html (as used for the hosted demo).
export default defineConfig({
  plugins: [react(), tailwindcss(), ...(process.env.SINGLE ? [viteSingleFile()] : [])],
  worker: { format: 'es' },
  build: { target: 'es2020', chunkSizeWarningLimit: 4000 },
});
