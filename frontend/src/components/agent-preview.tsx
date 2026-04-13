"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import type { Agent } from "@/lib/api";
import { truncateAddress } from "@/lib/utils";
import { AgentPattern } from "./agent-pattern";

const PREVIEW_WIDTH = 320;
const PREVIEW_HEIGHT = 220;
const OFFSET_X = 20;
const FLIP_THRESHOLD = PREVIEW_WIDTH + OFFSET_X + 40;

const springConfig = { damping: 25, stiffness: 200, mass: 0.5 };

export function useAgentPreview() {
  const [hoveredAgent, setHoveredAgent] = useState<Agent | null>(null);
  const flippedRef = useRef(false);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, springConfig);
  const springY = useSpring(mouseY, springConfig);

  const onAgentMouseMove = useCallback(
    (e: React.MouseEvent, agent: Agent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
      flippedRef.current = window.innerWidth - e.clientX < FLIP_THRESHOLD;
      setHoveredAgent((prev) =>
        prev?.address === agent.address ? prev : agent
      );
    },
    [mouseX, mouseY]
  );

  const onAgentMouseLeave = useCallback(() => {
    setHoveredAgent(null);
  }, []);

  return { hoveredAgent, springX, springY, flippedRef, onAgentMouseMove, onAgentMouseLeave };
}

interface AgentPreviewProps {
  hoveredAgent: Agent | null;
  springX: ReturnType<typeof useSpring>;
  springY: ReturnType<typeof useSpring>;
  flippedRef: React.RefObject<boolean>;
}

export function AgentPreview({ hoveredAgent, springX, springY, flippedRef }: AgentPreviewProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const x = useTransform(springX, (val) =>
    flippedRef.current ? val - PREVIEW_WIDTH - OFFSET_X : val + OFFSET_X
  );
  const y = useTransform(springY, (val) => val - PREVIEW_HEIGHT / 2);

  // Don't render on small screens (touch devices)
  if (!mounted || (typeof window !== "undefined" && window.innerWidth < 768)) return null;

  return createPortal(
    <AnimatePresence>
      {hoveredAgent && (
        <motion.div
          key={hoveredAgent.address}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            x,
            y,
            pointerEvents: "none",
            zIndex: 9999,
            width: PREVIEW_WIDTH,
          }}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{
            opacity: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
            scale: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
          }}
          className="rounded-lg overflow-hidden bg-bg border border-border/40 shadow-elevated"
        >
          <div className="p-4">
            {/* Header: pattern + name + status */}
            <div className="flex items-center gap-3 mb-3">
              <AgentPattern seed={hoveredAgent.address} size={40} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-[family-name:var(--font-pixel)] text-[14px] truncate">
                    {hoveredAgent.name || hoveredAgent.address.slice(0, 10)}
                  </span>
                  {hoveredAgent.online && (
                    <span className="live-dot" style={{ width: 5, height: 5 }} />
                  )}
                </div>
                <div className="text-[10px] font-[family-name:var(--font-mono)] text-muted">
                  {hoveredAgent.model} · {hoveredAgent.harness} · {hoveredAgent.os}
                </div>
              </div>
            </div>

            {/* Description */}
            {hoveredAgent.description && (
              <p className="text-[11px] font-[family-name:var(--font-mono)] text-muted leading-relaxed mb-3">
                {hoveredAgent.description}
              </p>
            )}

            {/* Skills */}
            {hoveredAgent.skills?.length > 0 && (
              <div className="mb-3">
                <div className="text-[9px] font-[family-name:var(--font-pixel)] text-muted mb-1.5">Skills</div>
                <div className="flex flex-wrap gap-1.5">
                  {hoveredAgent.skills.map((s) => (
                    <span
                      key={s}
                      className="px-2 py-0.5 text-[10px] font-[family-name:var(--font-mono)] bg-surface rounded text-fg/70"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Services */}
            {hoveredAgent.services?.length > 0 && (
              <div className="mb-3">
                <div className="text-[9px] font-[family-name:var(--font-pixel)] text-muted mb-1.5">Services</div>
                <div className="flex flex-wrap gap-1.5">
                  {hoveredAgent.services.map((s) => (
                    <span
                      key={s}
                      className="px-2 py-0.5 text-[10px] font-[family-name:var(--font-mono)] bg-surface rounded text-fg/70"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Address */}
            <div className="text-[9px] font-[family-name:var(--font-mono)] text-dim">
              {truncateAddress(hoveredAgent.address)}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
