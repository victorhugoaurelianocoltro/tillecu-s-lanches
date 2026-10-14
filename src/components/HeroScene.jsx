// Hero sin 3D — foto grande a pantalla completa (el usuario pidió quitar el modelo 3D)
const BURGER_URL = 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1920&q=92'

export default function HeroScene() {
  return (
    <div className="absolute inset-0">
      {/* Foto de hamburguesa — opacidad completa */}
      <img src={BURGER_URL} alt="Hambúrguer artesanal"
        className="hero-bg absolute inset-0 w-full h-full object-cover object-center" />
      {/* Gradiente izquierda→derecha para legibilidad del texto */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0d0400]/92 via-[#0d0400]/55 to-transparent" />
      {/* Sutil oscurecido inferior */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0d0400]/70 via-transparent to-transparent" />
    </div>
  )
}
