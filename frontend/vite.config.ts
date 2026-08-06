import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5222,
  },
  optimizeDeps: {
    include: ['pixi.js', 'pixi-live2d-display/cubism4'],
  },
})
