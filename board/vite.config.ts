/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The site's full address, ending in "/", for the link-preview tags in index.html (%VITE_SITE_URL%).
// The GitHub Pages workflow sets it to the Pages address; locally it is the dev server.
process.env.VITE_SITE_URL = (process.env.VITE_SITE_URL || 'http://localhost:5173/').replace(/\/*$/, '/')

// BASE_PATH is set by the GitHub Pages workflow (e.g. /APC-Jira/). Locally the app is served from /.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  build: {
    // The main chunk is ~190 kB gzipped (mostly supabase-js and React); markdown is split out.
    chunkSizeWarningLimit: 700,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
