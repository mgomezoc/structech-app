import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  base: "./",
  build: {
    outDir: "../www",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/index.html",
    },
  },
});
