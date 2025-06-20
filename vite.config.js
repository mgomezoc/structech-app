import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  base: "/",
  build: {
    outDir: "../www",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/index.html",
    },
    // Optimización de assets
    assetsInlineLimit: 4096, // Archivos menores a 4kb se incrustan como base64
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 3000,
    open: true, // Abre el navegador automáticamente
    host: true, // Permite acceso desde tu red local
  },
  css: {
    preprocessorOptions: {
      less: {
        // Opciones de LESS si las necesitas
        javascriptEnabled: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": "/src",
      "@img": "/src/img",
      "@css": "/src/css",
      "@js": "/src/js",
    },
  },
});
