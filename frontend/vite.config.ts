import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    port: 3000,
    host: 'localhost',
    // Pre-transform lazy-loaded pages so Vite never triggers a mid-request
    // dependency re-optimisation (which causes "Failed to fetch dynamically
    // imported module" when the user first navigates to the editor).
    warmup: {
      clientFiles: [
        './src/components/EditorPage.tsx',
        './src/components/RepoInputPage.tsx',
        './src/components/ProfessorDashboardPage.tsx',
        './src/components/GitPanel.tsx',
        './src/components/Terminal.tsx',
      ],
    },
  },

  // Pre-bundle every heavy dependency that only EditorPage needs so that Vite
  // does not discover them lazily (which would restart optimisation and abort
  // the in-flight lazy import, producing the "Failed to fetch dynamically
  // imported module" crash in the browser).
  optimizeDeps: {
    include: [
      '@monaco-editor/react',
      'y-monaco',
      'yjs',
      'y-protocols/awareness',
      'lib0/encoding',
      'lib0/decoding',
      '@xterm/xterm',
      '@xterm/addon-fit',
    ],
  },

  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 850,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (
            id.includes('@monaco-editor')
            || id.includes('monaco-editor')
            || id.includes('y-monaco')
          ) {
            // Keep Monaco in one stable bundle. The more aggressive split
            // looked smaller on paper but produced runtime initialization
            // order errors in production preview/e2e.
            return 'vendor-editor'
          }

          if (
            id.includes('@xterm')
            || id.includes('/xterm/')
            || id.includes('xterm-addon')
          ) {
            return 'vendor-terminal'
          }

          if (
            id.includes('/yjs/')
            || id.includes('/y-protocols/')
            || id.includes('/lib0/')
          ) {
            return 'vendor-collab'
          }

          if (
            id.includes('/react/')
            || id.includes('/react-dom/')
            || id.includes('react-router-dom')
          ) {
            return 'vendor-react'
          }

          if (id.includes('lucide-react')) {
            return 'vendor-ui'
          }
        },
      },
    },
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
})
