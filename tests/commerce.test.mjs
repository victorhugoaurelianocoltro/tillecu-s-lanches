import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { ADDONS, PRODUCTS } from '../functions/src/catalog.js'
import {
  buildPreference,
  mapPaymentStatus,
  normalizeOrder,
  shouldApplyPaymentToOrder,
  validateProviderPayment,
  verifyWebhookSignature,
} from '../functions/src/commerce.js'

const baseOrder = {
  customer: { name: 'Cliente Teste', email: 'cliente@example.com', phone: '(11) 99763-7482' },
  items: [{ productId: 'x-tudo', quantity: 2 }],
  fulfillment: 'pickup',
}

test('catálogo tem identificadores e preços únicos em centavos', () => {
  assert.equal(PRODUCTS.length, 36)
  assert.equal(new Set(PRODUCTS.map((product) => product.id)).size, PRODUCTS.length)
  assert.ok(PRODUCTS.every((product) => Number.isSafeInteger(product.priceCents) && product.priceCents > 0))
  assert.deepEqual(ADDONS, [])
})

test('backend calcula preço pelo catálogo e ignora preço informado pelo navegador', () => {
  const order = normalizeOrder({ ...baseOrder, items: [{ productId: 'x-tudo', quantity: 2, unitPriceCents: 1 }] })
  assert.equal(order.totalCents, 5000)
  assert.equal(order.items[0].unitPriceCents, 2500)
})

test('valida opções de sabor e cobertura sem aplicar custo adicional', () => {
  const combo = normalizeOrder({
    ...baseOrder,
    items: [{ productId: 'combo-3', quantity: 1, option: 'Tubaína' }],
  })
  assert.equal(combo.totalCents, 7400)
  assert.equal(combo.items[0].option, 'Tubaína')
  assert.equal(buildPreference(combo, 'order-123', 'https://loja.example', 'https://loja.example/webhook').items[0].title, 'Combo 3 - Tubaína')

  assert.throws(() => normalizeOrder({
    ...baseOrder,
    items: [{ productId: 'combo-3', quantity: 1 }],
  }), { code: 'invalid_options' })
  assert.throws(() => normalizeOrder({
    ...baseOrder,
    items: [{ productId: 'combo-3', quantity: 1, option: 'Morango' }],
  }), { code: 'invalid_options' })
})

test('rejeita IDs desconhecidos, quantidades inválidas e região de entrega não configurada', () => {
  assert.throws(() => normalizeOrder({ ...baseOrder, items: [{ productId: 'inexistente', quantity: 1 }] }), { code: 'invalid_items' })
  assert.throws(() => normalizeOrder({ ...baseOrder, items: [{ productId: 'x-tudo', quantity: 0 }] }), { code: 'invalid_items' })
  assert.throws(() => normalizeOrder({ ...baseOrder, fulfillment: 'delivery' }), { code: 'delivery_not_configured' })
})

test('valida região, endereço e taxa com valores de configuração do servidor', () => {
  const order = normalizeOrder({
    ...baseOrder,
    fulfillment: 'delivery',
    address: { street: 'Rua Exemplo', number: '10', neighborhood: 'Centro', city: 'Jandira', postalCode: '06600000' },
  }, { deliveryFeeCents: 500, deliveryAreas: [{ neighborhood: 'Centro', city: 'Jandira' }] })
  assert.equal(order.totalCents, 5500)
  assert.equal(order.deliveryFeeCents, 500)
  assert.throws(() => normalizeOrder({
    ...baseOrder,
    fulfillment: 'delivery',
    address: { street: 'Rua Exemplo', number: '10', neighborhood: 'Centro', city: 'Jandira', postalCode: '06600000' },
  }, { deliveryFeeCents: 500, deliveryAreas: [{ neighborhood: 'Centro', city: 'Itapevi' }] }), { code: 'invalid_address' })
})

test('preferência envia valor calculado, external reference e URL de webhook', () => {
  const order = normalizeOrder(baseOrder)
  const preference = buildPreference(order, 'order-123', 'https://loja.example', 'https://loja.example/api/webhooks/mercadopago')
  assert.equal(preference.external_reference, 'order-123')
  assert.equal(preference.items[0].unit_price, 25)
  assert.deepEqual(preference.payment_methods, {
    installments: 12,
    excluded_payment_types: [],
    excluded_payment_methods: [],
  })
  assert.equal(preference.purpose, undefined)
  assert.deepEqual(preference.payer.phone, { area_code: '11', number: '997637482' })
  assert.equal(preference.notification_url, 'https://loja.example/api/webhooks/mercadopago')
  assert.match(preference.back_urls.success, /pedido=order-123/)
})

test('webhook só passa com HMAC válido e aceita reenvios legítimos atrasados', () => {
  const secret = 'secret-for-test'
  const requestId = 'req-test'
  const dataId = '123456'
  const ts = Math.floor(Date.now() / 1000).toString()
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex')
  const args = { signature: `ts=${ts},v1=${v1}`, requestId, dataId, secret }
  assert.equal(verifyWebhookSignature(args), true)
  assert.equal(verifyWebhookSignature({ ...args, requestId: 'forged' }), false)
  assert.equal(verifyWebhookSignature({ ...args, signature: `ts=1,v1=${v1}` }), false)
})

test('não aceita pagamento com referência, moeda ou valor diferentes', () => {
  const order = normalizeOrder(baseOrder)
  const paymentOrder = { ...order, paymentPreferenceId: 'preference-123', paymentPreferenceIds: ['preference-123', 'preference-older'] }
  const payment = { external_reference: 'order-123', preference_id: 'preference-123', currency_id: 'BRL', transaction_amount: 50, status: 'approved' }
  assert.equal(validateProviderPayment(payment, paymentOrder, 'order-123'), true)
  assert.equal(validateProviderPayment({ ...payment, transaction_amount: 1 }, paymentOrder, 'order-123'), false)
  assert.equal(validateProviderPayment({ ...payment, currency_id: 'USD' }, paymentOrder, 'order-123'), false)
  assert.equal(validateProviderPayment({ ...payment, preference_id: 'other-preference' }, paymentOrder, 'order-123'), false)
  assert.equal(validateProviderPayment({ ...payment, preference_id: 'preference-older' }, paymentOrder, 'order-123'), true)
  assert.equal(mapPaymentStatus('approved'), 'paid')
  assert.equal(mapPaymentStatus('authorized'), 'pending')
  assert.equal(mapPaymentStatus('in_mediation'), 'pending')
  assert.equal(mapPaymentStatus('rejected'), 'rejected')
  assert.equal(mapPaymentStatus('cancelled', 'expired'), 'expired')
})

test('webhook de tentativa antiga não sobrescreve um retry ativo', () => {
  const order = { paymentPreferenceId: 'new-preference', paymentId: null }
  assert.equal(shouldApplyPaymentToOrder({ id: 'old-payment', preference_id: 'old-preference' }, order, 'rejected'), false)
  assert.equal(shouldApplyPaymentToOrder({ id: 'old-payment', preference_id: 'old-preference' }, order, 'paid'), true)
  assert.equal(shouldApplyPaymentToOrder({ id: 'current-payment', preference_id: 'old-preference' }, { ...order, paymentId: 'current-payment' }, 'refunded'), true)
})
