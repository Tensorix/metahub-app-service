import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import tailwindcss from "@tailwindcss/vite"

// Split large vendor dependencies into separate chunks.
// This is the primary defense against rollup OOM during the chunking/rendering
// phase: instead of holding the full module graph in memory for a single giant
// vendor chunk, rollup processes each vendor group incrementally. It also
// improves browser caching in production.
function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return
  // Visualization libraries (large, rarely needed on first paint)
  if (id.includes('node_modules/mermaid/')) return 'mermaid'
  if (id.includes('node_modules/cytoscape')) return 'cytoscape'
  if (id.includes('@shikijs/') || id.includes('node_modules/shiki/')) return 'shiki'
  // UI frameworks
  if (id.includes('@lobehub/')) return 'lobehub'
  if (
    id.includes('node_modules/antd/') ||
    id.includes('@ant-design/') ||
    id.includes('@rc-component/') ||
    id.includes('node_modules/rc-')
  ) return 'antd'
  if (id.includes('@radix-ui/') || id.includes('@base-ui/')) return 'radix'
  // Core React
  if (id.includes('react-router')) return 'react-router'
  if (id.includes('node_modules/react-dom/')) return 'react-dom'
  if (id.includes('node_modules/react/')) return 'react'
  // Emoji & icons
  if (id.includes('@emoji-mart/') || id.includes('node_modules/emoji-mart/')) return 'emoji'
  if (id.includes('lucide-react')) return 'lucide'
  // Editor ecosystem
  if (id.includes('node_modules/motion/') || id.includes('framer-motion')) return 'motion'
  if (id.includes('@xterm/') || id.includes('node_modules/xterm/')) return 'xterm'
  if (
    id.includes('/remark') ||
    id.includes('/rehype') ||
    id.includes('/unified/') ||
    id.includes('/mdast') ||
    id.includes('/micromark')
  ) return 'markdown'
  if (id.includes('@emotion/')) return 'emotion'
  if (id.includes('@dnd-kit/')) return 'dnd-kit'
  if (id.includes('@tanstack/')) return 'tanstack'
  // Date & util libraries
  if (id.includes('date-fns')) return 'date-fns'
  if (id.includes('node_modules/dayjs/')) return 'dayjs'
  if (id.includes('es-toolkit') || id.includes('lodash')) return 'utils'
  return 'vendor'
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isCiMode = mode === 'ci'

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      // Force single instances of shared modules to prevent:
      // "You are loading @emotion/react when it is already loaded"
      // which causes LobeThemeProvider to crash (React hook context mismatch)
      dedupe: ['react', 'react-dom', '@emotion/react', '@emotion/cache', '@emotion/styled'],
    },
    server: {
      proxy: {
        "/api": {
          target: "http://localhost:8000",
          changeOrigin: true,
        },
      },
    },
    build: {
      // Skip extra work that balloons peak memory on constrained CI runners.
      // Source maps in particular are a major contributor to rollup OOM.
      sourcemap: !isCiMode,
      reportCompressedSize: !isCiMode,
      rollupOptions: {
        output: {
          manualChunks,
        },
      },
    },
  }
})
