"use client";

import { useRef, useEffect } from "react";

const PATTERNS = [
  "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏", // braille spinner
  "⣾⣽⣻⢿⡿⣟⣯⣷",     // braille blocks
  "⠁⠂⠄⡀⢀⠠⠐⠈",     // braille dots
  "⡈⠔⠢⢁⢂⢄⡰⡠⡄",   // braille scatter
  "░▒▓█▓▒░",              // block shade
  "┤┘┴└├┌┬┐",             // box drawing
  "◢◣◤◥",                 // triangles
  "◰◳◲◱",                 // squares
];

export function AgentPattern({ seed, size = 32 }: { seed: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Deterministic pattern selection from seed
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    }
    const patternIdx = Math.abs(hash) % PATTERNS.length;
    const pattern = PATTERNS[patternIdx];

    const fontSize = 7;
    const cellW = fontSize * 0.8;
    const cellH = fontSize * 1.1;
    const cols = Math.floor(size / cellW);
    const rows = Math.floor(size / cellH);

    let destroyed = false;
    let animId = 0;
    const startTime = performance.now();

    function render() {
      if (destroyed) return;
      const time = (performance.now() - startTime) * 0.001;

      const isDark = document.documentElement.classList.contains("dark");
      ctx.clearRect(0, 0, size, size);

      ctx.font = `${fontSize}px "GeistMono", monospace`;
      ctx.textBaseline = "top";

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const offset = ((time * 2 + x * 0.7 + y * 0.5) | 0) % pattern.length;
          const char = pattern[offset];
          const brightness = 0.4 + Math.sin(time * 0.8 + x * 0.4 + y * 0.3) * 0.15;
          ctx.fillStyle = isDark
            ? `rgba(240,240,243,${brightness})`
            : `rgba(10,10,10,${brightness})`;
          ctx.fillText(char, x * cellW, y * cellH);
        }
      }

      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);
    return () => { destroyed = true; cancelAnimationFrame(animId); };
  }, [seed, size]);

  return (
    <canvas
      ref={canvasRef}
      className=""
      style={{ width: size, height: size }}
    />
  );
}
