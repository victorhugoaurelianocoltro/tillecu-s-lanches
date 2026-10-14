import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import GLBScene from './GLBScene'
import { FEATURED_PRODUCT_IDS, PRODUCTS } from '../../functions/src/catalog.js'

gsap.registerPlugin(ScrollTrigger)

const MENU_CATEGORIES = [
  { id: 'todos', label: 'Todos' },
  { id: 'hamburguer', label: 'Hambúrgueres' },
  { id: 'porcao', label: 'Porções' },
  { id: 'combo', label: 'Combos' },
]

const CATEGORY_TITLES = {
  hamburguer: 'Hambúrgueres',
  porcao: 'Porções',
  combo: 'Combos',
}

function Card({ item, onAdd }) {
  const ref = useRef()

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const onMove = (event) => {
      const rect = el.getBoundingClientRect()
      gsap.to(el, {
        rotateY: (event.clientX - rect.left) / rect.width * 14 - 7,
        rotateX: -(event.clientY - rect.top) / rect.height * 10 + 5,
        transformPerspective: 900,
        duration: 0.38,
        ease: 'power1.out',
      })
    }

    const onLeave = () => gsap.to(el, { rotateY: 0, rotateX: 0, duration: 0.9, ease: 'elastic.out(1,.5)' })

    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  return (
    <div
      ref={ref}
      className="project-card group relative cursor-pointer overflow-hidden rounded-xl border border-amber-900/35 bg-[#1a0c06] shadow-[0_14px_34px_rgba(0,0,0,0.22)] transition duration-300 hover:border-amber-400/50"
      style={{ willChange: 'transform' }}
    >
      <div className="relative h-48 overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 60%, #42200e, #120700)' }}>
        <GLBScene
          path={item.model ? `${import.meta.env.BASE_URL}${item.model.replace(/^\/+/, '')}` : undefined}
          className="h-full w-full"
          targetSize={2.3}
          cameraZ={3.6}
          fov={50}
          baseRotateY={item.baseRotateY}
          sway={0.25}
          env="sunset"
          exposure={1.5}
          ambientIntensity={0.85}
        />
        <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-25" style={{ background: `radial-gradient(circle at 50% 65%,${item.color},transparent 65%)` }} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0400]/75 via-transparent to-transparent" />
        <span className="absolute left-3 top-3 rounded-md border border-white/20 bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-sm">
          {item.tag}
        </span>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex min-h-10 items-start justify-between gap-3">
          <h3 className="text-base font-bold leading-snug text-amber-50">{item.title}</h3>
          <span className="shrink-0 pt-0.5 text-sm font-black text-amber-300">{item.price}</span>
        </div>

        <p className="min-h-10 text-xs leading-relaxed text-amber-100/65">{item.desc}</p>

        <button
          type="button"
          onClick={() => onAdd(item.id)}
          className="w-full rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-100 transition duration-200 hover:bg-amber-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
        >
          Peça agora
        </button>
      </div>
    </div>
  )
}

export default function Projects({ onAdd }) {
  const [activeCategory, setActiveCategory] = useState('todos')
  const showFeatured = activeCategory === 'todos' || activeCategory === 'hamburguer'
  const visibleCategories = activeCategory === 'todos'
    ? ['hamburguer', 'porcao', 'combo']
    : [activeCategory]

  return (
    <section id="menu" className="bg-[radial-gradient(circle_at_top,_rgba(255,154,71,0.1),_transparent_25%),#0f0600] px-5 py-12 md:px-8 md:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-col gap-5 border-b border-amber-100/10 pb-6 md:mb-9 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-amber-400">Tillecu’s Lanches <span className="px-1 text-amber-100/30">/</span> Feito na hora</p>
            <h2 className="text-3xl font-black leading-tight text-amber-50 md:text-4xl">Cardápio</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-amber-100/60">
              Escolha seu próximo favorito entre nossos lanches, porções e combos.
            </p>
          </div>
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-amber-100/10 bg-black/20 p-1" aria-label="Filtrar cardápio">
            {MENU_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(category.id)}
                aria-pressed={activeCategory === category.id}
                className={`shrink-0 rounded-md px-3 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 ${activeCategory === category.id ? 'bg-amber-400 text-[#190b04]' : 'text-amber-100/65 hover:bg-white/5 hover:text-amber-50'}`}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>

        {showFeatured && (
          <div className="mb-9">
            <div className="mb-3 flex items-center gap-3">
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-amber-100">Mais pedidos</h3>
              <span className="h-px flex-1 bg-amber-100/10" />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {PRODUCTS.filter((item) => FEATURED_PRODUCT_IDS.includes(item.id)).map((item) => (
                <Card key={item.id} item={item} onAdd={onAdd} />
              ))}
            </div>
          </div>
        )}

        <div className="space-y-8">
          {visibleCategories.map((categoryId) => {
            const items = PRODUCTS.filter((item) => item.category === categoryId && !(categoryId === 'hamburguer' && FEATURED_PRODUCT_IDS.includes(item.id)))
            if (!items.length) return null

            return (
              <section key={categoryId} aria-labelledby={`menu-${categoryId}`}>
                <div className="mb-3 flex items-center gap-3">
                  <h3 id={`menu-${categoryId}`} className="text-sm font-bold uppercase tracking-[0.12em] text-amber-100">{CATEGORY_TITLES[categoryId]}</h3>
                  <span className="text-xs text-amber-100/40">{items.length} itens</span>
                  <span className="h-px flex-1 bg-amber-100/10" />
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((item) => (
                    <article key={item.id} className="flex min-h-28 flex-col justify-between rounded-lg border border-amber-100/10 bg-[#170a04]/90 p-3.5 transition-colors hover:border-amber-500/35 hover:bg-[#1d0d05]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-400/75">{item.tag}</span>
                          <h4 className="text-sm font-bold leading-snug text-amber-50">{item.title}</h4>
                        </div>
                        <span className="shrink-0 pt-0.5 text-sm font-extrabold text-amber-300">{item.price}</span>
                      </div>
                      <div className="mt-2 flex items-end justify-between gap-3">
                        <p className="line-clamp-2 text-xs leading-relaxed text-amber-100/55">{item.desc}</p>
                        <button
                          type="button"
                          onClick={() => onAdd(item.id)}
                          aria-label={`Adicionar ${item.title} ao pedido`}
                          className="shrink-0 rounded-md border border-amber-500/35 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-200 transition hover:bg-amber-400 hover:text-[#190b04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
                        >
                          Adicionar
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </section>
  )
}
