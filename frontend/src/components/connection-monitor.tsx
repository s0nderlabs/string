"use client";

import { useRef, useEffect } from "react";
import type { Agent, ActivityEvent } from "@/lib/api";

const BRAILLE_FLOW = "⠁⠂⠄⡀⢀⠠⠐⠈⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷";

interface ConnPair {
  fromName: string; toName: string;
  fromAddr: string; toAddr: string;
  weight: number;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function derivePairs(events: ActivityEvent[], agents: Agent[]): ConnPair[] {
  const nameMap = new Map<string, string>();
  for (const a of agents) if (a.name) nameMap.set(a.address.toLowerCase(), a.name);

  const map = new Map<string, { from: string; to: string; weight: number }>();
  for (const e of events) {
    if (e.type !== "message" || !e.sender || !e.recipient) continue;
    const key = [e.sender, e.recipient].sort().join(":");
    const ex = map.get(key);
    if (ex) ex.weight++;
    else { const [a, b] = key.split(":"); map.set(key, { from: a, to: b, weight: 1 }); }
  }
  return [...map.values()]
    .sort((a, b) => b.weight - a.weight)
    .map(c => ({
      fromAddr: c.from, toAddr: c.to,
      fromName: nameMap.get(c.from.toLowerCase()) || c.from.slice(0, 8),
      toName: nameMap.get(c.to.toLowerCase()) || c.to.slice(0, 8),
      weight: c.weight,
    }));
}

export function ConnectionMonitor({ agents, events }: { agents: Agent[]; events: ActivityEvent[] }) {
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

    let prevAgents: Agent[] | null = null;
    let prevEvents: ActivityEvent[] | null = null;
    let pairs: ConnPair[] = [];
    let maxWeight = 1;

    function rebuild() {
      const { agents, events } = dataRef.current;
      pairs = derivePairs(events, agents);
      maxWeight = Math.max(1, ...pairs.map(p => p.weight));
    }

    rebuild();
    prevAgents = dataRef.current.agents;
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
        const { agents, events } = dataRef.current;
        if (agents !== prevAgents || events !== prevEvents) {
          prevAgents = agents; prevEvents = events;
          rebuild();
        }
      }

      const w = canvas!.width / dpr, h = canvas!.height / dpr;
      const dark = document.documentElement.classList.contains("dark");
      const fg = dark ? "240,240,243" : "10,10,10";

      ctx.clearRect(0, 0, w, h);

      if (pairs.length === 0) {
        ctx.font = `11px "GeistMono", monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(${fg},0.2)`;
        ctx.fillText("No connections yet", w / 2, h / 2);
        requestAnimationFrame(render);
        return;
      }

      const padX = 14;
      const padY = 12;
      const rowH = Math.min(42, Math.max(28, (h - padY * 2) / pairs.length));
      const nameFont = 12;
      const brailleFont = 11;
      const brailleCharW = brailleFont * 0.65;

      // Measure name widths
      ctx.font = `${nameFont}px "GeistMono", monospace`;
      let maxFromW = 0, maxToW = 0;
      for (const p of pairs) {
        maxFromW = Math.max(maxFromW, ctx.measureText(p.fromName).width);
        maxToW = Math.max(maxToW, ctx.measureText(p.toName).width);
      }
      maxFromW = Math.min(maxFromW, w * 0.2);
      maxToW = Math.min(maxToW, w * 0.2);

      ctx.font = `10px "GeistMono", monospace`;
      const countW = ctx.measureText("9999").width + 6;

      const streamLeft = padX + maxFromW + 16;
      const streamRight = w - padX - maxToW - 16 - countW;
      const streamW = streamRight - streamLeft;
      const totalH = pairs.length * rowH;
      const startY = Math.max(padY, (h - totalH) / 2);

      for (let ri = 0; ri < pairs.length; ri++) {
        const p = pairs[ri];
        const cy = startY + ri * rowH + rowH / 2;
        const intensity = p.weight / maxWeight;

        // Muted hue per connection
        const hue = hash(p.fromAddr + p.toAddr) % 360;

        // From name
        ctx.font = `${nameFont}px "GeistMono", monospace`;
        ctx.textAlign = "right"; ctx.textBaseline = "middle";
        ctx.fillStyle = `rgba(${fg},${0.5 + intensity * 0.4})`;
        ctx.fillText(p.fromName, padX + maxFromW, cy, maxFromW);

        // To name
        ctx.textAlign = "left";
        ctx.fillText(p.toName, streamRight + 16, cy, maxToW);

        // Count
        ctx.font = `10px "GeistMono", monospace`;
        ctx.textAlign = "right";
        ctx.fillStyle = `rgba(${fg},0.25)`;
        ctx.fillText(`${p.weight}`, w - padX, cy);

        // Stream track
        ctx.beginPath();
        ctx.moveTo(streamLeft, cy); ctx.lineTo(streamRight, cy);
        ctx.strokeStyle = dark
          ? `hsla(${hue}, 12%, 50%, 0.06)`
          : `hsla(${hue}, 15%, 50%, 0.06)`;
        ctx.lineWidth = rowH * 0.4;
        ctx.lineCap = "round";
        ctx.stroke();

        // Animated braille stream
        const speed = 25 + intensity * 50;
        const charCount = Math.floor(streamW / brailleCharW);
        const phaseHash = hash(p.fromAddr + p.toAddr);

        ctx.font = `${brailleFont}px "GeistMono", monospace`;
        ctx.textAlign = "left"; ctx.textBaseline = "middle";

        for (let ci = 0; ci < charCount; ci++) {
          const x = streamLeft + ci * brailleCharW;
          const scroll = time * speed / brailleCharW;
          const charIdx = Math.floor(ci + scroll + phaseHash) % BRAILLE_FLOW.length;
          const char = BRAILLE_FLOW[Math.abs(charIdx) % BRAILLE_FLOW.length];
          const wave1 = Math.sin((ci / charCount) * Math.PI * 3 - time * 2 + phaseHash * 0.1) * 0.5 + 0.5;
          const wave2 = Math.sin((ci / charCount) * Math.PI * 5 - time * 1.3 + phaseHash * 0.2) * 0.5 + 0.5;
          const envelope = Math.sin((ci / charCount) * Math.PI) * 0.3 + 0.7;
          const alpha = (0.06 + wave1 * wave2 * intensity * 0.35) * envelope;

          if (alpha > 0.03) {
            ctx.fillStyle = dark
              ? `hsla(${hue}, 15%, 75%, ${alpha})`
              : `hsla(${hue}, 20%, 40%, ${alpha})`;
            ctx.fillText(char, x, cy);
          }
        }

        // Direction arrow
        ctx.font = `9px "GeistMono", monospace`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = `rgba(${fg},0.1)`;
        ctx.fillText("→", streamLeft + streamW / 2, cy);

        // Separator
        if (ri < pairs.length - 1) {
          ctx.beginPath();
          ctx.moveTo(padX, startY + (ri + 1) * rowH);
          ctx.lineTo(w - padX, startY + (ri + 1) * rowH);
          ctx.strokeStyle = `rgba(${fg},0.03)`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
    return () => { destroyed = true; window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}
