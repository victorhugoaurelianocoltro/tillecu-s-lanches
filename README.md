# Tillecu’s Lanches — site 3D para hamburgueria

> **Immersive 3D web** · React + Vite + Three.js (R3F) + GSAP · Real 3D models with real-time interaction
> **Status:** Deployed to production · 2026-06

[![Live Demo](https://img.shields.io/badge/Live-burger--house--3d.web.app-f59e0b?style=for-the-badge&logo=firebase&logoColor=white)](https://burger-house-3d.web.app)
[![Stack](https://img.shields.io/badge/Stack-React%20%2B%20Three.js-61dafb?style=for-the-badge&logo=react&logoColor=black)](.)
[![Animation](https://img.shields.io/badge/Animation-GSAP%20ScrollTrigger-88ce02?style=for-the-badge&logo=greensock&logoColor=white)](.)

*[Versión en español más abajo ↓](#-versión-en-español)*

---

## Project Status

| Phase | Status |
|---|---|
| Design and layout (Tailwind, warm theme) | Done |
| 3D model integration (GLB) with React Three Fiber | Done |
| Scroll animations and micro-interactions (GSAP) | Done |
| Production deploy (Firebase Hosting) | Done |

**Current phase:** In production — full site with hero, story, 3D menu and contact.

---

## Project Overview

**Burger House** is a demo landing page for an artisan burger restaurant, built as a portfolio piece to showcase **modern 3D web design**.

The core technical challenge: integrate real 3D models (`.glb` from Sketchfab) into a fast, visually coherent website, with agency-level scroll animations, without resorting to generic templates.

Each burger on the menu is a **real 3D model** that rotates gently in its card, normalized so they all appear the same size regardless of their original geometry.

---

## Key Features

- **Real 3D models (GLB):** loaded with `useGLTF`, cloned per instance and auto-scaled via `THREE.Box3` for consistent visual size.
- **Cinematic hero:** full-screen photo with a Ken Burns zoom + staggered text entrance.
- **Interactive 3D menu:** each item is a model that floats and sways (fixed front view, no spins that reveal the base).
- **GSAP ScrollTrigger animations:** scroll reveals, animated counters, 3D card tilt, text marquees.
- **Custom visual theme:** warm palette (amber/orange/ember red) on a dark background, editorial serif typography.
- **Optimization:** only the GLB models actually used are bundled; visible fallback while they load.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + Vite |
| 3D | Three.js · @react-three/fiber · @react-three/drei |
| Animation | GSAP + ScrollTrigger |
| Styling | Tailwind CSS v4 |
| 3D models | Sketchfab (GLB format, CC licenses) |
| Deployment | Firebase Hosting (Spark plan) |

---

## Repository Structure

```
burger-house-3d/
├── public/
│   ├── hamburger__food_big-hamburger.glb
│   ├── hamburger__game_asset.glb
│   └── tripo-hamburgers_generated_by_ai.glb
├── src/
│   ├── components/
│   │   ├── HeroScene.jsx     # Hero — photo + Ken Burns
│   │   ├── About.jsx         # Story + 3D model + counters
│   │   ├── Projects.jsx      # Menu — cards with 3D models
│   │   ├── Contact.jsx       # Contact + photo with 3D tilt
│   │   ├── GLBScene.jsx      # Reusable 3D loader (clones + auto-scales)
│   │   └── Marquee.jsx       # Looping text band
│   ├── App.jsx               # Layout + global GSAP animations
│   ├── main.jsx
│   └── index.css
├── firebase.json
├── index.html
└── vite.config.js
```

---

## How to Run

```bash
git clone https://github.com/mindset-code/burger-house-3d.git
cd burger-house-3d
npm install
npm run dev          # http://localhost:5173
```

Production build:

```bash
npm run build        # generates dist/
```

---

## Deployment

Deployed on Firebase Hosting (free Spark plan):

```bash
npm run build
firebase deploy --only hosting
```

`firebase.json` points to `dist` with an SPA rewrite to `index.html`.

---

## Key technical decisions

- **GLB scene cloning:** `useGLTF` caches a single instance; reusing the same model in several cards left one empty. The fix is `scene.clone(true)` per instance.
- **Consistent size:** each model is normalized to a fixed `targetSize` by computing its bounding box, so models with different geometry appear the same size.
- **No 360° spin:** models use a gentle sway instead of a full rotation, avoiding showing the base or interior.
- **`lang="es"`** on the HTML to stop the browser translator from altering the text.

---

## Links

- **Live demo:** [burger-house-3d.web.app](https://burger-house-3d.web.app)
- **Web:** [mindset-code.com](https://mindset-code.com)
- **Email:** contacto@mindset-code.com

---
---

# 🇪🇸 Versión en español

# Burger House — Sitio web 3D para restaurante de hamburguesas

> **Web inmersiva 3D** · React + Vite + Three.js (R3F) + GSAP · Modelos 3D reales con interacción en tiempo real
> **Status:** Deployed to production · 2026-06

---

## Estado del proyecto

| Fase | Estado |
|---|---|
| Diseño y maquetación (Tailwind, tema cálido) | Done |
| Integración de modelos 3D (GLB) con React Three Fiber | Done |
| Animaciones de scroll y microinteracciones (GSAP) | Done |
| Deploy a producción (Firebase Hosting) | Done |

**Fase actual:** En producción — sitio completo con hero, historia, carta 3D y contacto.

---

## Resumen del proyecto

**Burger House** es una landing page de demostración para un restaurante de hamburguesas artesanas, construida como pieza de portafolio para mostrar **diseño web 3D moderno**.

El reto técnico central: integrar modelos 3D reales (`.glb` de Sketchfab) en una web rápida y visualmente coherente, con animaciones de scroll de nivel agencia, sin recurrir a plantillas genéricas.

Cada hamburguesa de la carta es un **modelo 3D real** que rota suavemente en su tarjeta, normalizado para que todas se vean del mismo tamaño independientemente de su geometría original.

---

## Características clave

- **Modelos 3D reales (GLB):** carga con `useGLTF`, clonado por instancia y autoescalado vía `THREE.Box3` para tamaño visual consistente.
- **Hero cinematográfico:** foto a pantalla completa con zoom Ken Burns + texto con entrada escalonada.
- **Carta 3D interactiva:** cada plato es un modelo que flota y se balancea (vista frontal fija, sin giros que muestren la base).
- **Animaciones GSAP ScrollTrigger:** revelados al hacer scroll, contadores animados, tilt 3D en tarjetas, marquees de texto.
- **Tema visual propio:** paleta cálida (ámbar/naranja/rojo brasa) sobre fondo oscuro, tipografía serif editorial.
- **Optimización:** solo se incluyen los modelos GLB realmente usados; fallback visible mientras cargan.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | React 19 + Vite |
| 3D | Three.js · @react-three/fiber · @react-three/drei |
| Animación | GSAP + ScrollTrigger |
| Estilos | Tailwind CSS v4 |
| Modelos 3D | Sketchfab (formato GLB, licencias CC) |
| Deployment | Firebase Hosting (plan Spark) |

---

## Cómo ejecutar

```bash
git clone https://github.com/mindset-code/burger-house-3d.git
cd burger-house-3d
npm install
npm run dev          # http://localhost:5173
```

Build de producción:

```bash
npm run build        # genera dist/
```

---

## Despliegue

Desplegado en Firebase Hosting (plan gratuito Spark):

```bash
npm run build
firebase deploy --only hosting
```

`firebase.json` apunta a `dist` con SPA rewrite a `index.html`.

---

## Decisiones técnicas destacadas

- **Clonado de escena GLB:** `useGLTF` cachea una única instancia; reutilizar el mismo modelo en varias tarjetas dejaba una vacía. La solución es `scene.clone(true)` por instancia.
- **Tamaño consistente:** cada modelo se normaliza a un `targetSize` fijo calculando su bounding box, así modelos de distinta geometría se ven del mismo tamaño.
- **Sin giro 360°:** los modelos usan balanceo suave en lugar de rotación completa, evitando mostrar la base o el interior.
- **`lang="es"`** en el HTML para impedir que el traductor del navegador altere los textos.

---

**Ficha del proyecto:** [Restaurante en 3D en mindset-code.com](https://mindset-code.com/codigo/restaurante-3d) — qué problema resuelve, para quién y con qué está construido.

*Mindset & Code · asesoría fiscal y tecnológica · [mindset-code.com](https://mindset-code.com)*
