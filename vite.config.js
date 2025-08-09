// vite.config.js
import { resolve as r } from 'path';
import { defineConfig, loadEnv } from 'vite';
import handlebars from 'vite-plugin-handlebars';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProd = env.VITE_ENV === 'production';

  return {
    root: 'src',
    // 👇 clave para iOS/WKWebView: rutas relativas en el build
    base: './',

    build: {
      outDir: '../www',
      emptyOutDir: true,
      // 👇 objetivo más seguro para Safari/WKWebView
      target: ['es2019', 'safari15'],
      // 👇 garantiza polyfill de modulepreload en Safari
      modulePreload: { polyfill: true },
      cssCodeSplit: true,
      sourcemap: !isProd, // solo en dev
      minify: isProd ? 'esbuild' : false, // minifica solo prod
      rollupOptions: {
        input: {
          main: r(__dirname, 'src/index.html'),
        },
        treeshake: isProd,
      },
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

    assetsInclude: ['**/*.hbs'],
    plugins: [handlebars({})],

    optimizeDeps: {
      include: ['@lordicon/element', 'lottie-web'],
      // 👇 target de esbuild también en el servidor de dev
      esbuildOptions: { target: 'es2019' },
    },

    resolve: {
      alias: {
        '@': r(__dirname, 'src'),
        '@services': r(__dirname, 'src/services'),
        '@views': r(__dirname, 'src/views'),
        '@routes': r(__dirname, 'src/routes'),
        '@utils': r(__dirname, 'src/utils'),
        '@img': r(__dirname, 'src/img'),
        '@css': r(__dirname, 'src/css'),
        '@js': r(__dirname, 'src/js'),
      },
    },
  };
});
