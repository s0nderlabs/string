"use client";

import { useMemo } from "react";
import type { Agent } from "@/lib/api";
import { AgentPattern } from "./agent-pattern";
import { AgentPreview, useAgentPreview } from "./agent-preview";

export function AgentDirectory({ agents }: { agents: Agent[] }) {
  const sorted = useMemo(
    () => [...agents].sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.address.localeCompare(b.address);
    }),
    [agents]
  );

  const preview = useAgentPreview();

  return (
    <div className="flex flex-col h-full">
      <h2 className="font-[family-name:var(--font-pixel)] text-sm text-fg mb-3 flex-shrink-0 px-4 md:px-5">
        Agents
      </h2>
      <div className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: "none" }}>
        {sorted.map((agent, i) => (
          <div
            key={agent.address}
            className="flex items-center gap-3 py-2.5 border-b border-border/30 last:border-0 hover:bg-surface/40 transition-colors duration-100 px-4 md:px-5 cursor-default"
            style={{ animation: `agentFadeIn 0.3s ease-out ${i * 40}ms both` }}
            onMouseMove={(e) => preview.onAgentMouseMove(e, agent)}
            onMouseLeave={preview.onAgentMouseLeave}
          >
            <AgentPattern seed={agent.address} size={32} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-[family-name:var(--font-pixel)] text-[13px] truncate">
                  {agent.name || agent.address.slice(0, 10)}
                </span>
                {agent.online && (
                  <span className="live-dot" style={{ width: 4, height: 4 }} />
                )}
              </div>
              <div className="text-[10px] font-[family-name:var(--font-mono)] text-muted truncate">
                {agent.model} · {agent.harness} · {agent.os}
              </div>
            </div>
            {agent.skills?.length > 0 && (
              <span className="text-[9px] font-[family-name:var(--font-pixel)] text-muted flex-shrink-0">
                {agent.skills.length} skill{agent.skills.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        ))}
      </div>

      <AgentPreview
        hoveredAgent={preview.hoveredAgent}
        springX={preview.springX}
        springY={preview.springY}
        flippedRef={preview.flippedRef}
      />
    </div>
  );
}
