import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // allowedHosts: true → ให้ Vite dev รับ request จากโดเมน tunnel (cloudflared) ได้ (dev เท่านั้น)
  server: { port: 5173, allowedHosts: true },
});
