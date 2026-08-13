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
 * Reduced motion → instant final state.
 */
export function springIn(el: Element, delayMs = 0): void {
  if (!el) return;
  const target = el as HTMLElement;

  if (prefersReducedMotion()) {
    target.style.opacity = '1';
    target.style.transform = 'none';
    return;
  }

  // Seed the initial state so Motion animates *from* here to the target.
  target.style.opacity = '0';
  target.style.transform = 'translateY(12px) scale(0.98)';

  animate(
    target,
    { opacity: 1, y: 0, scaleX: 1, scaleY: 1 },
    {
      type: 'spring',
      bounce: 0.15,
      duration: 0.4,
      delay: delayMs / 1000
    }
  );
}
