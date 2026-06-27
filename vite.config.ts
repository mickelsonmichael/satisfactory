import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  base: process.env.VITE_BASE_URL ?? '/',
  plugins: [
    react(),
    nodePolyfills({ include: ['buffer', 'process'] }),
  ],
  optimizeDeps: {
    include: ['@etothepii/satisfactory-file-parser'],
  },
});
