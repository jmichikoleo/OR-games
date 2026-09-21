import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset paths, so the build works unchanged whether it is served
  // from a domain root or from /<repo>/ on GitHub Pages. The router is hash
  // based, so there are no path routes to rewrite either.
  base: './',
  server: { port: 5173 },
  build: { target: 'es2022' },
})
