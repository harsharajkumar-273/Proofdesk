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
    ],
  },

  build: {
    sourcemap: false,
    // Monaco's main-thread bundle (vendor-monaco-core) is irreducibly ~2.5 MB
    // because editor.main.js compiles all language contributions inline — this
    // cannot be split further via manualChunks without forking Monaco itself.
    // Monaco language-server workers (ts.worker ~6 MB, css.worker ~1 MB) are
    // separate files loaded on-demand and do NOT block initial page load.
    // We raise the warning threshold to 3000 kB to suppress false-positive
    // alerts for Monaco's known minimum bundle size while still catching any
    // genuinely oversized application chunks.
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          // ── @monaco-editor/react wrapper (small, but kept separate so it
          //    can be updated independently of the Monaco core bundles) ──────
          if (id.includes('@monaco-editor/react')) {
            return 'vendor-monaco-react';
          }

          if (id.includes('monaco-editor')) {
            // Language-server features: TypeScript, CSS, HTML, JSON intellisense
            // These are the heaviest part — split them out so the editor core
            // can load first and language smarts arrive in a second request.
            if (id.includes('/vs/language/')) {
              return 'vendor-monaco-languages';
            }

            // Syntax-highlighting tokenizers for ~80 grammars (basic-languages)
            if (id.includes('/vs/basic-languages/')) {
              return 'vendor-monaco-basic-langs';
            }

            // Everything else (editor core, workers entry, contributions)
            return 'vendor-monaco-core';
          }

          // Y.js collaboration stack (y-monaco lives here too)
          if (
            id.includes('y-monaco')
            || id.includes('/yjs/')
            || id.includes('/y-protocols/')
            || id.includes('/lib0/')
          ) {
            return 'vendor-collab';
          }

          // React runtime + router
          if (
            id.includes('/react/')
            || id.includes('/react-dom/')
            || id.includes('react-router-dom')
          ) {
            return 'vendor-react';
          }

          // Icon library
          if (id.includes('lucide-react')) {
            return 'vendor-ui';
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
