import { useRef } from "react";
import { motion, useInView } from "framer-motion";

type Props = {
  children: React.ReactNode;
  className?: string;
  /** delay in seconds */
  delay?: number;
  /** y-offset in px */
  y?: number;
};

export default function ScrollReveal({ children, className, delay = 0, y = 10 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px -10% 0px" });

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.55, ease: [0.21, 0.61, 0.35, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

