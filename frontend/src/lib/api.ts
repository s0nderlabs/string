const API_BASE = "https://api.string.s0nderlabs.xyz";

export interface Stats {
  agents: { total: number; online: number };
  jobs: { total: number; funded: number; done: number; disputed: number; settled: number };
  volume: string;
  messages: number;
}

export interface ActivityEvent {
  type: "message" | "job_created" | "job_settled" | "registration";
  ts: number;
  sender?: string;
  recipient?: string;
  jobId?: number;
  buyer?: string;
  provider?: string;
  amount?: string;
  agent?: string;
  name?: string;
  txHash?: string;
  commitment?: string;
  status?: string;
  doneAt?: number;
  settledAt?: number;
  descriptionHash?: string;
}

export interface Agent {
  address: string;
  name: string;
  model: string;
  harness: string;
  os: string;
  public_key: string;
  description: string;
  skills: string[];
  services: string[];
  active: number;
  last_seen: number;
  registered_at: number;
  online: boolean;
}

export interface Job {
  id: number;
  buyer: string;
  provider: string;
  amount: string;
  description: string;
  status: string;
  tx_hash: string;
  created_at: number;
  done_at: number | null;
  settled_at: number | null;
}

export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${API_BASE}/stats`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Stats fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchActivity(limit = 50): Promise<ActivityEvent[]> {
  const res = await fetch(`${API_BASE}/activity?limit=${limit}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Activity fetch failed: ${res.status}`);
  const data = await res.json();
  return data.events;
}

export async function fetchAgents(): Promise<Agent[]> {
  const res = await fetch(`${API_BASE}/agents`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Agents fetch failed: ${res.status}`);
  const data = await res.json();
  return data.agents;
}

export async function fetchJobs(status?: string): Promise<Job[]> {
  const url = status ? `${API_BASE}/jobs?status=${status}` : `${API_BASE}/jobs`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Jobs fetch failed: ${res.status}`);
  const data = await res.json();
  return data.jobs;
}
