import { useEffect, useMemo, useState } from 'react'

const formatPrice = (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
const initialCustomer = { name: '', email: '', phone: '' }
const initialAddress = { street: '', number: '', complement: '', neighborhood: '', city: '', postalCode: '' }

function getAttempt(fingerprint) {
  try {
    const saved = JSON.parse(sessionStorage.getItem('tillecus-checkout-attempt') || 'null')
    if (saved?.fingerprint === fingerprint && saved.idempotencyKey && saved.orderToken) return saved
  } catch {
    // Discard malformed session data and start a new idempotent attempt.
  }
  const attempt = { fingerprint, idempotencyKey: crypto.randomUUID(), orderToken: crypto.randomUUID() }
  sessionStorage.setItem('tillecus-checkout-attempt', JSON.stringify(attempt))
  return attempt
}

const paymentStatusLabel = {
  checking: 'Consultando o status do pedido…',
  paid: 'Pagamento confirmado pelo Mercado Pago.',
  pending: 'Pagamento pendente. A confirmação será atualizada quando o Mercado Pago notificar o pedido.',
  rejected: 'Pagamento recusado. Você pode tentar novamente pelo checkout seguro.',
  cancelled: 'Pagamento cancelado.',
  expired: 'O prazo do Pix expirou. Retorne ao cardápio e crie um novo pedido.',
  refunded: 'Pagamento estornado.',
  chargeback: 'Pagamento em contestação. Entre em contato com a loja.',
}

function getReturnedOrder() {
  const orderId = new URLSearchParams(window.location.search).get('pedido')
  if (!orderId) return null
  const orderToken = sessionStorage.getItem(`tillecus-order-token:${orderId}`)
  return orderToken ? { orderId, status: 'checking' } : { orderId, status: 'unavailable' }
}

export default function Checkout({ isOpen, onClose, cart, onCartChange, products, backendConfig }) {
  const [customer, setCustomer] = useState(initialCustomer)
  const [fulfillment, setFulfillment] = useState('pickup')
  const [selectedOptions, setSelectedOptions] = useState({})
  const [address, setAddress] = useState(initialAddress)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [error, setError] = useState('')
  const [orderStatus, setOrderStatus] = useState(getReturnedOrder)

  const cartItems = useMemo(() => Object.entries(cart)
    .map(([productId, quantity]) => ({ product: products.find((item) => item.id === productId), quantity }))
    .filter((item) => item.product && item.quantity > 0), [cart, products])
  const subtotalCents = cartItems.reduce((total, item) => total + item.product.priceCents * item.quantity, 0)
  const deliveryFeeCents = fulfillment === 'delivery' ? backendConfig?.delivery?.feeCents || 0 : 0

  useEffect(() => {
    if (!isOpen) return undefined
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    const orderId = new URLSearchParams(window.location.search).get('pedido')
    if (!orderId) return undefined
    const orderToken = sessionStorage.getItem(`tillecus-order-token:${orderId}`)
    if (!orderToken) return undefined

    let active = true
    let timer
    const refreshStatus = async () => {
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
          headers: { 'X-Order-Token': orderToken },
          cache: 'no-store',
        })
        if (!response.ok) throw new Error('Não foi possível consultar o status deste pedido.')
        const result = await response.json()
        if (!active) return
        setOrderStatus(result)
        if (result.status === 'pending') timer = window.setTimeout(refreshStatus, 4000)
      } catch {
        if (active) setOrderStatus({ status: 'unavailable' })
      }
    }
    refreshStatus()
    return () => { active = false; window.clearTimeout(timer) }
  }, [])

  async function submitOrder(event) {
    event.preventDefault()
    setError('')
    if (!backendConfig?.paymentsEnabled) {
      setError('O checkout ainda não está configurado para receber pagamentos. Nenhuma cobrança foi iniciada.')
      return
    }
    if (cartItems.length === 0) {
      setError('Adicione um item ao carrinho antes de continuar.')
      return
    }
    setSubmitting(true)
    const orderPayload = {
      customer,
      items: cartItems.map(({ product, quantity }) => ({ productId: product.id, quantity, option: selectedOptions[product.id] || '' })),
      addons: [],
      fulfillment,
      address: fulfillment === 'delivery' ? address : null,
      notes,
    }
    try {
      const encoded = new TextEncoder().encode(JSON.stringify(orderPayload))
      const digest = await crypto.subtle.digest('SHA-256', encoded)
      const fingerprint = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
      const attempt = getAttempt(fingerprint)
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': attempt.idempotencyKey,
          'X-Order-Token': attempt.orderToken,
        },
        body: JSON.stringify(orderPayload),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error?.message || 'Não foi possível iniciar o pedido.')
      if (!result.checkoutUrl || !/^https:\/\//.test(result.checkoutUrl)) throw new Error('O provedor não retornou um checkout seguro.')
      sessionStorage.setItem(`tillecus-order-token:${result.orderId}`, attempt.orderToken)
      sessionStorage.setItem('tillecus-last-order', result.orderId)
      onCartChange({})
      window.location.assign(result.checkoutUrl)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha de conexão. Tente novamente.')
      setSubmitting(false)
    }
  }

  async function retryPayment() {
    const orderId = orderStatus?.orderId
    const orderToken = orderId && sessionStorage.getItem(`tillecus-order-token:${orderId}`)
    if (!orderId || !orderToken) {
      setError('A sessão segura deste pedido expirou. Faça um novo pedido.')
      return
    }
    setRetrying(true)
    setError('')
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/retry`, {
        method: 'POST',
        headers: { 'X-Order-Token': orderToken },
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error?.message || 'Não foi possível reiniciar o pagamento.')
      if (!result.checkoutUrl || !/^https:\/\//.test(result.checkoutUrl)) throw new Error('O provedor não retornou um checkout seguro.')
      window.location.assign(result.checkoutUrl)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha de conexão. Tente novamente.')
      setRetrying(false)
    }
  }

  function startNewOrder() {
    setOrderStatus(null)
    setError('')
    const url = new URL(window.location.href)
    url.searchParams.delete('pedido')
    window.history.replaceState({}, '', url)
  }

  function updateQuantity(productId, quantity) {
    onCartChange((current) => {
      const next = { ...current }
      if (quantity < 1) delete next[productId]
      else next[productId] = Math.min(quantity, 20)
      return next
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="checkout-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-amber-700/40 bg-[#100600] p-6 text-amber-100 shadow-2xl md:p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 id="checkout-title" className="text-2xl font-bold text-amber-300">Carrinho e checkout</h2>
          <button type="button" onClick={onClose} className="rounded-lg border border-amber-700/50 px-3 py-2 text-sm hover:bg-amber-900/40" aria-label="Fechar checkout">Fechar</button>
        </div>

        {orderStatus ? (
          <div className="space-y-4" aria-live="polite">
            <h3 className="text-xl font-bold">Pedido {orderStatus.orderId ? `#${orderStatus.orderId.slice(0, 8)}` : ''}</h3>
            <p>{paymentStatusLabel[orderStatus.status] || 'Não foi possível consultar o pedido neste navegador.'}</p>
            {orderStatus.totalCents != null && <p className="font-semibold">Total: {formatPrice(orderStatus.totalCents)}</p>}
            {orderStatus.status === 'pending' && <p className="text-sm text-amber-200/60">Esta tela não confirma o pagamento por conta própria. O status só muda após consulta autenticada e notificação do provedor.</p>}
            {orderStatus.checkoutUrl && orderStatus.status === 'pending' && <a href={orderStatus.checkoutUrl} className="inline-flex rounded-lg bg-amber-600 px-5 py-3 font-bold text-white hover:bg-amber-500">Voltar ao pagamento seguro</a>}
            {['rejected', 'cancelled', 'expired'].includes(orderStatus.status) && <button type="button" disabled={retrying} onClick={retryPayment} className="rounded-lg bg-amber-600 px-5 py-3 font-bold text-white hover:bg-amber-500 disabled:opacity-50">{retrying ? 'Preparando nova tentativa…' : 'Tentar pagamento novamente'}</button>}
            <button type="button" onClick={startNewOrder} className="rounded-lg border border-amber-700/50 px-5 py-3 font-bold hover:bg-amber-900/40">Fazer novo pedido</button>
            <button type="button" onClick={onClose} className="rounded-lg bg-amber-600 px-5 py-3 font-bold text-white hover:bg-amber-500">Voltar ao cardápio</button>
          </div>
        ) : (
          <form onSubmit={submitOrder} className="space-y-6">
            <div className="space-y-3 border-b border-amber-900/50 pb-5">
              {cartItems.length === 0 ? <p className="text-amber-200/70">Seu carrinho está vazio.</p> : cartItems.map(({ product, quantity }) => (
                <div key={product.id} className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold">{product.title}</p>
                    <p className="text-sm text-amber-200/60">{formatPrice(product.priceCents)} cada</p>
                    {product.options?.length > 0 && <label className="mt-2 block text-sm">{product.optionLabel}<select required value={selectedOptions[product.id] || ''} onChange={(event) => setSelectedOptions({ ...selectedOptions, [product.id]: event.target.value })} className="mt-1 w-full rounded-lg border border-amber-900/50 bg-[#100600] p-2"><option value="">Selecione</option>{product.options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => updateQuantity(product.id, quantity - 1)} className="h-9 w-9 rounded-lg border border-amber-700/50" aria-label={`Remover uma unidade de ${product.title}`}>−</button>
                    <span className="w-6 text-center">{quantity}</span>
                    <button type="button" onClick={() => updateQuantity(product.id, quantity + 1)} className="h-9 w-9 rounded-lg border border-amber-700/50" aria-label={`Adicionar uma unidade de ${product.title}`}>+</button>
                  </div>
                  <strong className="w-24 text-right">{formatPrice(product.priceCents * quantity)}</strong>
                </div>
              ))}
              <div className="flex justify-between pt-2 font-bold"><span>Subtotal</span><span>{formatPrice(subtotalCents)}</span></div>
            </div>

            <fieldset className="space-y-3">
              <legend className="mb-2 font-bold">Como quer receber?</legend>
              <label className="flex items-center gap-3"><input type="radio" name="fulfillment" value="pickup" checked={fulfillment === 'pickup'} onChange={() => setFulfillment('pickup')} /> Retirar no local</label>
              <label className={`flex items-center gap-3 ${backendConfig?.delivery?.enabled ? '' : 'opacity-50'}`}>
                <input type="radio" name="fulfillment" value="delivery" checked={fulfillment === 'delivery'} disabled={!backendConfig?.delivery?.enabled} onChange={() => setFulfillment('delivery')} />
                Entrega {backendConfig?.delivery?.enabled ? `(${formatPrice(backendConfig.delivery.feeCents)})` : '(indisponível até configurar regiões e taxa)'}
              </label>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm">Nome<input required autoComplete="name" maxLength="120" value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} className="w-full rounded-lg border border-amber-900/50 bg-black/40 p-3 text-base" /></label>
              <label className="space-y-1 text-sm">Telefone<input required type="tel" autoComplete="tel" maxLength="32" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} className="w-full rounded-lg border border-amber-900/50 bg-black/40 p-3 text-base" /></label>
              <label className="space-y-1 text-sm sm:col-span-2">E-mail<input required type="email" autoComplete="email" maxLength="254" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} className="w-full rounded-lg border border-amber-900/50 bg-black/40 p-3 text-base" /></label>
            </div>

            {fulfillment === 'delivery' && (
              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="mb-2 font-bold sm:col-span-2">Endereço de entrega</legend>
                <label className="space-y-1 text-sm sm:col-span-2">Rua<input required maxLength="120" autoComplete="street-address" value={address.street} onChange={(event) => setAddress({ ...address, street: event.target.value })} className="w-full rounded-lg border border-amber-900/50 bg-black/40 p-3 text-base" /></label>
                <label className="space-y-1 text-sm">Número<input required maxLength="20" value={address.number} onChange={(event) => setAddress({ ...address, number: event.target.value })} className="w-full rounded-lg border border-amber-900/50 bg-black/40 p-3 text-base" /></label>
                <label className="space-y-1 text-sm">Complemento<input maxLength="100" value={address.complement} onChange={(event) => setAddress({ ...address, complement: event.target.value })} className="w-full rounded-lg border border-amber-900/50 bg-black/40 p-3 text-base" /></label>
                <label className="space-y-1 text-sm">Bairro<select required value={address.neighborhood} onChange={(event) => {
                  const area = backendConfig.delivery.areas.find((item) => item.neighborhood === event.target.value)
                  setAddress({ ...address, neighborhood: area?.neighborhood || '', city: area?.city || '' })
                }} className="w-full rounded-lg border border-amber-900/50 bg-[#100600] p-3 text-base"><option value="">Selecione</option>{backendConfig.delivery.areas.map((area) => <option key={`${area.city}-${area.neighborhood}`} value={area.neighborhood}>{area.neighborhood} · {area.city}</option>)}</select></label>
                <label className="space-y-1 text-sm">CEP<input required inputMode="numeric" autoComplete="postal-code" maxLength="9" value={address.postalCode} onChange={(event) => setAddress({ ...address, postalCode: event.target.value })} className="w-full rounded-lg border border-amber-900/50 bg-black/40 p-3 text-base" /></label>
              </fieldset>
            )}

            <label className="block space-y-1 text-sm">Observações<textarea maxLength="500" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20 w-full rounded-lg border border-amber-900/50 bg-black/40 p-3 text-base" /></label>
            {fulfillment === 'delivery' && <p className="flex justify-between border-t border-amber-900/50 pt-3 font-bold"><span>Total com entrega</span><span>{formatPrice(subtotalCents + deliveryFeeCents)}</span></p>}
            <p className="text-sm text-amber-200/70">O pagamento será feito no ambiente seguro do Mercado Pago. Escolha Pix, cartão ou boleto entre as opções disponíveis.</p>
            {error && <p role="alert" className="rounded-lg border border-red-800/70 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}
            {!backendConfig?.paymentsEnabled && <p className="rounded-lg border border-amber-800/50 bg-amber-950/30 p-3 text-sm text-amber-200">Checkout indisponível: backend, URL pública e credenciais do provedor ainda precisam ser configurados.</p>}
            <button type="submit" disabled={submitting || cartItems.length === 0 || !backendConfig?.paymentsEnabled} className="w-full rounded-xl bg-amber-600 px-6 py-4 font-bold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? 'Criando pedido…' : `Continuar para pagamento · ${formatPrice(subtotalCents + deliveryFeeCents)}`}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
