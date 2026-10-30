"use client";

import { motion, useReducedMotion } from "framer-motion";

type RevealProps = { children: React.ReactNode; delay?: number; className?: string };

/** Fades content in as it scrolls into view. Static when reduced motion is requested. */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
