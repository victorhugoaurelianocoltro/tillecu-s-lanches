import Icon from './icons'
import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

// Hamburguesa real — la misma del hero
const IMG = 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=85'

export default function Contact() {
  const ref = useRef()
  useEffect(() => {
    const el = ref.current; if (!el) return
    const onMove = e => {
      const r = el.getBoundingClientRect()
      gsap.to(el, { rotateY:(e.clientX-r.left)/r.width*16-8,
        rotateX:-(e.clientY-r.top)/r.height*12+6,
        transformPerspective:1000, duration:0.5, ease:'power1.out' })
    }
    const onLeave = () => gsap.to(el, { rotateY:0, rotateX:0, duration:1, ease:'elastic.out(1,.5)' })
    el.addEventListener('mousemove', onMove); el.addEventListener('mouseleave', onLeave)
    return () => { el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave) }
  }, [])

  return (
    <section id="contact" className="min-h-screen flex items-center px-8 py-24 bg-[#0a0400]">
      <div className="max-w-5xl mx-auto w-full grid md:grid-cols-2 gap-16 items-center">
        <div ref={ref} className="contact-img relative h-96 md:h-[480px] rounded-3xl overflow-hidden
                     border border-amber-900/30 order-2 md:order-1 cursor-pointer"
          style={{willChange:'transform', transformStyle:'preserve-3d'}}>
          <img src={IMG} alt="Hambúrguer artesanal" className="w-full h-full object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0400]/50 to-transparent" />
          <div className="absolute bottom-6 left-6 right-6 p-4 rounded-2xl
                          bg-black/50 backdrop-blur-md border border-amber-500/20">
            <p className="text-amber-400 text-xs font-mono mb-1 uppercase tracking-wider">Horário</p>
            <p className="text-white font-semibold">Horário a confirmar</p>
          </div>
        </div>

        <div className="contact-content order-1 md:order-2">
          <p className="text-amber-400 text-sm font-mono mb-3 tracking-widest uppercase">Onde estamos</p>
          <h2 className="text-4xl md:text-5xl font-bold mb-6 text-amber-100">Bateu a fome?</h2>
          <p className="text-amber-200/60 text-lg mb-2">Peça seu lanche pelo delivery da Tillecu’s Lanches.</p>
          <p className="text-amber-200/50 mb-8 flex items-center gap-2">
            <span className="text-amber-500"><Icon name="pin" /></span> Rua Marquês de Herval, 44, Jandira
          </p>
          <div className="space-y-3 mb-10">
            {[['Telefone','(11) 99763-7482'],['E-mail','A confirmar'],['Entrega','Peça pelo delivery']].map(([l,v]) => (
              <div key={l} className="flex justify-between items-center py-3 border-b border-amber-900/30">
                <span className="text-amber-500/70 text-sm font-mono uppercase tracking-wider">{l}</span>
                <span className="text-amber-100 text-sm">{v}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-4">
            <a href="tel:+5511997637482"
              className="px-7 py-4 bg-amber-600 hover:bg-amber-500 rounded-xl font-bold
                         text-white hover:-translate-y-1 transition-all shadow-lg shadow-amber-900/40">
              Ligue agora
            </a>
            <a href="#menu"
              className="px-7 py-4 border-2 border-amber-500/30 hover:border-amber-400
                         rounded-xl text-amber-200 hover:-translate-y-1 transition-all">
              Ver cardápio
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
