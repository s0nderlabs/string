"use client";

import { useRef, useEffect } from "react";

const CHARS = "⠁⠂⠄⡀⢀⠠⠐⠈⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷◰◳◲◱";

function hash(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) >>> 0;
}

export function BrailleBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let destroyed = false;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const t0 = performance.now();

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = w + "px";
      canvas!.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    window.addEventListener("resize", resize);

    function render() {
      if (destroyed) return;
      const time = (performance.now() - t0) * 0.001;
      const w = canvas!.width / dpr;
      const h = canvas!.height / dpr;
      const dark = document.documentElement.classList.contains("dark");
      const fg = dark ? "240,240,243" : "10,10,10";

      ctx.clearRect(0, 0, w, h);

      const fontSize = 20;
      const cellW = fontSize * 0.7;
      const cellH = fontSize * 1.2;
      const cols = Math.ceil(w / cellW) + 1;
      const rows = Math.ceil(h / cellH) + 1;

      ctx.font = `${fontSize}px "GeistMono", monospace`;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const h2 = hash(x, y);
          const charPhase = (h2 % 100) * 0.063;
          const charIdx = ((time * 0.3 + charPhase) | 0) % CHARS.length;
          const char = CHARS[(h2 + charIdx) % CHARS.length];

          // Horizontal gradient — faint on left, prominent on right
          const xNorm = (x * cellW) / w; // 0 (left) to 1 (right)
          const rightBias = Math.pow(xNorm, 2.5); // aggressive curve — most visible on right third

          // Breathing waves
          const wave1 = Math.sin(x * 0.12 + time * 0.2 + y * 0.08) * 0.5 + 0.5;
          const wave2 = Math.sin(y * 0.1 - time * 0.15 + x * 0.06) * 0.5 + 0.5;
          const wave3 = Math.sin((x + y) * 0.08 + time * 0.12) * 0.5 + 0.5;

          // Base brightness scales with rightBias
          const baseBrightness = rightBias * 0.25;
          const waveEffect = wave1 * wave2 * 0.15 + wave3 * 0.05;
          const alpha = baseBrightness + waveEffect * rightBias;

          if (alpha > 0.01) {
            ctx.fillStyle = `rgba(${fg},${Math.min(alpha, 0.3)})`;
            ctx.fillText(char, x * cellW, y * cellH);
          }
        }
      }

      requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
    return () => { destroyed = true; window.removeEventListener("resize", resize); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
