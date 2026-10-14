import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { ADDONS, PRODUCT_BY_ID } from './catalog.js'

export class CommerceError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

const text = (value, maxLength) => typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
const normalizedArea = (value) => text(value, 100).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')

export function normalizeOrder(body, config = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new CommerceError(400, 'invalid_order', 'Dados do pedido inválidos.')
  }

  const customer = body.customer || {}
  const name = text(customer.name, 120)
  const email = text(customer.email, 254).toLowerCase()
  const phone = text(customer.phone, 32)
  const phoneDigits = phone.replace(/\D/g, '')
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phoneDigits.length < 10 || phoneDigits.length > 13) {
    throw new CommerceError(400, 'invalid_customer', 'Informe nome, e-mail e telefone válidos.')
  }

  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 36) {
    throw new CommerceError(400, 'invalid_items', 'Adicione ao menos um item ao pedido.')
  }

  const quantities = new Map()
  for (const item of body.items) {
    const product = PRODUCT_BY_ID.get(item?.productId)
    const quantity = Number(item?.quantity)
    const option = text(item?.option, 80)
    if (!product || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new CommerceError(400, 'invalid_items', 'Um item ou quantidade do pedido é inválido.')
    }
    if (product.options?.length && !product.options.includes(option)) {
      throw new CommerceError(400, 'invalid_options', `Selecione ${product.optionLabel.toLocaleLowerCase('pt-BR')} para ${product.title}.`)
    }
    if (!product.options?.length && option) {
      throw new CommerceError(400, 'invalid_options', `A opção enviada para ${product.title} não está disponível.`)
    }
    const key = `${product.id}:${option}`
    quantities.set(key, { productId: product.id, quantity: (quantities.get(key)?.quantity || 0) + quantity, option: option || null })
    if (quantities.get(key).quantity > 20) {
      throw new CommerceError(400, 'invalid_items', 'A quantidade máxima por produto é 20.')
    }
  }

  const addons = Array.isArray(body.addons) ? body.addons : []
  if (addons.length > 0) {
    for (const addon of addons) {
      if (!ADDONS.some((knownAddon) => knownAddon.id === addon?.addonId)) {
        throw new CommerceError(400, 'invalid_addons', 'Um adicional selecionado não está disponível.')
      }
    }
  }

  const items = [...quantities.values()].map(({ productId, quantity, option }) => {
    const product = PRODUCT_BY_ID.get(productId)
    return { productId, title: product.title, quantity, option, unitPriceCents: product.priceCents }
  })
  let subtotalCents = items.reduce((total, item) => total + item.unitPriceCents * item.quantity, 0)
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 1 || subtotalCents > 10000000) {
    throw new CommerceError(400, 'invalid_total', 'O valor total do pedido é inválido.')
  }

  const fulfillment = body.fulfillment
  if (!['pickup', 'delivery'].includes(fulfillment)) {
    throw new CommerceError(400, 'invalid_fulfillment', 'Selecione retirada ou entrega.')
  }

  let address = null
  let deliveryFeeCents = 0
  if (fulfillment === 'delivery') {
    if (!Number.isSafeInteger(config.deliveryFeeCents) || !Array.isArray(config.deliveryAreas) || config.deliveryAreas.length === 0) {
      throw new CommerceError(503, 'delivery_not_configured', 'A entrega ainda não está configurada. Selecione retirada ou tente novamente mais tarde.')
    }
    const candidate = body.address || {}
    const neighborhood = text(candidate.neighborhood, 100)
    const city = text(candidate.city, 100)
    const validArea = config.deliveryAreas.some((area) => normalizedArea(area.neighborhood) === normalizedArea(neighborhood) && normalizedArea(area.city) === normalizedArea(city))
    const street = text(candidate.street, 120)
    const number = text(candidate.number, 20)
    const postalCode = text(candidate.postalCode, 16).replace(/\D/g, '')
    if (!validArea || street.length < 3 || !number || postalCode.length !== 8) {
      throw new CommerceError(400, 'invalid_address', 'Informe endereço, CEP e uma região atendida.')
    }
    address = {
      street,
      number,
      complement: text(candidate.complement, 100),
      neighborhood,
      city,
      postalCode,
    }
    deliveryFeeCents = config.deliveryFeeCents
  }

  subtotalCents += deliveryFeeCents
  const notes = text(body.notes, 500)
  return {
    customer: { name, email, phone: phoneDigits },
    items,
    fulfillment,
    address,
    notes,
    subtotalCents: subtotalCents - deliveryFeeCents,
    deliveryFeeCents,
    totalCents: subtotalCents,
    currency: 'BRL',
  }
}

