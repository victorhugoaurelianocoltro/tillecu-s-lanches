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
    <nav id="navbar"
      className="fixed top-0 left-0 right-0 z-50 px-8 py-4
                 bg-[#0d0400]/80 backdrop-blur-md border-b border-amber-900/20 opacity-0 -translate-y-full">
      <div className="max-w-6xl mx-auto flex justify-between items-center">
        <span className="text-amber-400 font-bold text-lg tracking-[.2em]">TILLECU’S LANCHES</span>
        <div className="flex items-center gap-8 text-sm text-amber-200/70">
          {[['#about','Sobre'],['#menu','Cardápio'],['#contact','Contato']].map(([href,label]) => (
            <a key={href} href={href} className="hover:text-amber-400 transition-colors">{label}</a>
          ))}
          <button type="button" onClick={onOpenCart} className="font-bold text-amber-400 hover:text-amber-300">
            Carrinho ({cartCount})
          </button>
        </div>
      </div>
    </nav>
  )
}

export default function App() {
  const heroRef  = useRef()
  const textRef  = useRef()
  const [cart, setCart] = useState({})
  const [checkoutOpen, setCheckoutOpen] = useState(() => new URLSearchParams(window.location.search).has('pedido'))
  const [backendConfig, setBackendConfig] = useState(null)
  const cartCount = Object.values(cart).reduce((total, quantity) => total + quantity, 0)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/catalog', { signal: controller.signal, cache: 'no-store' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('API unavailable')))
      .then(setBackendConfig)
      .catch((error) => { if (error.name !== 'AbortError') setBackendConfig(null) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger:'#about', start:'top 80%',
        onEnter:     () => gsap.to('#navbar', { opacity:1, y:0, duration:0.6 }),
        onLeaveBack: () => gsap.to('#navbar', { opacity:0, y:'-100%', duration:0.4 }),
      })

      // Hero — entrada escalonada sin split (evita bugs)
      gsap.timeline({ delay:0.4 })
        .from('.hero-tag',   { y:30, opacity:0, duration:0.6, ease:'power3.out' })
        .from('.hero-h1',    { y:60, opacity:0, duration:1.0, ease:'power3.out' }, '-=0.3')
        .from('.hero-sub',   { y:25, opacity:0, duration:0.7, ease:'power2.out' }, '-=0.4')
        .from('.hero-cta',   { y:20, opacity:0, duration:0.5, stagger:0.15 }, '-=0.3')

      // Ken Burns — zoom lento continuo en la foto del hero
      gsap.fromTo('.hero-bg', { scale:1.0 },
        { scale:1.12, duration:18, ease:'none', yoyo:true, repeat:-1 })

      // Parallax texto
      const onMouse = e => {
        const cx = window.innerWidth/2, cy = window.innerHeight/2
        gsap.to(textRef.current, { x:(e.clientX-cx)/cx*20, y:(e.clientY-cy)/cy*12, duration:1.2, ease:'power1.out' })
      }
      window.addEventListener('mousemove', onMouse)

      // Hero scroll out
      gsap.to(heroRef.current, {
        opacity:0, scale:0.9,
        scrollTrigger:{ trigger:'#about', start:'top bottom', end:'top 30%', scrub:1.5 },
      })

      // Secciones (la animación de .about-glb vive en About.jsx — no duplicar aquí)
      gsap.from('#menu .project-card', {
        y:80, opacity:0, duration:1, stagger:0.18, ease:'back.out(1.2)',
        scrollTrigger:{ trigger:'#menu .project-card', start:'top 82%' },
      })
      gsap.from('.contact-img', {
        x:-80, opacity:0, duration:1.2, ease:'power3.out',
        scrollTrigger:{ trigger:'#contact', start:'top 70%' },
      })
      gsap.from('.contact-content', {
        x:80, opacity:0, duration:1.2, ease:'power3.out',
        scrollTrigger:{ trigger:'#contact', start:'top 70%' },
      })

      return () => window.removeEventListener('mousemove', onMouse)
    })
    return () => ctx.revert()
  }, [])

  return (
    <>
      <Navbar cartCount={cartCount} onOpenCart={() => setCheckoutOpen(true)} />
      <main>
        {/* HERO */}
        <section ref={heroRef} className="relative h-screen flex items-center overflow-hidden">
          <HeroScene />

          {/* Texto — encima del canvas */}
          <div ref={textRef} className="relative z-10 px-8 md:px-16 max-w-2xl">
            <p className="hero-tag text-amber-400 text-sm font-mono mb-5 tracking-[.3em] uppercase">
              Hambúrgueres da casa · Jandira
            </p>
            <h1 className="hero-h1 leading-none mb-6 text-white">
              <span className="block text-6xl md:text-8xl font-bold">Tillecu’s</span>
              <span className="block text-6xl md:text-8xl font-bold text-transparent
                               bg-clip-text bg-gradient-to-r from-amber-400 to-red-400">
                Lanches
              </span>
            </h1>
            <p className="hero-sub text-white/70 text-xl mb-10 leading-relaxed max-w-md">
              Hambúrgueres, porções e combos. Peça pelo delivery.
            </p>
            <div className="flex gap-4 flex-wrap">
              <a href="#menu"
                className="hero-cta px-8 py-4 bg-amber-600 hover:bg-amber-500 rounded-xl font-bold
                           text-white shadow-xl shadow-amber-900/50 hover:-translate-y-1.5 transition-all">
                Ver cardápio
              </a>
              <a href="#contact"
                className="hero-cta px-8 py-4 border-2 border-white/25 hover:border-amber-400
                           rounded-xl text-white backdrop-blur-sm bg-white/5 hover:-translate-y-1.5 transition-all">
                Peça pelo delivery
              </a>
            </div>
          </div>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/25 z-10">
            <span className="text-xs font-mono tracking-widest">ROLE A PÁGINA</span>
            <div className="w-px h-10 bg-gradient-to-b from-white/25 to-transparent animate-pulse"/>
          </div>
        </section>

        <div className="marquee-wrap"><Marquee /></div>
        <About />
        <div className="marquee-wrap"><Marquee reverse /></div>
        <Projects onAdd={(productId) => setCart((current) => ({
          ...current,
          [productId]: Math.min((current[productId] || 0) + 1, 20),
        }))} />
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
      />
    </>
  )
}
