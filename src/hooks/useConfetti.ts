import confetti from 'canvas-confetti'
import { useEffect } from 'react'

const COLORS = ['#FF4D6D', '#FFB020', '#1FCFB6', '#6B4BE0', '#FFFFFF']

export function useConfetti(active: boolean): void {
  useEffect(() => {
    if (!active) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const fire = (particleRatio: number, opts: confetti.Options) => {
      void confetti({
        colors: COLORS,
        disableForReducedMotion: true,
        particleCount: Math.floor(220 * particleRatio),
        ...opts,
      })
    }

    fire(0.3, { spread: 60, startVelocity: 42, origin: { y: 0.7 } })
    const t1 = window.setTimeout(
      () => fire(0.25, { spread: 90, origin: { x: 0.2, y: 0.7 } }),
      180,
    )
    const t2 = window.setTimeout(
      () => fire(0.25, { spread: 90, origin: { x: 0.8, y: 0.7 } }),
      320,
    )
    const t3 = window.setTimeout(
      () => fire(0.2, { spread: 120, startVelocity: 30, origin: { y: 0.6 } }),
      520,
    )

    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
    }
  }, [active])
}
