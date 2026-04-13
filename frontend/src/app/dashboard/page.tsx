import { fetchStats, fetchActivity, fetchAgents } from "@/lib/api";
import type { Stats, ActivityEvent, Agent } from "@/lib/api";
import { LivePanel } from "@/components/live-panel";

export const dynamic = "force-dynamic";

const fallbackStats: Stats = {
  agents: { total: 0, online: 0 },
  jobs: { total: 0, funded: 0, done: 0, disputed: 0, settled: 0 },
  volume: "0",
  messages: 0,
};

export default async function Dashboard() {
  let stats = fallbackStats;
  let activity: ActivityEvent[] = [];
  let agents: Agent[] = [];

  try {
    [stats, activity, agents] = await Promise.all([
      fetchStats(),
      fetchActivity(500),
      fetchAgents(),
    ]);
  } catch (err) {
    console.error("Failed to fetch initial data:", err);
  }

  return (
    <LivePanel
      initialStats={stats}
      initialActivity={activity}
      initialAgents={agents}
    />
  );
}
