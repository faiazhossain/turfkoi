"use client"

import { useEffect } from "react"
import { useAnimate, useReducedMotion, stagger } from "motion/react"

import { Soccer1SVG } from "./soccer1-svg"
import { Soccer2SVG } from "./soccer2-svg"
import { BasketSVG } from "./basket-svg"

/**
 * Hero animation that cycles through three illustrated phases (soccer, soccer
 * alternate, basketball) using draw-on strokes, staggered fills, and a fly-off
 * ball. Ported from the original GSAP 2 + anime.js timeline to Framer Motion's
 * `useAnimate` so it stays idiomatic to the rest of the app.
 *
 * Strokes inherit `color: var(--primary)` (pitch green) via `currentColor` on
 * the SVG elements; the container sets that color below.
 *
 * Accessibility: when the user prefers reduced motion we skip the sequence and
 * show the basketball (the natural resting frame) statically.
 */
export function HeroAnimation({ className }: { className?: string }) {
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const reduced = useReducedMotion()

  useEffect(() => {
    const root = scope.current
    if (!root) return

    if (reduced) {
      animate(root.querySelector("#basket")!, { opacity: 1 }, { duration: 0.4 })
      return
    }

    let cancelled = false

    // Resolve a selector to an element array within the scope. We pass element
    // arrays (not selector strings) to `animate` so TypeScript picks the correct
    // overload — a bare string collides with the `animate(value: string, ...)`
    // value-keyframe overload and fails to type-check.
    const select = (selector: string): Element[] =>
      Array.from(root.querySelectorAll(selector))

    const measure = (el: Element): number => {
      const geo = el as SVGGeometryElement
      try {
        const len = geo.getTotalLength()
        if (Number.isFinite(len) && len > 0) return len
      } catch {
        /* ignore — fall back below */
      }
      return 1000
    }

    // Pre-set a stroke dash so animating `strokeDashoffset` from full length
    // to 0 produces a "draw-on" effect. Equivalent to anime.js setDashoffset.
    const prepare = (selector: string) => {
      select(selector).forEach((el) => {
        const len = measure(el)
        const html = el as HTMLElement
        html.style.strokeDasharray = `${len}`
        html.style.strokeDashoffset = `${len}`
      })
    }

    const draw = (
      selector: string,
      duration: number,
      step: number,
      startDelay = 0,
    ) => {
      const els = select(selector)
      prepare(selector)
      return animate(
        els,
        { strokeDashoffset: 0 },
        { duration, ease: "easeInOut", delay: stagger(step, { startDelay }) },
      )
    }

    const clearDash = (selector: string) => {
      select(selector).forEach((el) => {
        const html = el as HTMLElement
        html.style.strokeDasharray = ""
        html.style.strokeDashoffset = ""
      })
    }

    const resetCycle = async () => {
      await animate(select("#soccer1, #soccer2, #basket"), { opacity: 0 }, { duration: 0 })
      await animate(select(".soccer1_fill > *"), { x: 0, y: 0, opacity: 1, scale: 1 }, { duration: 0 })
      await animate(select(".soccer1_extra-line > *"), { x: 0, rotate: 0, opacity: 1, scale: 1 }, { duration: 0 })
      await animate(select(".soccer1_line > *"), { opacity: 1 }, { duration: 0 })
      await animate(select(".soccer1ball-line > *"), { opacity: 1 }, { duration: 0 })
      await animate(select(".soccer1ball > g:nth-child(1) > *"), { scale: 1, opacity: 1 }, { duration: 0 })
      await animate(select(".soccer1ball"), { x: 0, rotate: 0, opacity: 1 }, { duration: 0 })
      await animate(select(".soccer2_fill > *"), { scale: 1, opacity: 1 }, { duration: 0 })
      await animate(select(".soccer2_line path, .soccer2_extra-line > *"), { opacity: 1 }, { duration: 0 })
      await animate(select(".basket_fill > *"), { scale: 1, y: 0, opacity: 1 }, { duration: 0 })
      clearDash(
        ".soccer1_line > *, .soccer1ball-line > *, .soccer1_extra-line > *, .soccer2_line path, .soccer2_extra-line > *, .basket_line > *, .basket_extra-line > *",
      )
    }

    const soccer1 = async () => {
      await animate(select("#soccer1"), { opacity: 1 }, { duration: 0.2 })
      // Slide the low-opacity fill polygons in from the left edge.
      animate(
        select(".soccer1_fill > *"),
        { x: [-4500, 0] },
        { duration: 0.6, ease: "easeOut", delay: stagger(0.02) },
      )
      // Draw the main line work.
      await draw(".soccer1_line > *", 0.5, 0.02, 0.2)
      // Fly the decorative groups in from off-canvas with a spin.
      animate(
        select(".soccer1_extra-line > *"),
        { x: [-3500, 0], rotate: [-1000, 0] },
        { duration: 1.2, ease: "easeOut", delay: stagger(0.04) },
      )
      await draw(".soccer1_extra-line > *", 0.5, 0.03, 0.3)
      // Pop the soccer-ball polygons in.
      animate(
        select(".soccer1ball > g:nth-child(1) > *"),
        { scale: [0, 1] },
        { duration: 0.5, ease: "easeOut", delay: stagger(0.15) },
      )
      await draw(".soccer1ball-line > *", 0.5, 0.1, 0.2)
      // Brief hold, then spin the ball off-screen.
      await new Promise((r) => setTimeout(r, 600))
      await animate(
        select(".soccer1ball"),
        { x: 2000, rotate: 760, opacity: 0 },
        { duration: 2.4, ease: "easeOut" },
      )
      await animate(select(".soccer1_fill > *"), { opacity: 0 }, { duration: 0.4 })
      await animate(select("#soccer1"), { opacity: 0 }, { duration: 0.3 })
    }

    const soccer2 = async () => {
      await animate(select("#soccer2"), { opacity: 1 }, { duration: 0.2 })
      animate(
        select(".soccer2_fill > *"),
        { scale: [0, 1] },
        { duration: 0.3, ease: "easeOut", delay: stagger(0.025) },
      )
      await draw(".soccer2_extra-line > *", 1.2, 0.02, 0.2)
      await draw(".soccer2_line path", 2.0, 0.015, 0.4)
      await new Promise((r) => setTimeout(r, 1400))
      await animate(select(".soccer2_fill > *"), { opacity: 0 }, { duration: 0.4 })
      await animate(select(".soccer2_line path, .soccer2_extra-line > *"), { opacity: 0 }, { duration: 0.4 })
      await animate(select("#soccer2"), { opacity: 0 }, { duration: 0.3 })
    }

    const basket = async () => {
      await animate(select("#basket"), { opacity: 1 }, { duration: 0.2 })
      animate(
        select(".basket_fill > *"),
        { scale: [0, 1], y: [300, 0] },
        { duration: 0.5, ease: "easeOut", delay: stagger(-0.008) },
      )
      await draw(".basket_extra-line > *", 1.2, 0.02, 0.1)
      await draw(".basket_line > *", 2.5, 0.01, 0.3)
    }

    const loop = async () => {
      while (!cancelled) {
        await resetCycle()
        await soccer1()
        if (cancelled) break
        await soccer2()
        if (cancelled) break
        await basket()
        await new Promise((r) => setTimeout(r, 3500))
      }
    }

    loop()

    return () => {
      cancelled = true
    }
  }, [scope, animate, reduced])

  return (
    <div ref={scope} className={className} style={{ color: "var(--primary)" }}>
      <Soccer1SVG />
      <Soccer2SVG />
      <BasketSVG />
    </div>
  )
}
