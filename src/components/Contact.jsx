import Icon from './icons'
import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

const IMG = 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=85'

export default function Contact() {
  const ref = useRef()

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const onMove = (event) => {
      const rect = el.getBoundingClientRect()
      gsap.to(el, {
        rotateY: (event.clientX - rect.left) / rect.width * 16 - 8,
        rotateX: -(event.clientY - rect.top) / rect.height * 12 + 6,
        transformPerspective: 1000,
        duration: 0.5,
        ease: 'power1.out',
      })
    }

    const onLeave = () => gsap.to(el, { rotateY: 0, rotateX: 0, duration: 1, ease: 'elastic.out(1,.5)' })

    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)

    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  const info = [
    ['Telefone', '(11) 99763-7482'],
    ['E-mail', 'contato@tillecuslanches.com'],
    ['Entrega', 'Peça pelo delivery'],
  ]

  return (
    <section id="contact" className="flex min-h-screen items-center bg-[radial-gradient(circle_at_left,_rgba(255,161,74,0.15),_transparent_30%),#090300] px-6 py-24 md:px-10">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 md:grid-cols-2">
        <div
          ref={ref}
          className="contact-img order-2 relative h-[340px] cursor-pointer overflow-hidden rounded-[2rem] border border-amber-900/30 shadow-[0_30px_70px_rgba(0,0,0,0.28)] md:order-1 md:h-[500px]"
          style={{ willChange: 'transform', transformStyle: 'preserve-3d' }}
        >
          <img src={IMG} alt="Hambúrguer artesanal" className="h-full w-full object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#090300]/70 to-transparent" />
          <div className="absolute inset-x-6 bottom-6 rounded-[1.5rem] border border-amber-500/20 bg-black/45 p-4 backdrop-blur-md">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.3em] text-amber-300">Horário</p>
            <p className="text-white">Terça a domingo · 18h às 23h</p>
          </div>
        </div>

        <div className="contact-content order-1 md:order-2">
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.38em] text-amber-400">Onde estamos</p>
          <h2 className="mb-6 text-4xl font-black text-amber-50 md:text-5xl">Bateu a fome?</h2>
          <p className="mb-2 text-lg text-amber-100/70">Peça seu lanche com sabor de casa e atendimento premium.</p>
          <p className="mb-8 flex items-center gap-2 text-amber-100/55">
            <span className="text-amber-300"><Icon name="pin" /></span>
            Rua Marquês de Herval, 44, Jandira · SP
          </p>

          <div className="mb-10 space-y-3">
            {info.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 border-b border-amber-900/30 py-3">
                <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-amber-300/70">{label}</span>
                <span className="text-sm text-amber-50">{value}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-4">
            <a
              href="tel:+5511997637482"
              className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-7 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-[#1a0900] shadow-[0_18px_35px_rgba(255,137,46,0.35)] transition duration-300 hover:-translate-y-1"
            >
              Ligue agora
            </a>
            <a
              href="#menu"
              className="rounded-full border border-amber-500/30 bg-white/5 px-7 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-amber-100 transition duration-300 hover:-translate-y-1 hover:border-amber-400/60"
            >
              Ver cardápio
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
