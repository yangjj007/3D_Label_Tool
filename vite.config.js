import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { resolve } from "path";

export default defineConfig(mode => {
  const env = loadEnv(mode.mode, process.cwd());
  const { VITE_APP_BASE_URL, VITE_API_BASE_URL } = env;
  
  // 从API_BASE_URL中提取后端服务器地址
  const apiBaseUrl = VITE_API_BASE_URL || 'http://localhost:10000/api';
  const backendUrl = apiBaseUrl.replace(/\/api$/, '');
  
  return {
    plugins: [vue(), vueJsx()],
    css: {
      preprocessorOptions: {
        scss: {
          api: "modern-compiler" // or 'modern'
        }
      }
    },
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
        vue: "vue/dist/vue.esm-bundler.js"
      }
    },
    assetsInclude: ["**/*.hdr", "**/*.glb"],
    esbuild: { loader: { ".js": ".jsx" } },
    base: VITE_APP_BASE_URL,
    server: {
      host: "0.0.0.0",
      open: true,
      port: 9999,
      proxy: {
        // 代理API请求到后端服务器，避免CORS问题
        '/api': {
          target: backendUrl,
          changeOrigin: true,
          secure: false
        }
      }
    },
    build: {
      outDir: "threejs-3dmodel-edit",
      assetsDir: "static",
      emptyOutDir: true,
      minify: "esbuild",
      rollupOptions: {
        input: {
          index: resolve(__dirname, "index.html"),
          preview: resolve(__dirname, "preview.html"),
          modelIframe: resolve(__dirname, "modelIframe.html"),
          vrPage: resolve(__dirname, "vrPage.html")
        },
        output: {
          compact: true,
          entryFileNames: "static/js/[name]-[hash].js",
          chunkFileNames: "static/js/[name]-[hash].js",
          assetFileNames: "static/[ext]/[name].[ext]"
        }
      }
    }
  };
});
