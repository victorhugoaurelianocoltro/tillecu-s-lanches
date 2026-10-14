import { useEffect, useMemo, useState } from 'react'

const formatPrice = (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
const initialCustomer = { name: '', email: '', phone: '' }
const initialAddress = { street: '', number: '', complement: '', neighborhood: '', city: '', state: '', postalCode: '' }

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

const simulationStatusLabel = {
  simulation: 'Pedido fictício criado. Escolha abaixo o resultado da simulação.',
  paid: 'Resultado simulado: pagamento aprovado.',
  pending: 'Resultado simulado: pagamento pendente.',
  rejected: 'Resultado simulado: pagamento recusado.',
}

function getReturnedOrder() {
  const orderId = new URLSearchParams(window.location.search).get('pedido')
  if (!orderId) return null
  const orderToken = sessionStorage.getItem(`tillecus-order-token:${orderId}`)
  return orderToken ? { orderId, status: 'checking' } : { orderId, status: 'unavailable' }
}

export default function Checkout({ isOpen, onClose, cart, onCartChange, products, backendConfig, backendError = '', backendLoading = false }) {
  const [customer, setCustomer] = useState(initialCustomer)
  const [fulfillment, setFulfillment] = useState('pickup')
  const [selectedOptions, setSelectedOptions] = useState({})
  const [address, setAddress] = useState(initialAddress)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [simulationLoading, setSimulationLoading] = useState(false)
  const [postalCodeLoading, setPostalCodeLoading] = useState(false)
  const [addressSearchLoading, setAddressSearchLoading] = useState(false)
  const [addressSearchResults, setAddressSearchResults] = useState([])
  const [postalCodeError, setPostalCodeError] = useState('')
  const [error, setError] = useState('')
  const [orderStatus, setOrderStatus] = useState(getReturnedOrder)

  const cartItems = useMemo(() => Object.entries(cart)
    .map(([productId, quantity]) => ({ product: products.find((item) => item.id === productId), quantity }))
    .filter((item) => item.product && item.quantity > 0), [cart, products])
  const subtotalCents = cartItems.reduce((total, item) => total + item.product.priceCents * item.quantity, 0)
  const deliveryFeeCents = fulfillment === 'delivery' ? backendConfig?.delivery?.feeCents || 0 : 0

  async function lookupPostalCode() {
    const postalCode = address.postalCode.replace(/\D/g, '')
    if (postalCode.length !== 8) {
      setPostalCodeError('Digite um CEP com 8 números.')
      return
    }
    setPostalCodeLoading(true)
    setPostalCodeError('')
    try {
      const response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`)
      if (!response.ok) throw new Error('O serviço de busca de CEP está indisponível.')
      const result = await response.json()
      if (result.erro) throw new Error('CEP não encontrado. Você ainda pode preencher o endereço manualmente.')
      setAddress((current) => ({
        ...current,
        street: result.logradouro || current.street,
        neighborhood: result.bairro || current.neighborhood,
        city: result.localidade || current.city,
        state: result.uf || current.state,
      }))
    } catch (lookupError) {
      setPostalCodeError(lookupError instanceof Error ? lookupError.message : 'Não foi possível buscar este CEP. Preencha o endereço manualmente.')
    } finally {
      setPostalCodeLoading(false)
    }
  }

  async function lookupAddress() {
    const state = address.state.trim().toUpperCase()
    const city = address.city.trim()
    const street = address.street.trim()
    if (!/^[A-Z]{2}$/.test(state) || city.length < 2 || street.length < 3) {
      setPostalCodeError('Informe rua, cidade e UF para buscar o endereço.')
      return
    }
    setAddressSearchLoading(true)
    setPostalCodeError('')
    setAddressSearchResults([])
    try {
      const query = [state, city, street].map(encodeURIComponent).join('/')
      const response = await fetch(`https://viacep.com.br/ws/${query}/json/`)
      if (!response.ok) throw new Error('O serviço de busca de endereço está indisponível.')
      const results = await response.json()
      if (!Array.isArray(results) || results.length === 0) {
        throw new Error('Nenhum endereço encontrado. Você ainda pode preencher os dados manualmente.')
      }
      if (results.length === 1) {
        const result = results[0]
        setAddress((current) => ({
          ...current,
          street: result.logradouro || current.street,
          neighborhood: result.bairro || current.neighborhood,
          city: result.localidade || current.city,
          state: result.uf || current.state,
          postalCode: result.cep || current.postalCode,
        }))
      } else {
        setAddressSearchResults(results)
      }
    } catch (lookupError) {
      setPostalCodeError(lookupError instanceof Error ? lookupError.message : 'Não foi possível buscar este endereço. Preencha os dados manualmente.')
    } finally {
      setAddressSearchLoading(false)
    }
  }

  function selectAddressResult(result) {
    setAddress((current) => ({
      ...current,
      street: result.logradouro || current.street,
      neighborhood: result.bairro || current.neighborhood,
      city: result.localidade || current.city,
      state: result.uf || current.state,
      postalCode: result.cep || current.postalCode,
    }))
    setAddressSearchResults([])
  }

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
      setError('Seu carrinho está vazio. Volte ao cardápio e adicione um item para simular o pedido.')
      return
    }
    const phoneDigits = customer.phone.replace(/\D/g, '')
    if (customer.name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim()) || phoneDigits.length < 10 || phoneDigits.length > 13) {
      setError('Preencha nome, e-mail válido e telefone com DDD para continuar.')
      return
    }
    if (cartItems.some(({ product }) => product.options?.length && !selectedOptions[product.id])) {
      setError('Selecione as opções obrigatórias dos itens do pedido.')
      return
    }
    if (fulfillment === 'delivery' && (
      address.street.trim().length < 3
      || !address.number.trim()
      || !address.neighborhood.trim()
      || !address.city.trim()
      || !/^[A-Z]{2}$/i.test(address.state.trim())
      || address.postalCode.replace(/\D/g, '').length !== 8
    )) {
      setError('Complete rua, número, bairro, cidade, UF e CEP para simular a entrega.')
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
      sessionStorage.setItem(`tillecus-order-token:${result.orderId}`, attempt.orderToken)
      sessionStorage.setItem('tillecus-last-order', result.orderId)
      onCartChange({})
      if (result.simulation) {
        setOrderStatus(result)
        setSubmitting(false)
        return
      }
      if (!result.checkoutUrl || !/^https:\/\//.test(result.checkoutUrl)) throw new Error('O provedor não retornou um checkout seguro.')
      window.location.assign(result.checkoutUrl)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha de conexão. Tente novamente.')
      setSubmitting(false)
    }
  }

  async function simulatePayment(outcome) {
    const orderId = orderStatus?.orderId
    const orderToken = orderId && sessionStorage.getItem(`tillecus-order-token:${orderId}`)
    if (!orderId || !orderToken) {
      setError('A sessão da demonstração expirou. Crie outro pedido para continuar.')
      return
    }
    setSimulationLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Order-Token': orderToken },
        body: JSON.stringify({ outcome }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error?.message || 'Não foi possível simular esse resultado.')
      setOrderStatus(result)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha na simulação local.')
    } finally {
      setSimulationLoading(false)
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
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-amber-500/20 bg-[#120800] p-5 text-amber-50 shadow-[0_25px_80px_rgba(0,0,0,0.5)] md:p-7"
      >
        <div className="mb-6 flex items-center justify-between gap-4 border-b border-amber-500/15 pb-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-amber-400">Pedido</p>
            <h2 id="checkout-title" className="mt-2 text-2xl font-black text-amber-50 md:text-3xl">Carrinho e checkout</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-amber-500/30 bg-white/5 px-3 py-2 text-sm font-medium text-amber-100 transition hover:border-amber-400/60 hover:bg-amber-500/10"
            aria-label="Fechar checkout"
          >
            Fechar
          </button>
        </div>

        {orderStatus ? (
          <div className="space-y-4 rounded-[1.7rem] border border-amber-500/15 bg-[#1a0d08] p-5" aria-live="polite">
            <h3 className="text-xl font-bold text-white">Pedido {orderStatus.orderId ? `#${orderStatus.orderId.slice(0, 8)}` : ''}</h3>
            <p className="text-amber-100/75">
              {orderStatus.simulation
                ? simulationStatusLabel[orderStatus.status] || 'Resultado da simulação local.'
                : paymentStatusLabel[orderStatus.status] || 'Não foi possível consultar o pedido neste navegador.'}
            </p>

            {orderStatus.simulation && (
              <div className="space-y-3 rounded-xl border border-sky-300/20 bg-sky-950/25 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-200">Simulação local · sem cobrança real</p>
                <p className="text-sm leading-relaxed text-sky-100/70">Estes botões apenas demonstram os estados do checkout. Nenhum pagamento é enviado ou confirmado pelo Mercado Pago.</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    ['paid', 'Simular aprovação'],
                    ['pending', 'Simular pendência'],
                    ['rejected', 'Simular recusa'],
                  ].map(([outcome, label]) => (
                    <button
                      key={outcome}
                      type="button"
                      disabled={simulationLoading}
                      onClick={() => simulatePayment(outcome)}
                      className="rounded-lg border border-sky-200/20 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-200/10 disabled:cursor-wait disabled:opacity-50"
                    >
                      {simulationLoading ? 'Atualizando…' : label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <p role="alert" className="rounded-xl border border-red-500/35 bg-red-950/25 px-4 py-3 text-sm text-red-100">{error}</p>}

            {orderStatus.totalCents != null && (
              <p className="rounded-2xl border border-amber-500/15 bg-black/20 px-4 py-3 text-lg font-semibold text-amber-300">
                Total: {formatPrice(orderStatus.totalCents)}
              </p>
            )}

            {orderStatus.status === 'pending' && !orderStatus.simulation && (
              <p className="text-sm text-amber-100/60">
                Esta tela não confirma o pagamento por conta própria. O status só muda após consulta autenticada e notificação do provedor.
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              {orderStatus.checkoutUrl && orderStatus.status === 'pending' && (
                <a href={orderStatus.checkoutUrl} className="inline-flex rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-3 font-bold text-[#1a0900] shadow-[0_18px_35px_rgba(255,137,46,0.35)] hover:-translate-y-0.5 transition">
                  Voltar ao pagamento seguro
                </a>
              )}

              {['rejected', 'cancelled', 'expired'].includes(orderStatus.status) && (
                <button
                  type="button"
                  disabled={retrying}
                  onClick={retryPayment}
                  className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-3 font-bold text-[#1a0900] shadow-[0_18px_35px_rgba(255,137,46,0.35)] transition hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {retrying ? 'Preparando nova tentativa…' : 'Tentar pagamento novamente'}
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={startNewOrder} className="rounded-full border border-amber-500/30 bg-white/5 px-5 py-3 font-bold text-amber-50 transition hover:bg-amber-500/10">Fazer novo pedido</button>
              <button type="button" onClick={onClose} className="rounded-full bg-amber-500/10 px-5 py-3 font-bold text-amber-100 transition hover:bg-amber-500/20">Voltar ao cardápio</button>
            </div>
          </div>
        ) : (
          <form noValidate onSubmit={submitOrder} className="space-y-6 md:space-y-7">
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4 rounded-[1.5rem] border border-amber-500/15 bg-[#180c08]/80 p-4">
                <div className="flex items-center justify-between gap-3 border-b border-amber-500/10 pb-3">
                  <h3 className="text-lg font-bold text-amber-50">Resumo do pedido</h3>
                  <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-amber-200">{cartItems.length} itens</span>
                </div>

                {cartItems.length === 0 ? (
                  <div className="space-y-2">
                    <p className="text-amber-100/70">Seu carrinho está vazio. Adicione um produto antes de simular o pedido.</p>
                    <a href="#menu" onClick={onClose} className="inline-flex rounded-md border border-amber-500/30 px-3 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-500/10">
                      Voltar ao cardápio
                    </a>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cartItems.map(({ product, quantity }) => (
                      <div key={product.id} className="rounded-[1.2rem] border border-amber-500/10 bg-black/15 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-amber-50">{product.title}</p>
                            <p className="text-sm text-amber-100/60">{formatPrice(product.priceCents)} cada</p>
                            {product.options?.length > 0 && (
                              <label className="mt-2 block text-xs uppercase tracking-[0.18em] text-amber-200/70">
                                {product.optionLabel}
                                <select
                                  required
                                  value={selectedOptions[product.id] || ''}
                                  onChange={(event) => setSelectedOptions({ ...selectedOptions, [product.id]: event.target.value })}
                                  className="mt-1 w-full rounded-xl border border-amber-500/20 bg-[#120800] p-2.5 text-sm text-amber-50 outline-none transition focus:border-amber-400"
                                >
                                  <option value="">Selecione</option>
                                  {product.options.map((option) => <option key={option} value={option}>{option}</option>)}
                                </select>
                              </label>
                            )}
                          </div>

                          <strong className="whitespace-nowrap text-sm font-bold text-amber-300">{formatPrice(product.priceCents * quantity)}</strong>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 rounded-full border border-amber-500/20 bg-black/20 px-2 py-1">
                            <button type="button" onClick={() => updateQuantity(product.id, quantity - 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-lg text-amber-50" aria-label={`Remover uma unidade de ${product.title}`}>−</button>
                            <span className="w-5 text-center text-sm font-semibold text-amber-50">{quantity}</span>
                            <button type="button" onClick={() => updateQuantity(product.id, quantity + 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-lg text-amber-50" aria-label={`Adicionar uma unidade de ${product.title}`}>+</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2 rounded-[1.2rem] border border-amber-500/15 bg-black/20 p-3 text-sm">
                  <div className="flex items-center justify-between text-amber-100/70">
                    <span>Subtotal</span>
                    <span>{formatPrice(subtotalCents)}</span>
                  </div>
                  <div className="flex items-center justify-between text-amber-100/70">
                    <span>Entrega</span>
                    <span>{fulfillment === 'delivery' ? formatPrice(deliveryFeeCents) : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-amber-500/15 pt-2 text-base font-bold text-white">
                    <span>Total</span>
                    <span>{formatPrice(subtotalCents + deliveryFeeCents)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-amber-500/15 bg-[#180c08]/80 p-4">
                <div className="mb-4">
                  <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-amber-400">Entrega</p>
                  <h3 className="mt-2 text-xl font-bold text-white">Como quer receber?</h3>
                </div>

                <fieldset className="space-y-3">
                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-amber-500/15 bg-black/15 px-3 py-2.5 text-sm text-amber-100/80 transition hover:border-amber-400/50">
                    <input type="radio" name="fulfillment" value="pickup" checked={fulfillment === 'pickup'} onChange={() => setFulfillment('pickup')} />
                    <span>Retirar no local</span>
                  </label>

                  <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border border-amber-500/15 bg-black/15 px-3 py-2.5 text-sm transition hover:border-amber-400/50 ${backendConfig?.delivery?.enabled ? 'text-amber-100/80' : 'cursor-not-allowed opacity-50'}`}>
                    <input type="radio" name="fulfillment" value="delivery" checked={fulfillment === 'delivery'} disabled={!backendConfig?.delivery?.enabled} onChange={() => setFulfillment('delivery')} />
                    <span>
                      Entrega {backendConfig?.delivery?.enabled
                        ? backendConfig.delivery.simulation ? '(simulação · sem taxa)' : `(${formatPrice(backendConfig.delivery.feeCents)})`
                        : '(indisponível)'}
                    </span>
                  </label>
                </fieldset>

                {backendConfig?.delivery?.simulation && (
                  <p className="mt-3 text-xs leading-relaxed text-sky-200/70">Demonstração local: endereço livre e taxa não calculada. Isso não confirma cobertura de entrega real.</p>
                )}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-amber-500/15 bg-[#180c08]/80 p-4">
              <div className="mb-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-amber-400">Dados do cliente</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm text-amber-100/75">
                  <span>Nome</span>
                  <input
                    required
                    autoComplete="name"
                    maxLength="120"
                    value={customer.name}
                    onChange={(event) => setCustomer({ ...customer, name: event.target.value })}
                    className="w-full rounded-xl border border-amber-500/20 bg-[#0f0600] px-3 py-3 text-base text-amber-50 outline-none transition focus:border-amber-400"
                  />
                </label>

                <label className="space-y-2 text-sm text-amber-100/75">
                  <span>Telefone</span>
                  <input
                    required
                    type="tel"
                    autoComplete="tel"
                    maxLength="32"
                    value={customer.phone}
                    onChange={(event) => setCustomer({ ...customer, phone: event.target.value })}
                    className="w-full rounded-xl border border-amber-500/20 bg-[#0f0600] px-3 py-3 text-base text-amber-50 outline-none transition focus:border-amber-400"
                  />
                </label>

                <label className="space-y-2 text-sm text-amber-100/75 sm:col-span-2">
                  <span>E-mail</span>
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    maxLength="254"
                    value={customer.email}
                    onChange={(event) => setCustomer({ ...customer, email: event.target.value })}
                    className="w-full rounded-xl border border-amber-500/20 bg-[#0f0600] px-3 py-3 text-base text-amber-50 outline-none transition focus:border-amber-400"
                  />
                </label>
              </div>
            </div>

            {fulfillment === 'delivery' && (
              <div className="rounded-[1.5rem] border border-amber-500/15 bg-[#180c08]/80 p-4">
                <div className="mb-4">
                  <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-amber-400">Endereço</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <div className="flex items-end gap-2">
                      <label className="min-w-0 flex-1 space-y-2 text-sm text-amber-100/75">
                        <span>CEP</span>
                        <input
                          required
                          inputMode="numeric"
                          autoComplete="postal-code"
                          maxLength="9"
                          value={address.postalCode}
                          onChange={(event) => {
                            const digits = event.target.value.replace(/\D/g, '').slice(0, 8)
                            setAddress({ ...address, postalCode: digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits })
                            setPostalCodeError('')
                            setAddressSearchResults([])
                          }}
                          className="w-full rounded-xl border border-amber-500/20 bg-[#0f0600] px-3 py-3 text-base text-amber-50 outline-none transition focus:border-amber-400"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={postalCodeLoading}
                        onClick={lookupPostalCode}
                        className="mb-px shrink-0 rounded-lg border border-amber-500/35 px-3 py-3 text-xs font-bold text-amber-200 transition hover:bg-amber-500/10 disabled:opacity-50"
                      >
                        {postalCodeLoading ? 'Buscando…' : 'Buscar CEP'}
                      </button>
                    </div>
                    {postalCodeError && <p role="alert" className="mt-2 text-xs text-red-200">{postalCodeError}</p>}
                  </div>

                  <div className="sm:col-span-2">
                    <div className="flex items-end gap-2">
                      <label className="min-w-0 flex-1 space-y-2 text-sm text-amber-100/75">
                        <span>Rua / avenida</span>
                        <input required maxLength="120" autoComplete="street-address" value={address.street} onChange={(event) => { setAddress({ ...address, street: event.target.value }); setAddressSearchResults([]) }} className="w-full rounded-xl border border-amber-500/20 bg-[#0f0600] px-3 py-3 text-base text-amber-50 outline-none transition focus:border-amber-400" />
                      </label>
                      <button
                        type="button"
                        disabled={addressSearchLoading}
                        onClick={lookupAddress}
                        className="mb-px shrink-0 rounded-lg border border-amber-500/35 px-3 py-3 text-xs font-bold text-amber-200 transition hover:bg-amber-500/10 disabled:opacity-50"
                      >
                        {addressSearchLoading ? 'Buscando…' : 'Buscar rua'}
                      </button>
                    </div>
                    {addressSearchResults.length > 0 && (
                      <div className="mt-2 grid gap-2" aria-label="Resultados de endereço">
                        {addressSearchResults.map((result) => (
                          <button
                            key={`${result.cep}-${result.bairro}`}
                            type="button"
                            onClick={() => selectAddressResult(result)}
                            className="rounded-lg border border-amber-500/20 bg-black/20 px-3 py-2 text-left text-xs text-amber-100 transition hover:border-amber-400/50"
                          >
                            {result.logradouro} · {result.bairro || 'Bairro não informado'} · {result.cep}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <label className="space-y-2 text-sm text-amber-100/75">
                    <span>Número</span>
                    <input required maxLength="20" autoComplete="address-line2" value={address.number} onChange={(event) => setAddress({ ...address, number: event.target.value })} className="w-full rounded-xl border border-amber-500/20 bg-[#0f0600] px-3 py-3 text-base text-amber-50 outline-none transition focus:border-amber-400" />
                  </label>

                  <label className="space-y-2 text-sm text-amber-100/75">
                    <span>Complemento</span>
                    <input maxLength="100" value={address.complement} onChange={(event) => setAddress({ ...address, complement: event.target.value })} className="w-full rounded-xl border border-amber-500/20 bg-[#0f0600] px-3 py-3 text-base text-amber-50 outline-none transition focus:border-amber-400" />
                  </label>

                  <label className="space-y-2 text-sm text-amber-100/75">
                    <span>Bairro</span>
                    {backendConfig.delivery.allowAnyAddress ? (
                      <input required maxLength="100" autoComplete="address-level3" value={address.neighborhood} onChange={(event) => setAddress({ ...address, neighborhood: event.target.value })} className="w-full rounded-xl border border-amber-500/20 bg-[#0f0600] px-3 py-3 text-base text-amber-50 outline-none transition focus:border-amber-400" />
                    ) : (
                      <select
                        required
                        value={address.neighborhood}
                        onChange={(event) => {
                          const area = backendConfig.delivery.areas.find((item) => item.neighborhood === event.target.value)
                          setAddress({ ...address, neighborhood: area?.neighborhood || '', city: area?.city || '' })
                        }}
                        className="w-full rounded-xl border border-amber-500/20 bg-[#0f0600] px-3 py-3 text-base text-amber-50 outline-none transition focus:border-amber-400"
                      >
                        <option value="">Selecione</option>
                        {backendConfig.delivery.areas.map((area) => (
                          <option key={`${area.city}-${area.neighborhood}`} value={area.neighborhood}>{area.neighborhood} · {area.city}</option>
                        ))}
                      </select>
                    )}
                  </label>

                  <label className="space-y-2 text-sm text-amber-100/75">
                    <span>Cidade</span>
                    <input required maxLength="100" autoComplete="address-level2" readOnly={!backendConfig.delivery.allowAnyAddress} value={address.city} onChange={(event) => setAddress({ ...address, city: event.target.value })} className="w-full rounded-xl border border-amber-500/20 bg-[#0f0600] px-3 py-3 text-base text-amber-50 outline-none transition focus:border-amber-400 read-only:opacity-75" />
                  </label>

                  <label className="space-y-2 text-sm text-amber-100/75">
                    <span>Estado (UF)</span>
                    <input required maxLength="2" autoComplete="address-level1" value={address.state} onChange={(event) => setAddress({ ...address, state: event.target.value.toUpperCase().slice(0, 2) })} className="w-full rounded-xl border border-amber-500/20 bg-[#0f0600] px-3 py-3 text-base uppercase text-amber-50 outline-none transition focus:border-amber-400" />
                  </label>
                </div>
              </div>
            )}

            <div className="rounded-[1.5rem] border border-amber-500/15 bg-[#180c08]/80 p-4">
              <label className="block space-y-2 text-sm text-amber-100/75">
                <span>Observações</span>
                <textarea maxLength="500" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-24 w-full rounded-xl border border-amber-500/20 bg-[#0f0600] px-3 py-3 text-base text-amber-50 outline-none transition focus:border-amber-400" />
              </label>
            </div>

            <div className="space-y-3">
              <p className="text-sm leading-relaxed text-amber-100/70">
                {backendConfig?.paymentMode === 'simulation'
                  ? 'Modo de demonstração: você poderá simular aprovação, pendência ou recusa. Nenhuma cobrança real será feita.'
                  : 'O pagamento será feito no ambiente seguro do Mercado Pago. Escolha Pix, cartão ou boleto entre as opções disponíveis.'}
              </p>

              {error && (
                <p role="alert" className="rounded-2xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">
                  {error}
                </p>
              )}

              {backendLoading && !backendConfig && (
                <p role="status" className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/85">
                  Verificando a conexão com o serviço de pagamentos…
                </p>
              )}

              {backendError && (
                <p role="alert" className="rounded-2xl border border-red-500/35 bg-red-950/25 px-4 py-3 text-sm leading-relaxed text-red-100">
                  Não foi possível conectar ao serviço de pagamentos: {backendError} No ambiente local, inicie o Firebase Emulator ou configure VITE_API_PROXY_TARGET.
                </p>
              )}

              {backendConfig && !backendConfig.paymentsEnabled && (
                <p className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/85">
                  O backend respondeu, mas o pagamento não está habilitado. Configure a URL pública HTTPS e as credenciais do Mercado Pago no Firebase.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || cartItems.length === 0 || !backendConfig?.paymentsEnabled}
              className="w-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 text-base font-black uppercase tracking-[0.14em] text-[#1a0900] shadow-[0_18px_35px_rgba(255,137,46,0.35)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? 'Criando pedido…'
                : cartItems.length === 0
                  ? 'Adicione um item para continuar'
                  : `${backendConfig?.paymentMode === 'simulation' ? 'Simular pedido' : 'Continuar para pagamento'} · ${formatPrice(subtotalCents + deliveryFeeCents)}`}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
