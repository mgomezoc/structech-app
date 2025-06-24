import { resolve } from "path";
import { defineConfig } from "vite";
import handlebars from "vite-plugin-handlebars";

export default defineConfig({
  root: "src",
  base: "/",
  build: {
    outDir: "../www",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "src/index.html"),
      },
    },
    //assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 3000,
    open: true,
    host: true,
  },
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
      },
    },
  },
  assetsInclude: ["**/*.hbs"],
  plugins: [handlebars({})],
  optimizeDeps: {
    include: [
      "@lordicon/element", // obliga a Vite a pre-compilarlo
      "lottie-web",
    ],
  },
  resolve: {
    alias: {
      "@": "/src",
      "@services": "/src/services",
      "@views": "/src/views",
      "@routes": "/src/routes",
      "@utils": "/src/utils",
      "@img": "/src/img",
      "@css": "/src/css",
      "@js": "/src/js",
    },
  },
});
