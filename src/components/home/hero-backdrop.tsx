"use client"

import { useRef } from "react"
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react"

/**
 * Decorative depth layer behind the hero: two radial glow orbs (no
 * `filter: blur` — large blur areas are expensive on mobile GPUs). The orbs
 * drift at different rates on scroll for a subtle parallax; transform-only,
 * hero-scoped, out of flow (zero CLS). The layer extends past the hero's
 * top/bottom so the glows bleed into neighbouring sections and fade into the
 * page background with no visible cut line. Reduced-motion users get the
 * static layer with no drift.
 */
export function HeroBackdrop() {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  })
  const orbGreenY = useTransform(scrollYProgress, [0, 1], [0, 90])
  const orbPurpleY = useTransform(scrollYProgress, [0, 1], [0, -60])

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute -top-48 inset-x-0 -bottom-64 -z-10 overflow-hidden"
    >
      <motion.div
        className="absolute -top-24 right-[-10%] h-[70vw] w-[70vw] max-h-[720px] max-w-[720px] rounded-full"
        style={{
          y: reduced ? 0 : orbGreenY,
          background:
            "radial-gradient(circle, rgb(0 230 118 / 0.09) 0%, rgb(0 230 118 / 0.04) 35%, rgb(0 230 118 / 0.015) 55%, transparent 78%)",
          willChange: reduced ? undefined : "transform",
        }}
      />
      <motion.div
        className="absolute -bottom-32 left-[-12%] h-[65vw] w-[65vw] max-h-[680px] max-w-[680px] rounded-full"
        style={{
          y: reduced ? 0 : orbPurpleY,
          background:
            "radial-gradient(circle, rgb(116 83 250 / 0.09) 0%, rgb(116 83 250 / 0.04) 35%, rgb(116 83 250 / 0.015) 55%, transparent 78%)",
          willChange: reduced ? undefined : "transform",
        }}
      />
    </div>
  )
}
