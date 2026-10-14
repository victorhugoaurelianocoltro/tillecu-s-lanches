import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { getApp, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { defineSecret, defineString } from 'firebase-functions/params'
import { onRequest } from 'firebase-functions/v2/https'
import { PRODUCTS } from './catalog.js'
import {
  buildPreference,
  CommerceError,
  mapPaymentStatus,
  normalizeOrder,
  shouldApplyPaymentToOrder,
  validateProviderPayment,
  verifyWebhookSignature,
} from './commerce.js'

const region = 'southamerica-east1'
const siteUrlParam = defineString('PUBLIC_SITE_URL', { default: '' })
const deliveryFeeParam = defineString('DELIVERY_FEE_CENTS', { default: '' })
const deliveryAreasParam = defineString('DELIVERY_AREAS_JSON', { default: '[]' })
const mercadoPagoAccessToken = defineSecret('MERCADOPAGO_ACCESS_TOKEN')
const mercadoPagoWebhookSecret = defineSecret('MERCADOPAGO_WEBHOOK_SECRET')

if (getApps().length === 0) initializeApp()
const db = getFirestore(getApp())

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const secretValue = (secret) => {
  try { return secret.value() } catch { return '' }
}
const toSafeEqual = (left, right) => {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}
const isMercadoPagoCheckoutUrl = (value) => {
  try {
    return ['mercadopago.com.br', 'www.mercadopago.com.br', 'sandbox.mercadopago.com.br'].includes(new URL(value).hostname)
  } catch {
    return false
  }
}

function getConfig() {
  let deliveryAreas = []
  try {
    const parsed = JSON.parse(deliveryAreasParam.value() || '[]')
    if (Array.isArray(parsed)) deliveryAreas = parsed
  } catch {
    deliveryAreas = []
  }
  const rawFee = deliveryFeeParam.value()
  const deliveryFeeCents = /^\d+$/.test(rawFee) ? Number(rawFee) : null
  const siteUrl = siteUrlParam.value().replace(/\/$/, '')
  const validSiteUrl = (() => {
    try { return new URL(siteUrl).protocol === 'https:' } catch { return false }
  })()
  const paymentsEnabled = Boolean(secretValue(mercadoPagoAccessToken) && secretValue(mercadoPagoWebhookSecret) && validSiteUrl)
  return { deliveryAreas, deliveryFeeCents, siteUrl, paymentsEnabled }
}

function sendError(res, error) {
  const status = error instanceof CommerceError ? error.status : 500
  const code = error instanceof CommerceError ? error.code : 'internal_error'
  const message = error instanceof CommerceError ? error.message : 'Não foi possível processar agora. Tente novamente.'
  if (status >= 500) console.error('API request failed', { code, message: error.message })
  return res.status(status).json({ error: { code, message } })
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) } catch { return null }
  }
  return null
}

function publicOrder(orderId, order) {
  return {
    orderId,
    status: order.status,
    paymentStatus: order.paymentStatus,
    totalCents: order.totalCents,
    currency: order.currency,
    createdAt: order.createdAt?.toDate?.().toISOString() || null,
  }
}

