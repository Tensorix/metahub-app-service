import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import tailwindcss from "@tailwindcss/vite"

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
    build: isCiMode
      ? {
          // Reduce peak memory usage for constrained CI runners.
          minify: false,
          cssMinify: false,
          reportCompressedSize: false,
          sourcemap: false,
        }
      : undefined,
  }
})
