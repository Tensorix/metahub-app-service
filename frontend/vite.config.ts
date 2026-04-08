import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import tailwindcss from "@tailwindcss/vite"

// Minimal `manualChunks`: ONLY split shiki's per-language/theme data files.
//
// WHY NOTHING ELSE IS SPLIT:
// Rollup chunk boundaries are not transparent. Any library that relies on
// one of the patterns below breaks when split across chunks:
//   1. ESM circular deps (antd ↔ @rc-component, @emotion internals, react
//      ↔ scheduler) → "Cannot access 'X' before initialization" / TDZ
//   2. CJS UMD wrappers (cytoscape plugins: layout-base, cose-base,
//      cytoscape-cose-bilkent; older mermaid deps) → "Cannot set
//      properties of undefined (setting 'exports')"
//   3. React 19 internal scheduler handoff → "Cannot set properties of
//      undefined (setting 'unstable_now')"
// Shiki's `@shikijs/langs/dist/*.mjs` and `@shikijs/themes/dist/*.mjs` files
// are pure ESM data with zero cross-imports, so they are the ONLY splits
// that are safe AND actually reduce rollup's peak rendering memory.
function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return
  // Shiki langs: one chunk per language so rollup renders + serializes +
  // GCs each tiny file independently instead of holding a ~10 MB monolith
  // in memory for the whole rendering phase. This is the main CI OOM fix.
  if (id.includes('@shikijs/langs')) {
    const match = id.match(/@shikijs\/langs\/dist\/([^./]+)/)
    return match ? `shiki-lang-${match[1]}` : 'shiki-langs'
  }
  if (id.includes('@shikijs/themes')) {
    const match = id.match(/@shikijs\/themes\/dist\/([^./]+)/)
    return match ? `shiki-theme-${match[1]}` : 'shiki-themes'
  }
  if (id.includes('@shikijs/') || id.includes('node_modules/shiki/')) return 'shiki-core'
  // Everything else: let rollup decide. Do NOT add more groupings here
  // unless you've verified the library has zero cross-imports into the
  // rest of the vendor graph AND ships pure ESM.
  return undefined
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
      // We already split the biggest offenders by hand; silence the noisy
      // warning so CI logs stay focused on real issues.
      chunkSizeWarningLimit: 2048,
      rollupOptions: {
        // `safest` mode does less module graph analysis, which trades a tiny
        // amount of dead-code elimination for significantly lower peak memory
        // during rendering — a good deal on memory-constrained CI.
        treeshake: isCiMode ? 'safest' : 'recommended',
        output: {
          manualChunks,
        },
      },
    },
  }
})
