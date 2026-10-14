import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import GLBScene from './GLBScene'

gsap.registerPlugin(ScrollTrigger)

const STATS = [
  { label:'Lanches no cardápio', value:19, suffix:'' },
  { label:'Opções de porções', value:6, suffix:'' },
  { label:'Combos do cardápio', value:6, suffix:'' },
  { label:'Combos promocionais', value:5, suffix:'' },
]

function Counter({ value, suffix, label }) {
  const ref = useRef()
  const done = useRef(false)
  useEffect(() => {
    const trigger = ScrollTrigger.create({
      trigger: ref.current, start:'top 85%',
      onEnter: () => {
        if (done.current) return; done.current = true
        const obj = { val:0 }
        gsap.to(obj, { val:value, duration:2, ease:'power2.out',
          onUpdate: () => { ref.current.querySelector('.num').textContent = Math.round(obj.val)+suffix }
        })
      }
    })
    return () => trigger.kill()
  }, [value, suffix])
  return (
    <div ref={ref} className="border border-amber-500/20 rounded-2xl p-6
                              bg-amber-950/20 hover:border-amber-500/40 transition-colors text-center">
      <p className="num text-4xl font-bold text-amber-400 mb-2">0{suffix}</p>
      <p className="text-amber-200/60 text-sm">{label}</p>
    </div>
  )
}

export default function About() {
  useEffect(() => {
    const ctx = gsap.context(() => {
      const h2 = document.querySelector('#about h2')
      if (h2 && !h2.dataset.split) {
        h2.dataset.split = '1'
        h2.innerHTML = h2.textContent.split(' ').map(w =>
          `<span class="inline-block overflow-hidden"><span class="wi inline-block">${w}</span></span>`
        ).join(' ')
        gsap.from('#about h2 .wi', {
          y:'105%', opacity:0, duration:0.9, stagger:0.12, ease:'power4.out',
          scrollTrigger:{ trigger:'#about', start:'top 72%' },
        })
      }
      gsap.from('#about .about-text p', {
        y:30, opacity:0, duration:0.8, stagger:0.2,
        scrollTrigger:{ trigger:'#about', start:'top 65%' },
      })
      // GLB flotando desde la derecha
      gsap.from('.about-glb', {
        x:120, opacity:0, duration:1.2, ease:'power3.out',
        scrollTrigger:{ trigger:'#about', start:'top 68%' },
      })
    })
    return () => ctx.revert()
  }, [])

  return (
    <section id="about" className="min-h-screen px-8 py-24 bg-[#0d0500]">
      <div className="max-w-6xl mx-auto">

        <div className="grid md:grid-cols-2 gap-16 items-center mb-20">
          {/* Texto */}
          <div className="about-text">
            <p className="text-amber-400 text-sm font-mono mb-3 tracking-widest uppercase">Sobre a Tillecu’s Lanches</p>
            <h2 className="text-4xl md:text-5xl font-bold mb-6 text-amber-100">Hambúrgueres da casa</h2>
            <p className="text-amber-200/70 text-lg leading-relaxed mb-6">
              O cardápio da Tillecu’s Lanches reúne hambúrgueres, porções e combos para pedir pelo delivery.
            </p>
            <p className="text-amber-200/50 leading-relaxed">
              Confira as opções e os valores do cardápio e faça seu pedido pelo telefone.
            </p>
          </div>
          {/* Modelo 3D */}
          <div className="about-glb h-80 md:h-[420px] rounded-3xl overflow-hidden
                          border border-amber-900/20 bg-[#0a0300]">
            <GLBScene path="/hamburger__food_big-hamburger.glb"
              className="w-full h-full" targetSize={2.6}
              cameraZ={4.2} fov={45} env="sunset" exposure={1.5} />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {STATS.map(s => <Counter key={s.label} {...s} />)}
        </div>
      </div>
    </section>
  )
}
