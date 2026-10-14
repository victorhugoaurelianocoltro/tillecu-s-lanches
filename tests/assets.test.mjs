// Comprobaciones de assets que el compilador no puede hacer.
//
// Vite no resuelve las rutas absolutas: un `/modelo.glb` se copia tal cual al
// HTML y solo se descubre que no existe cuando alguien abre la página y ve un
// hueco donde debería estar la hamburguesa. El build pasa igual. Estas pruebas
// miran que cada ruta referenciada exista de verdad en public/.
//
// Sin dependencias: runner de node (`node --test`).

import { strict as assert } from 'node:assert'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const PUBLICO = join(RAIZ, 'public')
const EXTENSIONES = new Set(['.js', '.jsx', '.ts', '.tsx', '.css', '.html'])

function ficheros(dir) {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return ficheros(ruta)
    return EXTENSIONES.has(extname(nombre)) ? [ruta] : []
  })
}

const FUENTES = [
  ...ficheros(join(RAIZ, 'src')),
  join(RAIZ, 'index.html'),
  join(RAIZ, 'functions', 'src', 'catalog.js'),
]

// Rutas absolutas y marcadores Vite basePath a recursos locales.
const PATRON = /['"]((?:\/|%BASE_URL%)[A-Za-z0-9_./-]+\.(?:glb|gltf|png|jpe?g|webp|avif|svg|hdr|mp3|mp4|woff2?))['"]/g

test('el recorrido encuentra fuentes que revisar', () => {
  assert.ok(FUENTES.length > 3, `solo ${FUENTES.length} ficheros: pasaría en vacío`)
})

test('todos los assets referenciados existen en public/', () => {
  const referencias = new Map() // ruta -> quién la usa

  for (const fuente of FUENTES) {
    const texto = readFileSync(fuente, 'utf8')
    for (const m of texto.matchAll(PATRON)) {
      const ruta = m[1]
      if (!referencias.has(ruta)) referencias.set(ruta, [])
      referencias.get(ruta).push(fuente.replace(RAIZ, '.'))
    }
  }

  assert.ok(referencias.size > 0, 'ninguna referencia encontrada: el patrón está roto')

  const rotas = []
  for (const [ruta, usos] of referencias) {
    const rutaPublica = ruta.replace(/^\/|^%BASE_URL%/, '')
    if (!existsSync(join(PUBLICO, rutaPublica))) {
      rotas.push(`${ruta}  (usada en ${[...new Set(usos)].join(', ')})`)
    }
  }

  assert.deepEqual(
    rotas,
    [],
    'Rutas que apuntan a un fichero que no está en public/:\n  ' + rotas.join('\n  '),
  )
})

test('los modelos 3D pesan lo que se espera de un asset servido por red', () => {
  // No es un límite arbitrario: un .glb de más de 25 MB tarda demasiado en una
  // conexión normal y la escena se queda en blanco sin error. Si hace falta
  // subirlo, que sea una decisión consciente y no un descuido de exportación.
  const LIMITE = 25 * 1024 * 1024
  const pesados = readdirSync(PUBLICO)
    .filter((n) => n.endsWith('.glb') || n.endsWith('.gltf'))
    .map((n) => [n, statSync(join(PUBLICO, n)).size])
    .filter(([, bytes]) => bytes > LIMITE)
    .map(([n, bytes]) => `${n}: ${(bytes / 1024 / 1024).toFixed(1)} MB`)

  assert.deepEqual(pesados, [], 'modelos por encima de 25 MB: ' + pesados.join(', '))
})

test('index.html declara el idioma', () => {
  // Sin lang, el lector de pantalla lo pronuncia con la fonética equivocada y
  // el navegador ofrece traducir una página que ya está en el idioma del
  // usuario. Es una línea y se olvida en casi todas las plantillas.
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  assert.match(html, /<html[^>]*\slang=["'][a-zA-Z-]+["']/, 'a <html> le falta lang=')
})
