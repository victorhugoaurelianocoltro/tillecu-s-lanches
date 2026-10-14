import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { env } from 'node:process'

const projectId = env.VITE_FIREBASE_PROJECT_ID || env.GCLOUD_PROJECT
const apiProxyTarget = env.VITE_API_PROXY_TARGET || (projectId
  ? `http://127.0.0.1:5001/${projectId}/southamerica-east1/api`
  : null)

const commerceApiFallback = {
  name: 'commerce-api-unconfigured',
  configureServer(server) {
    if (apiProxyTarget) return
    server.middlewares.use('/api', (_request, response) => {
      response.statusCode = 503
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(JSON.stringify({
        error: {
          code: 'local_backend_unconfigured',
          message: 'Backend local não configurado. Inicie o Firebase Emulator ou defina VITE_API_PROXY_TARGET.',
        },
      }))
    })
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss(), commerceApiFallback],
  server: {
    proxy: apiProxyTarget ? {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api(?=\/|$)/, ''),
      },
    } : {},
  },
})
