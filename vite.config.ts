import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';

  return {
    plugins: [
      wasm(),
      topLevelAwait(),
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." still resolve in production builds.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) return;
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, { recursive: true, force: true });
          }
        },
      },
      // Copy Draco and KTX2/Basis decoders to dist/ for GLTFLoader
      {
        name: 'copy-wasm-decoders',
        apply: 'build',
        closeBundle(): void {
          const distDir = path.resolve(__dirname, 'dist');
          if (!fs.existsSync(distDir)) return;

          // Copy draco decoders
          const dracoSrc = path.resolve(__dirname, 'node_modules/three/examples/jsm/libs/draco');
          const dracoDest = path.resolve(distDir, 'draco');
          if (fs.existsSync(dracoSrc)) {
            fs.cpSync(dracoSrc, dracoDest, { recursive: true, force: true });
          }

          // Copy basis universal transcoder
          const basisSrc = path.resolve(__dirname, 'node_modules/three/examples/jsm/libs/basis');
          const basisDest = path.resolve(distDir, 'basis');
          if (fs.existsSync(basisSrc)) {
            fs.cpSync(basisSrc, basisDest, { recursive: true, force: true });
          }
        },
      },
      // Cloudflare Workers/Pages compatibility: remove Node.js builtins from bundles
      isProduction && {
        name: 'cloudflare-compat',
        enforce: 'post',
        generateBundle(_options: unknown, bundle: Record<string, { type: string; code?: string }>) {
          for (const [, chunk] of Object.entries(bundle)) {
            if (chunk.type === 'chunk' && chunk.code) {
              // Replace Node.js fs/path requires with empty objects
              chunk.code = chunk.code
                .replace(/require\(["']fs["']\)/g, '({})')
                .replace(/require\(["']path["']\)/g, '({})')
                .replace(/require\(["']crypto["']\)/g, '({})')
                .replace(/require\(["']stream["']\)/g, '({})')
                .replace(/require\(["']buffer["']\)/g, '({})')
                .replace(/require\(["']util["']\)/g, '({})');
            }
          }
        },
      },
    ].filter(Boolean),
    worker: {
      format: 'es',
      plugins: () => [wasm()],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      target: 'esnext',
      minify: 'esbuild',
      cssCodeSplit: true,
      modulePreload: { polyfill: false },
      rollupOptions: {
        output: {
          format: 'es',
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
          manualChunks(id: string) {
            // React ecosystem
            if (
              id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/scheduler')
            ) {
              return 'react-vendor';
            }
            // Three.js core
            if (id.includes('node_modules/three')) {
              return 'three-vendor';
            }
            // AI/GenAI
            if (id.includes('node_modules/@google/genai')) {
              return 'ai-vendor';
            }
            // UI libraries
            if (id.includes('node_modules/lucide-react') || id.includes('node_modules/motion')) {
              return 'ui-vendor';
            }
            // Export utilities
            if (id.includes('node_modules/fflate')) {
              return 'export-vendor';
            }
            // WASM/Rust
            if (
              id.includes('wasm-core') ||
              id.includes('src/wasm') ||
              id.includes('wasm-bindgen') ||
              id.includes('src/workers/wasm.worker')
            ) {
              return 'wasm-vendor';
            }
            // Rust engine services
            if (id.includes('src/services/rustEngine')) {
              return 'wasm-vendor';
            }
          },
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});