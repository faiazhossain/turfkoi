"use client"

import type { CSSProperties, ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"

/**
 * Scroll-into-view reveal. Opacity + translateY only (compositor-friendly),
 * fires once slightly before the element enters the viewport so the motion
 * reads naturally on short mobile viewports. Users with reduced-motion
 * preferences get the content fully visible, instantly.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  style,
}: {
  children: ReactNode
  delay?: number
  className?: string
  style?: CSSProperties
}) {
  const reduced = useReducedMotion()

  if (reduced) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}
