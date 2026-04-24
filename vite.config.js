import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [
        'rdflib',
        '@inrupt/solid-client',
        '@inrupt/solid-client-authn-browser',
        '@inrupt/vocab-common-rdf',
        'vue',
      ],
    },
    target: 'esnext',
    minify: false,
  },
})
