import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import GLBScene from './GLBScene'
import Icon from './icons'
import { FEATURED_PRODUCT_IDS, PRODUCTS } from '../../functions/src/catalog.js'

gsap.registerPlugin(ScrollTrigger)

function Card({ item, onAdd }) {
  const ref = useRef()
  useEffect(() => {
    const el = ref.current; if (!el) return
    const onMove = e => {
      const r = el.getBoundingClientRect()
      gsap.to(el, { rotateY:(e.clientX-r.left)/r.width*14-7,
        rotateX:-(e.clientY-r.top)/r.height*10+5,
        transformPerspective:900, duration:0.4, ease:'power1.out' })
    }
    const onLeave = () => gsap.to(el, { rotateY:0, rotateX:0, duration:0.9, ease:'elastic.out(1,.5)' })
    el.addEventListener('mousemove', onMove); el.addEventListener('mouseleave', onLeave)
    return () => { el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave) }
  }, [])

  return (
    <div ref={ref}
      className="project-card group relative border border-amber-900/40 rounded-3xl overflow-hidden
                 bg-gradient-to-b from-[#1a0800] to-[#0a0400]
                 hover:border-amber-500/50 transition-colors duration-300 cursor-pointer"
      style={{willChange:'transform'}}>
      <div className="relative h-72 rounded-t-3xl overflow-hidden"
           style={{background:'radial-gradient(ellipse at 50% 60%, #220a00, #060200)'}}>
        <GLBScene path={item.model ? `${import.meta.env.BASE_URL}${item.model.replace(/^\/+/, '')}` : undefined} className="w-full h-full"
          targetSize={2.3} cameraZ={3.6} fov={50}
          baseRotateY={item.baseRotateY} sway={0.25}
          env="sunset" exposure={1.6} ambientIntensity={0.85} />
        <div className="absolute inset-0 opacity-0 group-hover:opacity-25 transition-opacity duration-500 pointer-events-none"
          style={{background:`radial-gradient(circle at 50% 65%,${item.color},transparent 65%)`}}/>
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0400]/70 via-transparent to-transparent pointer-events-none"/>
        <span className="absolute top-4 left-4 text-xs font-mono text-white
                         bg-black/60 backdrop-blur-sm border border-white/20 rounded-full px-3 py-1.5">
          {item.tag}
        </span>
      </div>
      <div className="p-6 pt-5">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-xl font-bold text-amber-100">{item.title}</h3>
          <span className="text-amber-400 font-bold text-lg">{item.price}</span>
        </div>
        <p className="text-amber-200/60 text-sm leading-relaxed mb-5">{item.desc}</p>
        <button type="button" onClick={() => onAdd(item.id)} className="w-full py-3 border border-amber-600/50 hover:bg-amber-600
                           rounded-xl text-amber-300 hover:text-white text-sm font-bold transition-all duration-200">
          Peça agora
        </button>
      </div>
    </div>
  )
}

export default function Projects({ onAdd }) {
  return (
    <section id="menu" className="min-h-screen px-8 py-24 bg-[#0f0600]">
      <div className="max-w-6xl mx-auto">
        <p className="text-amber-400 text-sm font-mono mb-3 tracking-widest uppercase text-center">Tillecu’s Lanches</p>
        <h2 className="text-4xl md:text-5xl font-bold mb-4 text-center text-amber-100">Cardápio</h2>
        <p className="text-amber-200/50 text-center mb-16 max-w-lg mx-auto">
          Hambúrgueres, porções e combos da casa
        </p>
        <div className="grid md:grid-cols-3 gap-8 mb-10">
          {PRODUCTS.filter((item) => FEATURED_PRODUCT_IDS.includes(item.id)).map((item) => <Card key={item.id} item={item} onAdd={onAdd} />)}
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {PRODUCTS.filter((item) => !FEATURED_PRODUCT_IDS.includes(item.id)).map((item) => (
            <div key={item.id} role="button" tabIndex={0} onClick={() => onAdd(item.id)} onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onAdd(item.id) }
            }} aria-label={`Adicionar ${item.title} ao carrinho`} className="flex gap-4 items-center border border-amber-900/20
                         rounded-2xl p-4 bg-[#0f0400] hover:border-amber-500/30
                         hover:-translate-y-1 transition-all duration-300 cursor-pointer">
              <div className="w-14 h-14 rounded-xl bg-amber-900/20 flex items-center justify-center flex-shrink-0 text-2xl text-amber-500"><Icon name="burger" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between mb-0.5">
                  <h4 className="font-bold text-amber-100 text-sm">{item.title}</h4>
                  <span className="text-amber-400 font-bold text-sm ml-2">{item.price}</span>
                </div>
                <span className="text-xs font-mono text-amber-500/70">{item.tag}</span>
                <p className="text-amber-200/50 text-xs mt-1 line-clamp-1">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
