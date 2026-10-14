import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import GLBScene from './GLBScene'

gsap.registerPlugin(ScrollTrigger)

const STATS = [
  { label: 'Lanches no cardápio', value: 19, suffix: '' },
  { label: 'Opções de porções', value: 6, suffix: '' },
  { label: 'Combos premium', value: 6, suffix: '' },
  { label: 'Avaliações', value: 4.9, suffix: '' },
]

const BENEFITS = [
  'Carne selecionada e grelhada na hora',
  'Ingredientes frescos e combinações refinadas',
  'Entrega rápida na sua região',
]

function Counter({ value, suffix, label }) {
  const ref = useRef()
  const done = useRef(false)

  useEffect(() => {
    const trigger = ScrollTrigger.create({
      trigger: ref.current,
      start: 'top 85%',
      onEnter: () => {
        if (done.current) return
        done.current = true
        const obj = { val: 0 }
        gsap.to(obj, {
          val: value,
          duration: 2,
          ease: 'power2.out',
          onUpdate: () => {
            const nextValue = value % 1 === 0 ? Math.round(obj.val) : Number(obj.val).toFixed(1)
            if (ref.current) ref.current.querySelector('.num').textContent = `${nextValue}${suffix}`
          },
        })
      },
    })

    return () => trigger.kill()
  }, [value, suffix])

  return (
    <div ref={ref} className="rounded-[1.6rem] border border-amber-500/20 bg-[#1a0d08]/80 p-6 text-center shadow-[0_18px_35px_rgba(0,0,0,0.18)] transition duration-300 hover:border-amber-400/50 hover:-translate-y-1">
      <p className="num mb-2 text-4xl font-black text-amber-300">0{suffix}</p>
      <p className="text-sm text-amber-100/65">{label}</p>
    </div>
  )
}

export default function About() {
  useEffect(() => {
    const ctx = gsap.context(() => {
      const h2 = document.querySelector('#about h2')
      if (h2 && !h2.dataset.split) {
        h2.dataset.split = '1'
        h2.innerHTML = h2.textContent.split(' ').map((word) =>
          `<span class="inline-block overflow-hidden"><span class="wi inline-block">${word}</span></span>`
        ).join(' ')
        gsap.from('#about h2 .wi', {
          y: '105%',
          opacity: 0,
          duration: 0.9,
          stagger: 0.12,
          ease: 'power4.out',
          scrollTrigger: { trigger: '#about', start: 'top 72%' },
        })
      }

      gsap.from('#about .about-text p, #about .benefit-list li', {
        y: 30,
        opacity: 0,
        duration: 0.8,
        stagger: 0.12,
        scrollTrigger: { trigger: '#about', start: 'top 65%' },
      })

      gsap.from('.about-glb', {
        x: 120,
        opacity: 0,
        duration: 1.2,
        ease: 'power3.out',
        scrollTrigger: { trigger: '#about', start: 'top 68%' },
      })
    })

    return () => ctx.revert()
  }, [])

  return (
    <section id="about" className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,166,84,0.12),_transparent_32%),#0d0500] px-6 py-24 md:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-20 grid items-center gap-12 md:grid-cols-2">
          <div className="about-text">
            <p className="mb-3 text-sm font-medium uppercase tracking-[0.32em] text-amber-400">Sobre a Tillecu’s Lanches</p>
            <h2 className="mb-6 text-4xl font-black leading-tight text-amber-50 md:text-5xl">Hambúrgueres da casa com cara de assinatura.</h2>
            <p className="mb-6 text-lg leading-relaxed text-amber-100/70">
              A Tillecu’s nasceu para entregar sabor marcante, cuidado com cada detalhe e uma experiência de pedido sem fricção.
            </p>
            <p className="mb-8 text-base leading-relaxed text-amber-100/55">
              Desde os ingredientes até o atendimento, cada etapa é pensada para que a sua escolha vire um convite irresistível para repetir.
            </p>

            <ul className="benefit-list space-y-3">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-center gap-3 text-amber-100/80">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/15 text-sm text-amber-300">✓</span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="about-glb h-[340px] overflow-hidden rounded-[2rem] border border-amber-900/20 bg-[#0a0300] shadow-[0_30px_70px_rgba(0,0,0,0.35)] md:h-[440px]">
            <GLBScene
              path={`${import.meta.env.BASE_URL}hamburger__food_big-hamburger.glb`}
              className="h-full w-full"
              targetSize={2.6}
              cameraZ={4.2}
              fov={45}
              env="sunset"
              exposure={1.4}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
          {STATS.map((stat) => <Counter key={stat.label} {...stat} />)}
        </div>
      </div>
    </section>
  )
}
