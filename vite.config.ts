import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { copyFileSync } from 'fs'

export default defineConfig({
  plugins: [
    preact(),
    {
      name: 'copy-manifest',
      writeBundle() {
        copyFileSync('manifest.json', 'dist/manifest.json')
      }
    }
  ],
  build: {
    rollupOptions: {
      input: {
        popup: 'popup.html',
        content: 'src/content.ts'
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    },
    outDir: 'dist'
  }
})