import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// base: '/ikorka-packaging/' matches GitHub Pages project-site hosting
// (lyizacarenko-spec.github.io/ikorka-packaging). Rename here + in the
// gh-pages script if the repo gets a different name.
export default defineConfig({
  plugins: [react()],
  base: '/ikorka-packaging/',
})
