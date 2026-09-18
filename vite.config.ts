import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const serviceWorkerSource = readFileSync(new URL('./src/service-worker.js', import.meta.url), 'utf8');

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'lens-log-service-worker',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: serviceWorkerSource.replaceAll('__APP_VERSION__', packageJson.version),
        });
      },
    },
  ],
  server: { watch: { useFsEvents: false, usePolling: true } },
});
