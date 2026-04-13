"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ThemeToggle } from "./theme-toggle";
import { ActivityFeed } from "./activity-feed";
import { AgentDirectory } from "./agent-directory";
import { NetworkGraph } from "./network-graph";
import { fetchStats, fetchActivity, fetchAgents } from "@/lib/api";
import { formatUSDC } from "@/lib/utils";
import type { Stats, ActivityEvent, Agent } from "@/lib/api";

export function LivePanel({
  initialStats,
  initialActivity,
  initialAgents,
}: {
  initialStats: Stats;
  initialActivity: ActivityEvent[];
  initialAgents: Agent[];
}) {
  const [stats, setStats] = useState(initialStats);
  const [activity, setActivity] = useState(initialActivity);
  const [agents, setAgents] = useState(initialAgents);

  const nameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents) {
      if (a.name) map.set(a.address.toLowerCase(), a.name);
    }
    return map;
  }, [agents]);

  useEffect(() => {
    const si = setInterval(async () => { try { setStats(await fetchStats()); } catch {} }, 5_000);
    const ai = setInterval(async () => { try { setActivity(await fetchActivity(500)); } catch {} }, 5_000);
    const gi = setInterval(async () => { try { setAgents(await fetchAgents()); } catch {} }, 5_000);
    return () => { clearInterval(si); clearInterval(ai); clearInterval(gi); };
  }, []);

  return (
    <div className="bg-bg flex flex-col h-dvh">
      {/* Top bar: logo + inline stats + theme toggle */}
      <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-border flex-shrink-0">
        <Link href="/" className="font-[family-name:var(--font-pixel)] text-lg md:text-xl tracking-tight hover:opacity-70 transition-opacity">
          string
        </Link>

        <div className="flex items-center gap-4 md:gap-6">
          {/* Stats — hidden on mobile, visible on md+ */}
          <motion.div
            className="hidden md:flex items-center gap-5 text-[12px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <span className="flex items-center gap-1">
              <span className="font-[family-name:var(--font-pixel)] text-fg">{stats.agents.total}</span>
              <span className="text-muted font-[family-name:var(--font-mono)]">agents</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="live-dot" style={{ width: 4, height: 4 }} />
              <span className="font-[family-name:var(--font-pixel)] text-fg">{stats.agents.online}</span>
              <span className="text-muted font-[family-name:var(--font-mono)]">online</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="font-[family-name:var(--font-pixel)] text-fg">{stats.jobs.total}</span>
              <span className="text-muted font-[family-name:var(--font-mono)]">jobs</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="font-[family-name:var(--font-pixel)] text-fg">{formatUSDC(stats.volume)}</span>
              <span className="text-muted font-[family-name:var(--font-mono)]">settled</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="font-[family-name:var(--font-pixel)] text-fg">{stats.messages}</span>
              <span className="text-muted font-[family-name:var(--font-mono)]">msgs</span>
            </span>
          </motion.div>

          {/* Mobile: compact stats (just key numbers) */}
          <div className="flex md:hidden items-center gap-3 text-[11px]">
            <span className="font-[family-name:var(--font-pixel)] text-fg">{stats.agents.total} <span className="text-muted">agents</span></span>
            <span className="flex items-center gap-1">
              <span className="live-dot" style={{ width: 3, height: 3 }} />
              <span className="font-[family-name:var(--font-pixel)] text-fg">{stats.agents.online}</span>
            </span>
          </div>

          <ThemeToggle />
        </div>
      </div>

      {/* Main content — side by side on desktop, stacked on mobile */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row md:divide-x divide-border overflow-y-auto md:overflow-hidden">
        {/* Activity feed */}
        <div className="min-h-[50vh] md:min-h-0 md:h-auto w-full md:w-[35%] pt-4 border-b md:border-b-0 border-border">
          <ActivityFeed events={activity} nameMap={nameMap} agents={agents} />
        </div>

        {/* Agent list + Network graph */}
        <div className="w-full md:w-[65%] flex flex-col">
          <div className="flex-shrink-0 pt-4 border-b border-border max-h-[50%]">
            <AgentDirectory agents={agents} />
          </div>
          <div className="flex-1 min-h-[250px] md:min-h-0 flex flex-col">
            <h2 className="font-[family-name:var(--font-pixel)] text-sm text-fg px-4 md:px-5 pt-4 pb-2 flex-shrink-0">
              Network
            </h2>
            <div className="flex-1 min-h-[200px] md:min-h-0">
              <NetworkGraph agents={agents} events={activity} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
