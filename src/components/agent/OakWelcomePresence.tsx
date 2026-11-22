import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { oakMotion } from "@/lib/oakMotion";

/**
 * The first question crossfades the welcome into the transcript: the welcome lifts out of flow and fades while the
 * first turn rises in its place. A new conversation fades the welcome back in. Reduced motion swaps instantly.
 */
export function OakWelcomePresence({ children }: { children: React.ReactNode }) {
  const fade = oakMotion("backdrop", useReducedMotion());
  return <AnimatePresence mode="popLayout" initial={false}>
    {children ? <motion.div key="welcome" className="oak-workspace__welcome" initial={fade.initial} animate={fade.animate} exit={fade.exit} transition={fade.transition}>
      {children}
    </motion.div> : null}
  </AnimatePresence>;
}
