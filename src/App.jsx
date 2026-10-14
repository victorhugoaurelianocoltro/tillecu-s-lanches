import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { PRODUCTS } from '../functions/src/catalog.js'
import HeroScene from './components/HeroScene'
import About from './components/About'
import Projects from './components/Projects'
import Contact from './components/Contact'
import Marquee from './components/Marquee'
import Checkout from './components/Checkout'

gsap.registerPlugin(ScrollTrigger)

function Navbar({ cartCount, onOpenCart }) {
  return (
    <nav
      id="navbar"
      className="fixed left-0 right-0 top-0 z-50 border-b border-amber-200/10 bg-[#120700]/75 px-6 py-4 opacity-0 backdrop-blur-xl -translate-y-full shadow-[0_12px_30px_rgba(0,0,0,0.28)]"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <a href="#top" className="text-sm font-black uppercase tracking-[0.28em] text-amber-300 transition hover:text-amber-200">
          Tillecu’s
        </a>

        <div className="hidden items-center gap-7 text-sm text-amber-100/70 md:flex">
          {[['#about', 'Sobre'], ['#menu', 'Cardápio'], ['#contact', 'Contato']].map(([href, label]) => (
            <a key={href} href={href} className="transition hover:text-white">
              {label}
            </a>
          ))}
        </div>

        <button
          type="button"
          onClick={onOpenCart}
          className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:border-amber-300/60 hover:bg-amber-500/20"
        >
          <span>Carrinho</span>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-[#140700]">
            {cartCount}
          </span>
        </button>
      </div>
    </nav>
  )
}

export default function App() {
  const heroRef = useRef()
  const textRef = useRef()
  const [cart, setCart] = useState({})
  const [checkoutOpen, setCheckoutOpen] = useState(() => new URLSearchParams(window.location.search).has('pedido'))
  const [backendConfig, setBackendConfig] = useState(null)
  const [backendError, setBackendError] = useState('')
  const [backendLoading, setBackendLoading] = useState(true)
  const cartCount = Object.values(cart).reduce((total, quantity) => total + quantity, 0)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/catalog', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json().catch(() => null)
        if (!response.ok) throw new Error(result?.error?.message || `API indisponível (${response.status}).`)
        return result
      })
      .then((config) => {
        setBackendConfig(config)
        setBackendError('')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setBackendConfig(null)
          setBackendError(error.message || 'Não foi possível conectar ao backend.')
        }
      })
      .finally(() => { if (!controller.signal.aborted) setBackendLoading(false) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: '#about',
        start: 'top 80%',
        onEnter: () => gsap.to('#navbar', { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }),
        onLeaveBack: () => gsap.to('#navbar', { opacity: 0, y: '-100%', duration: 0.4, ease: 'power2.inOut' }),
      })

      gsap.timeline({ delay: 0.35 })
        .from('.hero-tag', { y: 30, opacity: 0, duration: 0.7, ease: 'power3.out' })
        .from('.hero-h1', { y: 60, opacity: 0, duration: 1.1, ease: 'power3.out' }, '-=0.3')
        .from('.hero-sub', { y: 24, opacity: 0, duration: 0.75, ease: 'power2.out' }, '-=0.45')
        .from('.hero-cta', { y: 20, opacity: 0, duration: 0.55, stagger: 0.14 }, '-=0.28')
        .from('.hero-panel', { y: 35, opacity: 0, duration: 0.8, ease: 'power2.out' }, '-=0.4')

      gsap.fromTo('.hero-bg', { scale: 1 }, { scale: 1.14, duration: 18, ease: 'none', repeat: -1, yoyo: true })

      const onMouse = (event) => {
        const cx = window.innerWidth / 2
        const cy = window.innerHeight / 2
        if (textRef.current) {
          gsap.to(textRef.current, {
            x: (event.clientX - cx) / cx * 16,
            y: (event.clientY - cy) / cy * 10,
            duration: 1.1,
            ease: 'power1.out',
          })
        }
      }
      window.addEventListener('mousemove', onMouse)

      gsap.to(heroRef.current, {
        opacity: 0.92,
        scale: 0.96,
        scrollTrigger: { trigger: '#about', start: 'top bottom', end: 'top 20%', scrub: 1.6 },
      })

      gsap.from('#menu .project-card', {
        y: 80,
        opacity: 0,
        duration: 1,
        stagger: 0.18,
        ease: 'back.out(1.3)',
        scrollTrigger: { trigger: '#menu .project-card', start: 'top 82%' },
      })

      gsap.from('.contact-img', {
        x: -80,
        opacity: 0,
        duration: 1.2,
        ease: 'power3.out',
        scrollTrigger: { trigger: '#contact', start: 'top 70%' },
      })

      gsap.from('.contact-content', {
        x: 80,
        opacity: 0,
        duration: 1.2,
        ease: 'power3.out',
        scrollTrigger: { trigger: '#contact', start: 'top 70%' },
      })

      return () => window.removeEventListener('mousemove', onMouse)
    })

    return () => ctx.revert()
  }, [])

  const heroPills = ['Delivery em Jandira', 'Óleo de alta qualidade', 'Atendimento premium']

  return (
    <>
      <Navbar cartCount={cartCount} onOpenCart={() => setCheckoutOpen(true)} />
      <main id="top">
        <section ref={heroRef} className="relative flex min-h-screen items-center overflow-hidden bg-[#120700]">
          <HeroScene />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,160,58,0.28),_transparent_30%),linear-gradient(90deg,_rgba(15,8,4,0.92)_0%,_rgba(15,8,4,0.68)_48%,_rgba(15,8,4,0.3)_100%)]" />

          <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-10 px-6 pb-16 pt-28 md:px-10 lg:grid-cols-[1.2fr_0.8fr]">
            <div ref={textRef} className="max-w-2xl">
              <p className="hero-tag mb-5 text-sm font-medium uppercase tracking-[0.38em] text-amber-400">
                Hambúrgueres da casa · Jandira
              </p>

              <h1 className="hero-h1 text-5xl font-black leading-none text-white md:text-7xl xl:text-[7rem]">
                <span className="block">Tillecu’s</span>
                <span className="bg-gradient-to-r from-amber-300 via-orange-400 to-red-500 bg-clip-text text-transparent">
                  Lanches
                </span>
              </h1>

              <p className="hero-sub mt-6 max-w-xl text-lg leading-relaxed text-white/75 md:text-xl">
                Hambúrgueres artesanais, porções crocantes e combos feitos para virar ritual. Entrega rápida, sabor intenso e experiência premium em cada mordida.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                {heroPills.map((item) => (
                  <span key={item} className="rounded-full border border-amber-300/20 bg-white/5 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-amber-100/70 backdrop-blur-sm">
                    {item}
                  </span>
                ))}
              </div>

              <div className="hero-cta mt-10 flex flex-wrap gap-4">
                <a
                  href="#menu"
                  className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-7 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-[#1b0900] shadow-[0_18px_35px_rgba(255,137,46,0.38)] transition duration-300 hover:-translate-y-1"
                >
                  Ver cardápio
                </a>
                <a
                  href="#contact"
                  className="rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-white backdrop-blur-sm transition duration-300 hover:-translate-y-1 hover:border-amber-400/60"
                >
                  Fazer pedido
                </a>
              </div>
            </div>

            <aside className="hero-panel rounded-[2rem] border border-amber-200/10 bg-[#1a0b01]/85 p-6 shadow-[0_25px_60px_rgba(0,0,0,0.35)] backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-amber-100/10 pb-4">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-amber-300/80">Café da manhã</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">Especial do dia</h2>
                </div>
                <div className="rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-amber-200">
                  15% OFF
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-[#2a1308] to-[#140900] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-amber-300/70">Combo</p>
                      <h3 className="mt-2 text-xl font-bold text-white">Burguer Master</h3>
                    </div>
                    <div className="text-xl font-black text-amber-300">R$ 44</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    ['10+', 'minutos'],
                    ['4.9', 'avaliação'],
                    ['100%', 'feito na hora'],
                  ].map(([value, label]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="text-2xl font-black text-white">{value}</div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-amber-200/60">{label}</div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setCheckoutOpen(true)}
                  className="w-full rounded-full border border-amber-500/40 bg-amber-500/10 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-amber-100 transition hover:bg-amber-500/20"
                >
                  Pedir agora
                </button>
              </div>
            </aside>
          </div>

          <div className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 text-white/30">
            <span className="text-[10px] font-medium uppercase tracking-[0.5em]">Role a página</span>
            <div className="h-10 w-px bg-gradient-to-b from-white/30 to-transparent" />
          </div>
        </section>

        <div className="marquee-wrap"><Marquee /></div>
        <About />
        <div className="marquee-wrap"><Marquee reverse /></div>
        <Projects onAdd={(productId) => setCart((current) => ({ ...current, [productId]: Math.min((current[productId] || 0) + 1, 20) }))} />
        <div className="marquee-wrap"><Marquee /></div>
        <Contact />
      </main>

      <Checkout
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        cart={cart}
        onCartChange={setCart}
        products={PRODUCTS}
        backendConfig={backendConfig}
        backendError={backendError}
        backendLoading={backendLoading}
      />
    </>
  )
}
