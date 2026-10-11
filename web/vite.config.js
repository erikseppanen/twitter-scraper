import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, sign in once through the local preview server
// (node service/preview-knowledge.mjs); the cookie is shared across ports.
const preview = 'http://127.0.0.1:14330';

export default defineConfig({
  base: '/app/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: Object.fromEntries(['/archive', '/api'].map(prefix => [prefix, { target: preview, changeOrigin: true }])),
  },
});
