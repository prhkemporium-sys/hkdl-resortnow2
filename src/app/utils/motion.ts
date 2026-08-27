import { animate } from 'motion';

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * Small "pop" on press — scale down and settle back with a light spring bounce.
 * No-op when reduced motion is requested.
 */
export function pressPop(el: Element): void {
  if (!el || prefersReducedMotion()) return;
  animate(
    el as HTMLElement,
    { scaleX: [1, 0.94, 1], scaleY: [1, 0.94, 1] },
    { duration: 0.35, ease: [0.32, 0.72, 0, 1] }
  );
}

/**
 * Card mount spring — translate up + fade in with a critically-damped spring.
 * Uses explicit keyframe arrays so Motion One doesn't have to parse the current
 * CSS transform to figure out the from-state. Reduced motion → no-op.
 */
export function springIn(el: Element, delayMs = 0): void {
  if (!el) return;
  if (prefersReducedMotion()) return; // CSS default is already fully visible

  animate(
    el as HTMLElement,
    {
      opacity: [0, 1],
      y: [12, 0],
      scaleX: [0.98, 1],
      scaleY: [0.98, 1]
    },
    {
      duration: 0.4,
      ease: [0.32, 0.72, 0, 1],
      delay: delayMs / 1000
    }
  );
}
