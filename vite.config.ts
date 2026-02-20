import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    watch: {
      ignored: [
        '**/server/db/**',
        '**/*.db',
        '**/*.db-shm',
        '**/*.db-wal',
        '**/public/generated/**',
      ],
    },
    proxy: {
      '/api': 'http://localhost:3001',
      '/generated': 'http://localhost:3001',
    },
  },
})
