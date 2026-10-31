import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works on any static host
  // (GitHub Pages project sites, Cloudflare Pages, etc.).
  base: './',
})
