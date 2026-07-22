import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Прокси на бэкенд: фронт ходит на свой origin, CORS не нужен
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
