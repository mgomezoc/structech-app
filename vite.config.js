// vite.config.js
import { resolve } from 'path';
import { defineConfig, loadEnv } from 'vite';
import handlebars from 'vite-plugin-handlebars';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProd = env.VITE_ENV === 'production';

  return {
    root: 'src',
    base: '/',
    build: {
      outDir: '../www',
      emptyOutDir: true,
      target: 'es2017',
      cssCodeSplit: true,
      sourcemap: !isProd, // ✅ habilitar sólo en desarrollo
      minify: isProd ? 'esbuild' : false, // ✅ solo minifica en producción
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/index.html'),
        },
        treeshake: isProd, // ✅ eliminar código no usado en producción
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
    },
    resolve: {
      alias: {
        '@': '/src',
        '@services': '/src/services',
        '@views': '/src/views',
        '@routes': '/src/routes',
        '@utils': '/src/utils',
        '@img': '/src/img',
        '@css': '/src/css',
        '@js': '/src/js',
      },
    },
  };
});
