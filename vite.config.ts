import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy charting/d3 + React into cached vendor chunks so the
        // main bundle (app logic) stays lean. (rolldown-vite expects the
        // function form of manualChunks.)
        manualChunks(id: string) {
          if (
            id.includes('recharts') ||
            id.includes('d3-') ||
            id.includes('victory-vendor')
          ) {
            return 'recharts'
          }
          if (id.includes('react-dom') || id.includes('/node_modules/react/')) {
            return 'vendor'
          }
          return undefined
        },
      },
    },
  },
})
