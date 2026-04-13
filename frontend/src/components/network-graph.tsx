"use client";

import { useRef, useEffect } from "react";
import type { Agent, ActivityEvent } from "@/lib/api";

interface Conn { from: string; to: string; weight: number }
interface GNode {
  id: string; name: string;
  online: boolean; isJudge: boolean; isHub: boolean;
  baseX: number; baseY: number; // settled position
  r: number; phX: number; phY: number;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function deriveConns(events: ActivityEvent[]): Conn[] {
  const m = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "message" || !e.sender || !e.recipient) continue;
    const k = [e.sender, e.recipient].sort().join(":");
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].map(([k, w]) => {
    const [from, to] = k.split(":");
    return { from, to, weight: w };
  });
}

export function NetworkGraph({ agents, events }: { agents: Agent[]; events: ActivityEvent[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef({ agents, events });
  dataRef.current = { agents, events };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let destroyed = false;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const t0 = performance.now();

    let nodes: GNode[] = [];
    let nodeMap = new Map<string, GNode>();
    let conns: Conn[] = [];
    let maxW = 1;
    let prevAddrKey = "";
    let prevEvents: ActivityEvent[] | null = null;

    function rebuild() {
      const { agents, events } = dataRef.current;
      conns = deriveConns(events);
      maxW = Math.max(1, ...conns.map(c => c.weight));

      const cc = new Map<string, number>();
      const ca = new Set<string>();
      for (const c of conns) {
        cc.set(c.from, (cc.get(c.from) || 0) + c.weight);
        cc.set(c.to, (cc.get(c.to) || 0) + c.weight);
        ca.add(c.from); ca.add(c.to);
      }
      const hubAddr = agents.length > 0
        ? agents.reduce((b, a) => (cc.get(a.address) || 0) > (cc.get(b.address) || 0) ? a : b, agents[0]).address
        : "";
      const judgeAddr = agents.find(a => a.skills?.includes("dispute-resolution") || a.name?.toLowerCase() === "judge")?.address;

      const addrKey = [...agents].map(a => a.address).sort().join(",");
      if (addrKey !== prevAddrKey) {
        prevAddrKey = addrKey;

        // Build physics nodes
        const sorted = [...agents].sort((a, b) => a.address.localeCompare(b.address));
        const physNodes = sorted.map((a, i, arr) => {
          const isHub = a.address === hubAddr;
          const isConn = ca.has(a.address);
          const angle = (i / arr.length) * Math.PI * 2 - Math.PI / 2;
          const initR = isHub ? 0 : isConn ? 0.12 : 0.25;
          return {
            id: a.address, x: 0.5 + Math.cos(angle) * initR, y: 0.5 + Math.sin(angle) * initR,
            vx: 0, vy: 0, isHub, isConn, r: isHub ? 8 : isConn ? 5.5 : 4,
          };
        });
        const pm = new Map(physNodes.map(n => [n.id, n]));

        // Pre-settle physics completely
        for (let i = 0; i < 300; i++) {
          for (const a of physNodes) {
            a.vx += (0.5 - a.x) * (a.isHub ? 0.01 : 0.004);
            a.vy += (0.5 - a.y) * (a.isHub ? 0.01 : 0.004);
            for (const b of physNodes) {
              if (a === b) continue;
              const dx = a.x - b.x, dy = a.y - b.y;
              const d2 = dx * dx + dy * dy + 0.0001;
              const sf = (a.r + b.r) * 0.05;
              a.vx += dx * 0.001 * sf / d2;
              a.vy += dy * 0.001 * sf / d2;
            }
          }
          for (const conn of conns) {
            const a = pm.get(conn.from), b = pm.get(conn.to);
            if (!a || !b) continue;
            const f = 0.01 * (conn.weight / maxW);
            a.vx += (b.x - a.x) * f; a.vy += (b.y - a.y) * f;
            b.vx -= (b.x - a.x) * f; b.vy -= (b.y - a.y) * f;
          }
          for (const n of physNodes) {
            n.vx *= 0.75; n.vy *= 0.75;
            n.x += n.vx; n.y += n.vy;
            n.x = Math.max(0.08, Math.min(0.92, n.x));
            n.y = Math.max(0.08, Math.min(0.92, n.y));
          }
        }

        // Store settled positions as base
        nodes = sorted.map((a, i) => {
          const pn = physNodes[i];
          const h = hash(a.address);
          return {
            id: a.address, name: a.name || a.address.slice(0, 6),
            online: a.online, isJudge: a.address === judgeAddr, isHub: pn.isHub,
            baseX: pn.x, baseY: pn.y,
            r: pn.r,
            phX: (h % 100) * 0.063,
            phY: ((h >> 8) % 100) * 0.063,
          };
        });
        nodeMap = new Map(nodes.map(n => [n.id, n]));
      } else {
        // Update online/name only
        const agentMap = new Map(agents.map(a => [a.address, a]));
        for (const n of nodes) {
          const a = agentMap.get(n.id);
          if (a) {
            n.online = a.online;
            n.name = a.name || a.address.slice(0, 6);
          }
        }
      }
    }

    rebuild();
    prevEvents = dataRef.current.events;

    function resize() {
      const r = canvas!.parentElement!.getBoundingClientRect();
      canvas!.width = r.width * dpr; canvas!.height = r.height * dpr;
      canvas!.style.width = r.width + "px"; canvas!.style.height = r.height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);
    let lastCheck = 0;

    function render() {
      if (destroyed) return;
      const time = (performance.now() - t0) * 0.001;

      if (time - lastCheck > 1) {
        lastCheck = time;
        const { events } = dataRef.current;
        if (events !== prevEvents) {
          prevEvents = events;
          rebuild();
        }
      }

      const w = canvas!.width / dpr, h = canvas!.height / dpr;
      const dark = document.documentElement.classList.contains("dark");
      const fg = dark ? "240,240,243" : "10,10,10";
      const onlineGreen = dark ? "107,158,124" : "74,122,91";

      ctx.clearRect(0, 0, w, h);

      // ── Compute floating positions ──
      // Multi-frequency sine displacement for organic, non-repetitive drift
      const amp = 4; // pixels of drift
      const pos = new Map<string, { x: number; y: number }>();
      for (const n of nodes) {
        const fx = Math.sin(time * 0.2 + n.phX) * amp
                 + Math.sin(time * 0.13 + n.phX * 1.7) * amp * 0.6
                 + Math.sin(time * 0.07 + n.phY * 2.3) * amp * 0.3;
        const fy = Math.cos(time * 0.17 + n.phY) * amp
                 + Math.cos(time * 0.11 + n.phY * 1.4) * amp * 0.6
                 + Math.cos(time * 0.05 + n.phX * 1.9) * amp * 0.3;
        pos.set(n.id, { x: n.baseX * w + fx, y: n.baseY * h + fy });
      }

      // ── Edges ──
      for (const conn of conns) {
        const pa = pos.get(conn.from), pb = pos.get(conn.to);
        if (!pa || !pb) continue;
        const alpha = 0.1 + (conn.weight / maxW) * 0.2;
        const lineW = 0.8 + (conn.weight / maxW) * 2;
        const hue = hash(conn.from + conn.to) % 360;

        // Glow
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
        ctx.strokeStyle = dark
          ? `hsla(${hue}, 18%, 72%, ${alpha * 0.15})`
          : `hsla(${hue}, 22%, 48%, ${alpha * 0.15})`;
        ctx.lineWidth = lineW + 4;
        ctx.lineCap = "round";
        ctx.stroke();

        // Core
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
        ctx.strokeStyle = dark
          ? `hsla(${hue}, 18%, 72%, ${alpha})`
          : `hsla(${hue}, 22%, 48%, ${alpha})`;
        ctx.lineWidth = lineW;
        ctx.stroke();
      }

      // ── Nodes ──
      for (const n of nodes) {
        const p = pos.get(n.id)!;
        const nx = p.x, ny = p.y;

        // Online green ring
        if (n.online) {
          ctx.beginPath(); ctx.arc(nx, ny, n.r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${onlineGreen},0.35)`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Filled dot
        ctx.beginPath(); ctx.arc(nx, ny, n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.online
          ? `rgba(${fg},${n.isHub ? 0.25 : 0.18})`
          : `rgba(${fg},${n.isHub ? 0.15 : 0.1})`;
        ctx.fill();

        // Name
        ctx.font = `9px "GeistMono", monospace`;
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillStyle = `rgba(${fg},${n.isHub ? 0.6 : n.online ? 0.45 : 0.3})`;
        ctx.fillText(n.name, nx, ny + n.r + 5);
      }

      requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
    return () => { destroyed = true; window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}
