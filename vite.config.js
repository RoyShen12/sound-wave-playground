import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        mic: resolve(__dirname, 'MIC.html')
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
})
