import { defineConfig } from 'vite'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { env } from 'node:process'
import { PRODUCTS } from './functions/src/catalog.js'
import { CommerceError, normalizeOrder } from './functions/src/commerce.js'

const projectId = env.VITE_FIREBASE_PROJECT_ID || env.GCLOUD_PROJECT
const basePath = env.GITHUB_PAGES === 'true' ? '/tillecu-s-lanches/' : '/'
const apiProxyTarget = env.VITE_API_PROXY_TARGET || (projectId
  ? `http://127.0.0.1:5001/${projectId}/southamerica-east1/api`
  : null)

const localPaymentSimulation = {
  name: 'local-payment-simulation',
  configureServer(server) {
    if (apiProxyTarget) return
    const orders = new Map()

    server.middlewares.use('/api', async (request, response) => {
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.setHeader('Cache-Control', 'no-store')
      const pathname = new URL(request.url || '/', 'http://localhost').pathname
      const send = (status, body) => {
        response.statusCode = status
        response.end(JSON.stringify(body))
      }
      const readBody = async () => {
        const chunks = []
        let size = 0
        for await (const chunk of request) {
          size += chunk.length
          if (size > 1024 * 1024) throw new CommerceError(413, 'request_too_large', 'Pedido muito grande.')
          chunks.push(chunk)
        }
        try {
          return JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch {
          throw new CommerceError(400, 'invalid_request', 'Não foi possível ler os dados do pedido.')
        }
      }

      try {
        if (request.method === 'GET' && pathname === '/catalog') {
          return send(200, {
            currency: 'BRL',
            paymentsEnabled: true,
            paymentMode: 'simulation',
            paymentMethods: ['simulation'],
            delivery: { enabled: true, simulation: true, allowAnyAddress: true, feeCents: 0, areas: [] },
            products: PRODUCTS.map(({ id, title, priceCents, category }) => ({ id, title, priceCents, category })),
          })
        }

        if (request.method === 'POST' && pathname === '/orders') {
          const payload = await readBody()
          const isDelivery = payload.fulfillment === 'delivery'
          let order = normalizeOrder(isDelivery ? { ...payload, fulfillment: 'pickup', address: null } : payload)
          if (isDelivery) {
            const candidate = payload.address || {}
            const address = {
              street: String(candidate.street || '').trim().slice(0, 120),
              number: String(candidate.number || '').trim().slice(0, 20),
              complement: String(candidate.complement || '').trim().slice(0, 100),
              neighborhood: String(candidate.neighborhood || '').trim().slice(0, 100),
              city: String(candidate.city || '').trim().slice(0, 100),
              state: String(candidate.state || '').trim().toUpperCase().slice(0, 2),
              postalCode: String(candidate.postalCode || '').replace(/\D/g, '').slice(0, 8),
            }
            if (address.street.length < 3 || !address.number || !address.neighborhood || !address.city || !/^[A-Z]{2}$/.test(address.state) || address.postalCode.length !== 8) {
              throw new CommerceError(400, 'invalid_address', 'Preencha rua, número, bairro, cidade, UF e CEP válidos para a simulação de entrega.')
            }
            order = { ...order, fulfillment: 'delivery', address, deliveryFeeCents: 0, totalCents: order.subtotalCents }
          }
          const token = String(request.headers['x-order-token'] || '')
          if (!token) throw new CommerceError(400, 'missing_order_token', 'Recarregue a página e tente novamente.')
          const orderId = randomUUID()
          orders.set(orderId, { order, token, status: 'simulation' })
          return send(201, { orderId, status: 'simulation', totalCents: order.totalCents, currency: 'BRL', fulfillment: order.fulfillment, address: order.address, simulation: true })
        }

        const orderRoute = pathname.match(/^\/orders\/([0-9a-f-]{36})(?:\/(simulate))?$/i)
        if (orderRoute) {
          const [, orderId, action] = orderRoute
          const saved = orders.get(orderId)
          const token = String(request.headers['x-order-token'] || '')
          if (!saved || !token || token !== saved.token) {
            throw new CommerceError(404, 'order_not_found', 'Pedido não encontrado nesta sessão de demonstração.')
          }
          if (request.method === 'POST' && action === 'simulate') {
            const { outcome } = await readBody()
            if (!['paid', 'rejected', 'pending'].includes(outcome)) {
              throw new CommerceError(400, 'invalid_simulation_outcome', 'Selecione um resultado de simulação válido.')
            }
            saved.status = outcome
          } else if (request.method !== 'GET' || action) {
            throw new CommerceError(404, 'not_found', 'Rota de demonstração não encontrada.')
          }
          return send(200, {
            orderId,
            status: saved.status,
            totalCents: saved.order.totalCents,
            currency: 'BRL',
            fulfillment: saved.order.fulfillment,
            address: saved.order.address,
            simulation: true,
          })
        }

        return send(404, { error: { code: 'not_found', message: 'Rota de demonstração não encontrada.' } })
      } catch (error) {
        const status = error instanceof CommerceError ? error.status : 500
        return send(status, {
          error: {
            code: error.code || 'simulation_error',
            message: error.message || 'Não foi possível concluir a simulação.',
          },
        })
      }
    })
    console.info('Modo de pagamento simulado ativo: somente local, sem cobrança real.')
  },
}

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss(), localPaymentSimulation],
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('three') || id.includes('@react-three')) return 'three'
          if (id.includes('gsap')) return 'gsap'
          if (id.includes('react')) return 'react'
        },
      },
    },
  },
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