async function createCheckout({ orderId, orderRef, config }) {
  const claim = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef)
    if (!snapshot.exists) throw new CommerceError(404, 'order_not_found', 'Pedido não encontrado.')
    const saved = snapshot.data()
    if (saved.status === 'paid') throw new CommerceError(409, 'order_already_paid', 'Este pedido já foi pago e não pode gerar outra cobrança.')
    if (saved.status === 'pending' && saved.checkoutUrl) return { existingUrl: saved.checkoutUrl }
    if (saved.preferenceStatus === 'creating' && Date.now() - (saved.preferenceLeaseAt?.toMillis?.() || Date.now()) < 120000) {
      throw new CommerceError(409, 'checkout_initializing', 'O pagamento está sendo preparado. Aguarde alguns segundos e tente novamente.')
    }

    const attempt = (saved.preferenceAttempt || 0) + 1
    const update = {
      status: 'pending',
      paymentStatus: 'pending',
      paymentId: null,
      paymentPreferenceId: null,
      checkoutUrl: null,
      preferenceStatus: 'creating',
      preferenceAttempt: attempt,
      preferenceLeaseAt: new Date(),
      updatedAt: FieldValue.serverTimestamp(),
    }
    if (saved.paymentId) update.paymentIds = FieldValue.arrayUnion(String(saved.paymentId))
    transaction.update(orderRef, update)
    return { existingUrl: null, attempt, order: saved }
  })

  if (claim.existingUrl) return { checkoutUrl: claim.existingUrl, reused: true }

  let providerResponse
  try {
    const webhookUrl = `${config.siteUrl}/api/webhooks/mercadopago`
    const preference = buildPreference(claim.order, orderId, config.siteUrl, webhookUrl)
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretValue(mercadoPagoAccessToken)}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `${orderId}-${claim.attempt}`,
      },
      body: JSON.stringify(preference),
      signal: AbortSignal.timeout(12000),
    })
    const payload = await response.json()
    if (!response.ok) {
      console.error('Mercado Pago preference rejected', { status: response.status, cause: payload?.message || payload?.error })
      throw new CommerceError(502, 'payment_provider_error', 'O provedor não conseguiu iniciar o pagamento. Tente novamente.')
    }
    providerResponse = payload
  } catch (error) {
    await orderRef.update({ preferenceStatus: 'failed', updatedAt: FieldValue.serverTimestamp() })
    throw error instanceof CommerceError ? error : new CommerceError(502, 'payment_provider_unavailable', 'Não foi possível conectar ao provedor de pagamento. Tente novamente.')
  }

  const checkoutUrl = secretValue(mercadoPagoAccessToken).startsWith('TEST-')
    ? providerResponse.sandbox_init_point
    : providerResponse.init_point
  if (!providerResponse.id || !isMercadoPagoCheckoutUrl(checkoutUrl)) {
    await orderRef.update({ preferenceStatus: 'failed', updatedAt: FieldValue.serverTimestamp() })
    throw new CommerceError(502, 'invalid_provider_response', 'O provedor retornou um link de pagamento inválido.')
  }
  await orderRef.update({
    paymentPreferenceId: String(providerResponse.id),
    paymentPreferenceIds: FieldValue.arrayUnion(String(providerResponse.id)),
    checkoutUrl,
    preferenceStatus: 'ready',
    updatedAt: FieldValue.serverTimestamp(),
  })
  return { checkoutUrl, reused: false }
}

