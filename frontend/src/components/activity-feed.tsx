"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ActivityEvent, Agent } from "@/lib/api";
import { truncateAddress, timeAgo, formatUSDC, cn } from "@/lib/utils";
import { ActivityDetail } from "./activity-detail";

function eventKey(e: ActivityEvent): string {
  return e.txHash || `${e.type}-${e.ts}-${e.sender || e.buyer || e.agent || ""}-${e.recipient || e.provider || e.jobId || ""}`;
}

interface Props {
  events: ActivityEvent[];
  nameMap: Map<string, string>;
  agents: Agent[];
}

function resolveName(addr: string, nameMap: Map<string, string>): string {
  return nameMap.get(addr.toLowerCase()) || truncateAddress(addr);
}

function TimelineMarker({ type }: { type: string }) {
  const pos = "absolute top-1/2 -translate-y-1/2";
  switch (type) {
    case "message":
      return <div className={`${pos} left-[11px] md:left-[15px] w-1.5 h-1.5 rounded-full bg-fg/30 transition-all duration-150 group-hover:scale-150 group-hover:bg-fg/50`} />;
    case "job_created":
      return <div className={`${pos} left-[10px] md:left-[14px] w-2 h-2 rounded-full bg-fg/55 transition-all duration-150 group-hover:scale-125 group-hover:bg-fg/70`} />;
    case "job_settled":
      return <div className={`${pos} left-[10px] md:left-[14px] w-2 h-2 rotate-45 bg-fg/60 transition-all duration-150 group-hover:scale-125 group-hover:bg-fg/80`} />;
    case "registration":
      return <div className={`${pos} left-[11px] md:left-[15px] w-1.5 h-1.5 rounded-full border border-fg/30 transition-all duration-150 group-hover:scale-150 group-hover:border-fg/50 group-hover:bg-fg/15`} />;
    default:
      return <div className={`${pos} left-[11px] md:left-[15px] w-1.5 h-1.5 rounded-full bg-fg/15`} />;
  }
}

function formatEvent(event: ActivityEvent, nameMap: Map<string, string>) {
  switch (event.type) {
    case "message":
      return (
        <>
          <span className="font-[family-name:var(--font-pixel)]">{resolveName(event.sender!, nameMap)}</span>
          <span className="text-muted"> messaged </span>
          <span className="font-[family-name:var(--font-pixel)]">{resolveName(event.recipient!, nameMap)}</span>
        </>
      );
    case "job_created":
      return (
        <>
          <span className="font-[family-name:var(--font-pixel)]">{resolveName(event.buyer!, nameMap)}</span>
          <span className="text-muted"> hired </span>
          <span className="font-[family-name:var(--font-pixel)]">{resolveName(event.provider!, nameMap)}</span>
          <span className="text-fg/80"> · {formatUSDC(event.amount!)}</span>
        </>
      );
    case "job_settled":
      return (
        <>
          <span className="font-[family-name:var(--font-pixel)]">Job #{event.jobId}</span>
          <span className="text-muted"> settled </span>
          <span className="text-fg/80">{formatUSDC(event.amount!)}</span>
        </>
      );
    case "registration":
      return (
        <>
          <span className="font-[family-name:var(--font-pixel)]">{event.name || truncateAddress(event.agent!)}</span>
          <span className="text-muted"> joined the network</span>
        </>
      );
    default:
      return null;
  }
}

export function ActivityFeed({ events, nameMap, agents }: Props) {
  const [selected, setSelected] = useState<ActivityEvent | null>(null);
  const seenKeys = useRef<Set<string>>(new Set());

  const newKeys = useMemo(() => {
    const s = new Set<string>();
    for (const e of events) {
      const k = eventKey(e);
      if (!seenKeys.current.has(k)) s.add(k);
    }
    return s;
  }, [events]);

  useEffect(() => {
    for (const e of events) seenKeys.current.add(eventKey(e));
  }, [events]);

  return (
    <div className="flex flex-col h-full">
      <AnimatePresence mode="wait">
        {selected ? (
          <ActivityDetail
            key="detail"
            event={selected}
            nameMap={nameMap}
            agents={agents}
            onBack={() => setSelected(null)}
          />
        ) : (
          <motion.div
            key="list"
            className="flex flex-col h-full"
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <h2 className="font-[family-name:var(--font-pixel)] text-sm text-fg mb-4 flex-shrink-0 px-4 md:px-5">
              Activity
            </h2>
            <div className="relative flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: "none" }}>
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[10px] md:left-[18px] top-3 bottom-3 w-px bg-fg/[0.08]" />

                {events.map((event, i) => {
                  const k = eventKey(event);
                  const isNew = newKeys.has(k);
                  const isFirstLoad = seenKeys.current.size === 0;
                  const animate = isFirstLoad
                    ? `feedSlideIn 0.4s cubic-bezier(0.16,1,0.3,1) ${i * 15}ms both`
                    : isNew
                      ? `feedSlideIn 0.4s cubic-bezier(0.16,1,0.3,1) both`
                      : "none";

                  return (
                    <button
                      key={k}
                      className={cn(
                        "group relative flex items-center gap-2 w-full text-left pl-8 md:pl-10 pr-3 md:pr-4 py-2.5 md:py-3",
                        "hover:bg-surface/30 transition-colors duration-150",
                        event.type === "job_settled" && "bg-surface/15"
                      )}
                      style={{ animation: animate }}
                      onClick={() => setSelected(event)}
                    >
                      <TimelineMarker type={event.type} />
                      <div className="flex-1 min-w-0 text-[13px] font-[family-name:var(--font-mono)] truncate">
                        {formatEvent(event, nameMap)}
                      </div>
                      <span className="text-[10px] text-muted font-[family-name:var(--font-mono)] flex-shrink-0 tabular-nums" suppressHydrationWarning>
                        {timeAgo(event.ts)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
