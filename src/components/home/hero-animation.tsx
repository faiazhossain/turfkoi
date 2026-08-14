"use client"

import { useEffect } from "react"
import {
  useAnimate,
  useReducedMotion,
  stagger,
  type AnimationPlaybackControls,
} from "motion/react"

import { Soccer1SVG } from "./soccer1-svg"
import { Soccer2SVG } from "./soccer2-svg"
import { BasketSVG } from "./basket-svg"

/*
 * Easing library — hand-picked cubic-bézier curves replacing the vanilla
 * "easeOut" used everywhere before. Each has a distinct character:
 *
 *  EXPO_OUT     violent launch, endless glide (GSAP expoOut). For fly-ins.
 *  BACK_OUT     overshoot-and-settle. For pop-ins that need life.
 *  SINE_IN_OUT  symmetrical, breathing. For stroke draw-on (feels sketched).
 *  QUAD_IN      slow start, accelerating. For anticipation / wind-ups.
 */
const EXPO_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1]
const BACK_OUT: [number, number, number, number] = [0.34, 1.56, 0.64, 1]
const SINE_IN_OUT: [number, number, number, number] = [0.37, 0, 0.63, 1]
const QUAD_IN: [number, number, number, number] = [0.11, 0, 0.5, 0]

/**
 * Hero animation cycling through three illustrated phases — soccer (pitch
 * green), soccer alternate (purple), basketball (gold) — using the brand's
 * full accent palette via per-SVG `color` tokens and `currentColor` strokes.
 *
 * Motion-design notes:
 *  - Phases crossfade; nothing hard-cuts.
 *  - The ball winds up (anticipation) before its fly-off, and its opacity
 *    keyframes hold at 1 for two-thirds of the exit so it reads as leaving
 *    the frame rather than fading in place.
 *  - Dissolves stagger in reverse ("un-building") so each phase dismantles
 *    the way it was assembled.
 *  - The basketball (resting frame) breathes with a slow infinite float.
 *  - Strokes draw with sine-in-out and round caps for a sketched quality.
 *
 * Accessibility: prefers-reduced-motion users get the static basketball.
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
    let floatControls: AnimationPlaybackControls | null = null

    // Element arrays (not selector strings) so TS resolves the correct
    // `animate` overload — a bare string collides with the value-keyframe one.
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

    // anime.js `setDashoffset` equivalent: prime each stroke so animating
    // strokeDashoffset length -> 0 draws the line on.
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
        { duration, ease: SINE_IN_OUT, delay: stagger(step, { startDelay }) },
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
      floatControls?.stop()
      floatControls = null
      await animate(select("#soccer1, #soccer2, #basket"), { opacity: 0, y: 0 }, { duration: 0 })
      await animate(select(".soccer1_fill > *"), { x: 0, y: 0, opacity: 1, scale: 1 }, { duration: 0 })
      await animate(select(".soccer1_extra-line > *"), { x: 0, rotate: 0, opacity: 1, scale: 1 }, { duration: 0 })
      await animate(select(".soccer1_line > *"), { opacity: 1 }, { duration: 0 })
      await animate(select(".soccer1ball-line > *"), { opacity: 1 }, { duration: 0 })
      await animate(select(".soccer1ball > g:nth-child(1) > *"), { scale: 1, opacity: 1 }, { duration: 0 })
      await animate(select(".soccer1ball"), { x: 0, rotate: 0, scale: 1, opacity: 1 }, { duration: 0 })
      await animate(select(".soccer2_fill > *"), { scale: 1, opacity: 1 }, { duration: 0 })
      await animate(select(".soccer2_line path, .soccer2_extra-line > *"), { opacity: 1 }, { duration: 0 })
      await animate(select(".basket_fill > *"), { scale: 1, y: 0, opacity: 1 }, { duration: 0 })
      clearDash(
        ".soccer1_line > *, .soccer1ball-line > *, .soccer1_extra-line > *, .soccer2_line path, .soccer2_extra-line > *, .basket_line > *, .basket_extra-line > *",
      )
    }

    const soccer1 = async () => {
      await animate(select("#soccer1"), { opacity: 1 }, { duration: 0.4, ease: SINE_IN_OUT })
      /*
       * Phase 1 runs its layers CONCURRENTLY, matching the original GSAP
       * timeline where all step1 tweens shared one label: fills stream in
       * while linework sketches, the ball assembles over the top. Each
       * element is short and snappy; the overlap is what builds the rhythm.
       */
      // Fills: one legible streak each, 28ms apart — a readable ~4s stream.
      animate(
        select(".soccer1_fill > *"),
        { x: [-4500, 0] },
        { duration: 0.45, ease: EXPO_OUT, delay: stagger(0.028) },
      )
      // Main linework starts sketching as the fills are still streaming.
      const lineDraw = draw(".soccer1_line > *", 0.8, 0.022, 0.5)
      // Decorative groups spin in on a looser, more deliberate stagger.
      animate(
        select(".soccer1_extra-line > *"),
        { x: [-3500, 0], rotate: [-1000, 0] },
        { duration: 1.4, ease: EXPO_OUT, delay: stagger(0.08, { startDelay: 0.8 }) },
      )
      const extraDraw = draw(".soccer1_extra-line > *", 0.7, 0.05, 1.0)
      // Ball facets pop in one by one — the slowest, most deliberate build,
      // it's the hero of this phase.
      animate(
        select(".soccer1ball > g:nth-child(1) > *"),
        { scale: [0, 1] },
        { duration: 0.5, ease: BACK_OUT, delay: stagger(0.14, { startDelay: 1.0 }) },
      )
      const ballDraw = draw(".soccer1ball-line > *", 0.7, 0.1, 1.2)
      // Let every layer land before moving on.
      await Promise.all([lineDraw, extraDraw, ballDraw])
      // Hold the completed frame so the viewer registers it.
      await new Promise((r) => setTimeout(r, 1000))
      // Anticipation: the ball winds back before the launch.
      await animate(
        select(".soccer1ball"),
        { x: -50, rotate: -40 },
        { duration: 0.4, ease: QUAD_IN },
      )
      // Launch: holds opacity for the first two-thirds so the ball visibly
      // exits the frame under speed, rather than fading in place.
      const launch = animate(
        select(".soccer1ball"),
        { x: 2200, rotate: 640, scale: 1.08, opacity: [1, 1, 0] },
        { duration: 2.4, ease: EXPO_OUT },
      )
      // The pitch starts dismantling while the ball is still travelling.
      animate(
        select(".soccer1_fill > *"),
        { opacity: 0 },
        { duration: 0.4, ease: SINE_IN_OUT, delay: stagger(0.006, { from: "last" }) },
      )
      await launch
      // Crossfade tail — not awaited, so soccer2 can enter beneath it.
      animate(select("#soccer1"), { opacity: 0 }, { duration: 0.5, ease: SINE_IN_OUT })
    }

    const soccer2 = async () => {
      await animate(select("#soccer2"), { opacity: 1 }, { duration: 0.3, ease: SINE_IN_OUT })
      animate(
        select(".soccer2_fill > *"),
        { scale: [0, 1] },
        { duration: 0.4, ease: BACK_OUT, delay: stagger(0.02) },
      )
      await draw(".soccer2_extra-line > *", 1.0, 0.02, 0.15)
      // The signature outline is the slowest mark on the page — one long,
      // confident continuous stroke.
      await draw(".soccer2_line path", 2.2, 0.012, 0.2)
      await new Promise((r) => setTimeout(r, 1600))
      // Dismantle in reverse assembly order.
      animate(
        select(".soccer2_fill > *"),
        { opacity: 0 },
        { duration: 0.35, ease: SINE_IN_OUT, delay: stagger(0.006, { from: "last" }) },
      )
      await animate(
        select(".soccer2_line path, .soccer2_extra-line > *"),
        { opacity: 0 },
        { duration: 0.4, ease: SINE_IN_OUT },
      )
      animate(select("#soccer2"), { opacity: 0 }, { duration: 0.4, ease: SINE_IN_OUT })
    }

    const basket = async () => {
      await animate(select("#basket"), { opacity: 1 }, { duration: 0.3, ease: SINE_IN_OUT })
      animate(
        select(".basket_fill > *"),
        { scale: [0, 1], y: [300, 0] },
        { duration: 0.6, ease: BACK_OUT, delay: stagger(-0.006) },
      )
      await draw(".basket_extra-line > *", 1.1, 0.02, 0.1)
      await draw(".basket_line > *", 2.6, 0.008, 0.2)
      // Resting state breathes — barely-there drift keeps the page alive.
      floatControls = animate(
        select("#basket"),
        { y: [0, -10, 0] },
        { duration: 5, ease: SINE_IN_OUT, repeat: Infinity },
      )
    }

    const loop = async () => {
      while (!cancelled) {
        await resetCycle()
        await soccer1()
        if (cancelled) break
        await soccer2()
        if (cancelled) break
        await basket()
        await new Promise((r) => setTimeout(r, 4000))
        if (cancelled) break
        await animate(select("#basket"), { opacity: 0 }, { duration: 0.6, ease: SINE_IN_OUT })
      }
    }

    loop()

    return () => {
      cancelled = true
      floatControls?.stop()
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