async function applyPayment(payment) {
  const orderId = String(payment.external_reference || '')
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return false
  const orderRef = db.collection('orders').doc(orderId)
  const paymentRef = db.collection('payments').doc(String(payment.id))

  await db.runTransaction(async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef)
    if (!orderSnapshot.exists) return
    const order = orderSnapshot.data()
    const paymentStatus = mapPaymentStatus(payment.status, payment.status_detail)
    const currentPaymentId = order.paymentId || null
    if (!shouldApplyPaymentToOrder(payment, order, paymentStatus)) {
      transaction.set(paymentRef, {
        orderId,
        status: paymentStatus,
        statusDetail: payment.status_detail || null,
        amountCents: Math.round(Number(payment.transaction_amount) * 100),
        currency: payment.currency_id,
        paymentMethod: payment.payment_method_id || null,
        staleForCurrentOrder: true,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      return
    }
    if (currentPaymentId && currentPaymentId !== String(payment.id) && order.status === 'paid') {
      transaction.set(paymentRef, {
        orderId,
        status: paymentStatus,
        statusDetail: payment.status_detail || null,
        amountCents: Math.round(Number(payment.transaction_amount) * 100),
        currency: payment.currency_id,
        paymentMethod: payment.payment_method_id || null,
        duplicateForPaidOrder: true,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      transaction.update(orderRef, {
        duplicatePaymentReview: true,
        duplicatePaymentIds: FieldValue.arrayUnion(String(payment.id)),
        updatedAt: FieldValue.serverTimestamp(),
      })
      return
    }

    const nextOrderStatus = order.status === 'paid' && !['refunded', 'chargeback'].includes(paymentStatus)
      ? 'paid'
      : paymentStatus
    transaction.set(paymentRef, {
      orderId,
      status: paymentStatus,
      statusDetail: payment.status_detail || null,
      amountCents: Math.round(Number(payment.transaction_amount) * 100),
      currency: payment.currency_id,
      paymentMethod: payment.payment_method_id || null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    transaction.update(orderRef, {
      status: nextOrderStatus,
      paymentStatus,
      paymentStatusDetail: payment.status_detail || null,
      paymentId: String(payment.id),
      paymentMethod: payment.payment_method_id || null,
      paymentUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  })
  return true
}

export const api = onRequest({
  region,
  maxInstances: 10,
  timeoutSeconds: 30,
  secrets: [mercadoPagoAccessToken, mercadoPagoWebhookSecret],
}, async (req, res) => {
  res.set('Cache-Control', 'no-store')
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('Referrer-Policy', 'no-referrer')

  try {
    const path = (req.path.replace(/^\/api(?=\/|$)/, '').replace(/\/+$/, '') || '/')
    if (req.method === 'GET' && path === '/catalog') {
      const config = getConfig()
      return res.json({
        currency: 'BRL',
        paymentsEnabled: config.paymentsEnabled,
        paymentMethods: config.paymentsEnabled ? ['pix', 'card', 'boleto'] : [],
        delivery: {
          enabled: Number.isSafeInteger(config.deliveryFeeCents) && config.deliveryAreas.length > 0,
          feeCents: config.deliveryFeeCents,
          areas: config.deliveryAreas,
        },
        products: PRODUCTS.map(({ id, title, priceCents, category }) => ({ id, title, priceCents, category })),
      })
    }

    if (req.method === 'POST' && path === '/orders') {
      const config = getConfig()
      if (!config.paymentsEnabled) {
        throw new CommerceError(503, 'payments_not_configured', 'O pagamento ainda não está configurado para este site.')
      }
      const idempotencyKey = req.get('x-idempotency-key') || ''
      const orderToken = req.get('x-order-token') || ''
      if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey) || !/^[0-9a-f-]{36}$/i.test(orderToken)) {
        throw new CommerceError(400, 'invalid_request_tokens', 'Não foi possível identificar esta tentativa. Recarregue o checkout e tente novamente.')
      }

      const order = normalizeOrder(parseBody(req), config)
      const requestHash = sha256(JSON.stringify(order))
      const tokenHash = sha256(orderToken)
      const idempotencyRef = db.collection('orderRequests').doc(sha256(idempotencyKey))
      const orderId = randomUUID()
      const orderRef = db.collection('orders').doc(orderId)
      const clientIp = String(req.ip || 'unknown').slice(0, 100)
      const hour = new Date().toISOString().slice(0, 13)
      const rateRef = db.collection('orderRateLimits').doc(sha256(`${clientIp}:${hour}`))

      const result = await db.runTransaction(async (transaction) => {
        const idempotencySnapshot = await transaction.get(idempotencyRef)
        if (idempotencySnapshot.exists) {
          const saved = idempotencySnapshot.data()
          if (saved.requestHash !== requestHash || !toSafeEqual(saved.clientTokenHash, tokenHash)) {
            throw new CommerceError(409, 'idempotency_conflict', 'Esta chave já foi usada para outro pedido.')
          }
          const savedOrderRef = db.collection('orders').doc(saved.orderId)
          const savedOrderSnapshot = await transaction.get(savedOrderRef)
          if (!savedOrderSnapshot.exists) throw new CommerceError(500, 'order_not_found', 'Não foi possível recuperar o pedido.')
          const existingOrder = savedOrderSnapshot.data()
          if (existingOrder.status === 'paid') throw new CommerceError(409, 'order_already_paid', 'Este pedido já foi pago e não pode gerar outra cobrança.')
          return { id: saved.orderId, ref: savedOrderRef, data: existingOrder }
        }

        const rateSnapshot = await transaction.get(rateRef)
        const currentCount = rateSnapshot.exists ? rateSnapshot.data().count || 0 : 0
        if (currentCount >= 10) throw new CommerceError(429, 'rate_limited', 'Muitas tentativas. Aguarde e tente novamente.')
        const savedOrder = {
          ...order,
          status: 'pending',
          paymentStatus: 'pending',
          paymentId: null,
          paymentPreferenceId: null,
          checkoutUrl: null,
          preferenceStatus: 'new',
          preferenceAttempt: 0,
          clientTokenHash: tokenHash,
          requestHash,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }
        transaction.create(orderRef, savedOrder)
        transaction.create(idempotencyRef, {
          orderId,
          requestHash,
          clientTokenHash: tokenHash,
          createdAt: FieldValue.serverTimestamp(),
        })
        transaction.set(rateRef, { count: currentCount + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        return { id: orderId, ref: orderRef, data: savedOrder }
      })

      const checkout = await createCheckout({ orderId: result.id, orderRef: result.ref, config })
      return res.status(checkout.reused ? 200 : 201).json({
        ...publicOrder(result.id, result.data),
        checkoutUrl: checkout.checkoutUrl,
      })
    }

    if (req.method === 'GET' && path.startsWith('/orders/')) {
      const orderId = path.slice('/orders/'.length)
      if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new CommerceError(404, 'order_not_found', 'Pedido não encontrado.')
      const orderToken = req.get('x-order-token') || ''
      const snapshot = await db.collection('orders').doc(orderId).get()
      if (!snapshot.exists) throw new CommerceError(404, 'order_not_found', 'Pedido não encontrado.')
      const order = snapshot.data()
      if (!orderToken || !toSafeEqual(order.clientTokenHash || '', sha256(orderToken))) {
        throw new CommerceError(404, 'order_not_found', 'Pedido não encontrado.')
      }
      return res.json({
        ...publicOrder(orderId, order),
        checkoutUrl: order.status === 'pending' ? order.checkoutUrl : null,
      })
    }

    if (req.method === 'POST' && path.startsWith('/orders/') && path.endsWith('/retry')) {
      const orderId = path.slice('/orders/'.length, -'/retry'.length)
      if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new CommerceError(404, 'order_not_found', 'Pedido não encontrado.')
      const orderToken = req.get('x-order-token') || ''
      const snapshot = await db.collection('orders').doc(orderId).get()
      if (!snapshot.exists) throw new CommerceError(404, 'order_not_found', 'Pedido não encontrado.')
      const order = snapshot.data()
      if (!orderToken || !toSafeEqual(order.clientTokenHash || '', sha256(orderToken))) {
        throw new CommerceError(404, 'order_not_found', 'Pedido não encontrado.')
      }
      if (order.status === 'pending' && order.checkoutUrl) {
        return res.status(200).json({ ...publicOrder(orderId, order), checkoutUrl: order.checkoutUrl })
      }
      if (!['rejected', 'cancelled', 'expired'].includes(order.status)) {
        throw new CommerceError(409, 'retry_not_available', 'Só é possível tentar novamente após uma recusa, cancelamento ou expiração.')
      }
      const config = getConfig()
      if (!config.paymentsEnabled) throw new CommerceError(503, 'payments_not_configured', 'O pagamento ainda não está configurado para este site.')
      const checkout = await createCheckout({ orderId, orderRef: snapshot.ref, config })
      return res.status(201).json({ ...publicOrder(orderId, order), checkoutUrl: checkout.checkoutUrl })
    }

    if (req.method === 'POST' && path === '/webhooks/mercadopago') {
      const body = parseBody(req) || {}
      const dataId = String(req.query['data.id'] || body.data?.id || '')
      const type = String(req.query.type || body.type || '')
      if (type !== 'payment') return res.status(200).json({ received: true, ignored: true })
      if (!verifyWebhookSignature({
        signature: req.get('x-signature'),
        requestId: req.get('x-request-id'),
        dataId,
        secret: secretValue(mercadoPagoWebhookSecret),
      })) {
        throw new CommerceError(401, 'invalid_webhook_signature', 'Assinatura da notificação inválida.')
      }
      if (!/^\d+$/.test(dataId)) throw new CommerceError(400, 'invalid_payment_id', 'Identificador de pagamento inválido.')
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, {
        headers: { Authorization: `Bearer ${secretValue(mercadoPagoAccessToken)}` },
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) throw new CommerceError(503, 'payment_lookup_failed', 'Não foi possível confirmar o pagamento com o provedor.')
      const payment = await response.json()
      const orderId = String(payment.external_reference || '')
      const orderSnapshot = await db.collection('orders').doc(orderId).get()
      if (!orderSnapshot.exists || !validateProviderPayment(payment, orderSnapshot.data(), orderId)) {
        throw new CommerceError(400, 'payment_mismatch', 'O pagamento não corresponde ao pedido.')
      }
      await applyPayment(payment)
      return res.status(200).json({ received: true })
    }

    return res.status(404).json({ error: { code: 'not_found', message: 'Rota não encontrada.' } })
  } catch (error) {
    return sendError(res, error)
  }
})
