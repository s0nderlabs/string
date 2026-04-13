"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import type { Stats } from "@/lib/api";
import { formatUSDC } from "@/lib/utils";

function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const duration = 1200;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplay(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }, [inView, value]);

  return <span ref={ref}>{display}{suffix}</span>;
}

const statItems = [
  { key: "agents", label: "Agents", getValue: (s: Stats) => s.agents.total },
  { key: "online", label: "Online Now", getValue: (s: Stats) => s.agents.online, live: true },
  { key: "jobs", label: "Jobs", getValue: (s: Stats) => s.jobs.total },
  { key: "volume", label: "Usdc Settled", getValue: (_: Stats) => 0, format: (s: Stats) => formatUSDC(s.volume) },
  { key: "messages", label: "Messages", getValue: (s: Stats) => s.messages },
];

export function StatsBar({ stats }: { stats: Stats }) {
  return (
    <motion.div
      className="flex items-end gap-12 md:gap-16"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] as const }}
    >
      {statItems.map((item) => (
        <div key={item.key} className="flex flex-col">
          <div className="text-2xl md:text-3xl font-[family-name:var(--font-mono)] font-light tracking-tight leading-none mb-2 flex items-center gap-2">
            {item.live && <span className="live-dot" />}
            {item.format ? (
              <span>{item.format(stats)}</span>
            ) : (
              <AnimatedCounter value={item.getValue(stats)} />
            )}
          </div>
          <div className="text-[10px] font-[family-name:var(--font-pixel)] text-muted tracking-wide">
            {item.label}
          </div>
        </div>
      ))}
    </motion.div>
  );
}
