import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works on any static host
  // (GitHub Pages project sites, Cloudflare Pages, etc.).
  base: './',
  // Always the same port: the browser stores saved sessions per origin (including the
  // port), so a different port would look like all your sessions were gone. strictPort
  // fails loudly if it's taken instead of silently moving to the next port.
  server: { port: 5173, strictPort: true },
})
