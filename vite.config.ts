import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Same-origin path under which the CalDAV server is reachable (see .env).
  const davBase = env.VITE_DAV_BASE || '/dav'
  // Where the dev proxy forwards CalDAV requests (local Radicale from docker-compose.dev.yml).
  const davTarget = env.DAV_PROXY_TARGET || 'http://localhost:5232'

  return {
    plugins: [vue(), vueDevTools(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        [davBase]: {
          target: davTarget,
          changeOrigin: true,
          rewrite: (path) => path.slice(davBase.length) || '/',
          configure: (proxy) => {
            // Radicale uses X-Script-Name to prefix the hrefs it returns, so that
            // collection and item URLs stay under /dav on the client side.
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('X-Script-Name', davBase)
            })
          },
        },
      },
    },
  }
})
