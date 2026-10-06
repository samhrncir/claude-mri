import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The web app lives in src/web and is emitted to dist/web, next to dist/server which serves it.
export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        // Keep the graph library and the markdown renderer in their own chunks.
        manualChunks(id: string) {
          if (id.includes('node_modules/@xyflow/')) return 'xyflow'
          if (id.includes('node_modules/marked/') || id.includes('node_modules/dompurify/')) return 'markdown'
          return undefined
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4848',
        changeOrigin: false,
      },
    },
  },
})