export function buildPreference(order, orderId, siteUrl, webhookUrl) {
  let phone = order.customer.phone
  if (phone.startsWith('55') && [12, 13].includes(phone.length)) phone = phone.slice(2)
  const items = order.items.map((item) => ({
    id: item.productId,
    title: item.option ? `${item.title} - ${item.option}` : item.title,
    quantity: item.quantity,
    currency_id: 'BRL',
    unit_price: item.unitPriceCents / 100,
  }))
  if (order.deliveryFeeCents > 0) {
    items.push({ id: 'delivery-fee', title: 'Taxa de entrega', quantity: 1, currency_id: 'BRL', unit_price: order.deliveryFeeCents / 100 })
  }

  const returnUrl = new URL('/', siteUrl)
  returnUrl.searchParams.set('pedido', orderId)
  const payload = {
    items,
    payer: {
      name: order.customer.name,
      email: order.customer.email,
      phone: { area_code: phone.slice(0, 2), number: phone.slice(2) },
    },
    external_reference: orderId,
    statement_descriptor: 'TILLECUS LANCHES',
    back_urls: {
      success: returnUrl.toString(),
      pending: returnUrl.toString(),
      failure: returnUrl.toString(),
    },
    auto_return: 'approved',
    notification_url: webhookUrl,
    metadata: { order_id: orderId },
    payment_methods: {
      installments: 12,
      excluded_payment_types: [],
      excluded_payment_methods: [],
    },
  }
  return payload
}

export function verifyWebhookSignature({ signature, requestId, dataId, secret }) {
  if (!signature || !requestId || !dataId || !secret) return false
  const fields = Object.fromEntries(signature.split(',').map((part) => {
    const [key, ...value] = part.trim().split('=')
    return [key, value.join('=')]
  }))
  if (!fields.v1 || !/^\d+$/.test(fields.ts || '')) return false
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${fields.ts};`
  const expected = createHmac('sha256', secret).update(manifest).digest()
  let received
  try {
    received = Buffer.from(fields.v1, 'hex')
  } catch {
    return false
  }
  return received.length === expected.length && timingSafeEqual(received, expected)
}

export function validateProviderPayment(payment, order, orderId) {
  if (!payment || String(payment.external_reference) !== orderId || payment.currency_id !== 'BRL') return false
  const preferenceIds = order.paymentPreferenceIds || [order.paymentPreferenceId]
  if (!preferenceIds.includes(String(payment.preference_id))) return false
  if (!Number.isFinite(Number(payment.transaction_amount)) || Math.round(Number(payment.transaction_amount) * 100) !== order.totalCents) return false
  return ['approved', 'authorized', 'pending', 'in_process', 'in_mediation', 'rejected', 'cancelled', 'refunded', 'charged_back'].includes(payment.status)
}

export function mapPaymentStatus(status, statusDetail = '') {
  if (status === 'cancelled' && statusDetail === 'expired') return 'expired'
  return ({
    approved: 'paid',
    authorized: 'pending',
    pending: 'pending',
    in_process: 'pending',
    in_mediation: 'pending',
    rejected: 'rejected',
    cancelled: 'cancelled',
    expired: 'expired',
    refunded: 'refunded',
    charged_back: 'chargeback',
  })[status] || 'pending'
}

export function shouldApplyPaymentToOrder(payment, order, paymentStatus) {
  const isCurrentPreference = String(payment.preference_id) === String(order.paymentPreferenceId)
  const isCurrentPayment = String(payment.id) === String(order.paymentId)
  return paymentStatus === 'paid' || isCurrentPreference || isCurrentPayment
}
