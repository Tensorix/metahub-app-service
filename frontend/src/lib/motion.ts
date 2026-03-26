/**
 * Shared motion/animation variants
 *
 * Centralized animation constants used across the app.
 * Import from here instead of defining inline variants per-component.
 */

import type { Variants } from 'motion/react';

/* ─── Easing ─── */

export const EASE_SMOOTH = [0.25, 0.4, 0.25, 1] as const;

/* ─── Entry animations ─── */

/** Standard element entry: fade + slide up 8px */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: EASE_SMOOTH },
  },
};

/** Custom-delay variant for sequencing (Login / Register pages) */
export const fadeUpIndexed: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: EASE_SMOOTH },
  }),
};

/* ─── Containers ─── */

/** Parent container that staggers children entry */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
};

/* ─── List items ─── */

/** List/grid item with exit scale */
export const listItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: EASE_SMOOTH },
  },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.2 } },
};

/* ─── Collapse / expand ─── */

/** Height 0 → auto with staggered opacity. Use with AnimatePresence. */
export const collapseVariants: Variants = {
  hidden: {
    height: 0,
    opacity: 0,
    overflow: 'hidden',
    transition: { duration: 0.25, ease: EASE_SMOOTH },
  },
  visible: {
    height: 'auto',
    opacity: 1,
    overflow: 'hidden',
    transition: { duration: 0.25, ease: EASE_SMOOTH },
  },
  exit: {
    height: 0,
    opacity: 0,
    overflow: 'hidden',
    transition: { duration: 0.2, ease: EASE_SMOOTH },
  },
};

/* ─── Directional slides ─── */

/** Chat bubble entry — slides in from left */
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: EASE_SMOOTH },
  },
};

/** Chat bubble entry — slides in from right */
export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: EASE_SMOOTH },
  },
};

/* ─── Tab content ─── */

/** Tab switch transition */
export const tabContent: Variants = {
  hidden: { opacity: 0, x: 8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.25, ease: EASE_SMOOTH },
  },
  exit: {
    opacity: 0,
    x: -8,
    transition: { duration: 0.15, ease: EASE_SMOOTH },
  },
};
