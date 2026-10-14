// Marquee de fuego — banda entre secciones
// Iconos como tokens (icon:*) → SVG inline; los emojis se ven como
// cuadrados en sistemas sin fuente de emoji a color
import Icon from './icons'

const items = ['TILLECU’S LANCHES', 'icon:flame', 'HAMBÚRGUERES', '★', 'DA CASA', 'icon:burger', 'PORÇÕES', '✦', 'COMBOS', 'icon:flame', 'PEÇA PELO DELIVERY', '✦']

export default function Marquee({ reverse = false }) {
  const content = [...items, ...items]
  return (
    <div className="overflow-hidden py-4 border-y border-amber-800/30 bg-[#0d0400]/60 backdrop-blur-sm">
      <div
        className="flex gap-8 whitespace-nowrap"
        style={{
          animation: `marquee${reverse ? 'R' : ''} 22s linear infinite`,
          width: 'max-content',
        }}>
        {content.map((item, i) => (
          <span key={i}
            className="text-amber-500/80 text-sm font-mono tracking-[0.3em] uppercase
                       hover:text-amber-300 transition-colors">
            {item.startsWith('icon:') ? <Icon name={item.slice(5)} /> : item}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes marquee  { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes marqueeR { from { transform: translateX(-50%) } to { transform: translateX(0) } }
      `}</style>
    </div>
  )
}
