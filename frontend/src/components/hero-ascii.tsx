"use client";

import { useRef, useEffect, useCallback } from "react";

const ASCII_SETS = [
  " .,:;+*?%S#@",
  " .,;:*+?S%#@",
  " .;,:+*S?%@#",
];
const FONT_SIZE = 7;
const CHAR_WIDTH = FONT_SIZE * 0.6;
const CHAR_HEIGHT = FONT_SIZE * 1.05;

export function HeroAscii() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    mouseX: 0.5,
    mouseY: 0.5,
    destroyed: false,
    imageLoaded: false,
    animId: 0,
  });

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    stateRef.current.mouseX = (e.clientX - rect.left) / rect.width;
    stateRef.current.mouseY = (e.clientY - rect.top) / rect.height;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    stateRef.current.destroyed = false;

    const sampleCanvas = document.createElement("canvas");
    const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true })!;

    const img = new Image();
    img.src = "/hero-clouds.png";

    let cols = 0, rows = 0;
    let cellBrightness: Float32Array | null = null;
    let cellR: Uint8Array | null = null;
    let cellG: Uint8Array | null = null;
    let cellB: Uint8Array | null = null;
    const font = `${FONT_SIZE}px "GeistMono", "JetBrains Mono", "Fira Code", monospace`;

    function resize() {
      if (stateRef.current.destroyed || !canvas) return;
      const rect = canvas.parentElement!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = font;
      ctx.textBaseline = "top";
      cols = Math.floor(rect.width / CHAR_WIDTH);
      rows = Math.floor(rect.height / CHAR_HEIGHT);

      if (stateRef.current.imageLoaded && cols > 0 && rows > 0) {
        sampleCanvas.width = cols;
        sampleCanvas.height = rows;
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const gridAspect = cols / rows;
        let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
        if (imgAspect > gridAspect) { sw = img.naturalHeight * gridAspect; sx = (img.naturalWidth - sw) / 2; }
        else { sh = img.naturalWidth / gridAspect; sy = (img.naturalHeight - sh) / 2; }
        sampleCtx.drawImage(img, sx, sy, sw, sh, 0, 0, cols, rows);
        const pixelData = sampleCtx.getImageData(0, 0, cols, rows).data;

        const total = cols * rows;
        cellBrightness = new Float32Array(total);
        cellR = new Uint8Array(total);
        cellG = new Uint8Array(total);
        cellB = new Uint8Array(total);

        for (let i = 0; i < total; i++) {
          const pi = i * 4;
          const r = pixelData[pi], g = pixelData[pi + 1], b = pixelData[pi + 2];
          cellBrightness[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          const max = Math.max(r, g, b, 1);
          const boost = Math.min(255 / max * 0.7, 2.0);
          cellR[i] = Math.min(255, Math.round(r * boost));
          cellG[i] = Math.min(255, Math.round(g * boost));
          cellB[i] = Math.min(255, Math.round(b * boost));
        }
      }
    }

    img.onload = () => { stateRef.current.imageLoaded = true; resize(); };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouseMove);

    const startTime = performance.now();

    function render() {
      if (stateRef.current.destroyed) return;
      const time = (performance.now() - startTime) * 0.001;
      const { mouseX, mouseY } = stateRef.current;
      const dark = document.documentElement.classList.contains("dark");

      const rect = canvas!.parentElement!.getBoundingClientRect();
      const w = rect.width, h = rect.height;

      ctx.fillStyle = dark ? "#0f0f12" : "#ffffff";
      ctx.fillRect(0, 0, w, h);

      if (!cellBrightness || !cellR || !cellG || !cellB) {
        stateRef.current.animId = requestAnimationFrame(render);
        return;
      }

      const wavePhase = time * 0.12;
      const invRows = 1 / rows;
      const invCols = 1 / cols;
      const mouseRadius = 0.3;
      const mouseR2 = mouseRadius * mouseRadius;

      if (dark) {
        // ══════════════════════════════════════
        // DARK MODE — colored ASCII characters
        // ══════════════════════════════════════
        for (let y = 0; y < rows; y++) {
          const ny = y * invRows;
          const rowOffset = y * cols;
          let lastStyle = "", batchStr = "", batchStartX = 0;

          for (let x = 0; x <= cols; x++) {
            let char = " ", style = "";
            if (x < cols) {
              const nx = x * invCols;
              const cellIdx = rowOffset + x;
              let brightness = cellBrightness[cellIdx];
              brightness += Math.sin(((nx + ny) * 1.8 - wavePhase) * 6.2832) * 0.05;
              const dx = nx - mouseX, dy = ny - mouseY, d2 = dx * dx + dy * dy;
              if (d2 < mouseR2) brightness += (1 - Math.sqrt(d2) / mouseRadius) * 0.15;

              if (brightness >= 0.03) {
                if (brightness > 1) brightness = 1;
                const setIdx = ((time * 0.4 + x * 0.13 + y * 0.17) | 0) % 3;
                const chars = ASCII_SETS[setIdx];
                char = chars[Math.min(chars.length - 1, (brightness * chars.length) | 0)];
                if (char !== " ") {
                  const qa = ((Math.min(1, brightness * 1.3) * 10 + 0.5) | 0) / 10;
                  style = `rgba(${(cellR[cellIdx] >> 4) << 4},${(cellG[cellIdx] >> 4) << 4},${(cellB[cellIdx] >> 4) << 4},${qa})`;
                }
              }
            }
            if (style !== lastStyle || x === cols) {
              if (batchStr.length > 0 && lastStyle) { ctx.fillStyle = lastStyle; ctx.fillText(batchStr, batchStartX * CHAR_WIDTH, y * CHAR_HEIGHT); }
              batchStr = char === " " ? "" : char; batchStartX = x; lastStyle = style;
            } else if (char !== " ") {
              const gap = x - (batchStartX + batchStr.length);
              if (gap > 0) { if (batchStr.length > 0 && lastStyle) { ctx.fillStyle = lastStyle; ctx.fillText(batchStr, batchStartX * CHAR_WIDTH, y * CHAR_HEIGHT); } batchStr = char; batchStartX = x; }
              else batchStr += char;
            }
          }
        }
      } else {
        // ══════════════════════════════════════
        // LIGHT MODE — colored pointillist dots
        // ══════════════════════════════════════
        const spacing = 4;
        const maxDotR = 2.2;
        const dotCols = Math.ceil(w / spacing);
        const dotRows = Math.ceil(h / spacing);

        for (let dy = 0; dy < dotRows; dy++) {
          for (let dx = 0; dx < dotCols; dx++) {
            const px = dx * spacing + spacing / 2;
            const py = dy * spacing + spacing / 2;

            const sx = Math.min(cols - 1, Math.floor((px / w) * cols));
            const sy = Math.min(rows - 1, Math.floor((py / h) * rows));
            const cellIdx = sy * cols + sx;

            let brightness = cellBrightness[cellIdx];

            const nx = dx / dotCols, ny = dy / dotRows;
            brightness += Math.sin(((nx + ny) * 1.8 - wavePhase) * 6.2832) * 0.04;
            const mdx = nx - mouseX, mdy = ny - mouseY, md2 = mdx * mdx + mdy * mdy;
            if (md2 < mouseR2) brightness += (1 - Math.sqrt(md2) / mouseRadius) * 0.12;

            if (brightness < 0.08) continue;
            if (brightness > 1) brightness = 1;

            const dotR = brightness * maxDotR;
            if (dotR < 0.4) continue;

            // Use saturated image colors
            const r = cellR[cellIdx], g = cellG[cellIdx], b = cellB[cellIdx];
            // Darken slightly so they read on white
            const dr = Math.round(r * 0.6);
            const dg = Math.round(g * 0.6);
            const db = Math.round(b * 0.6);
            const alpha = Math.min(0.85, brightness * 0.8);

            ctx.beginPath();
            ctx.arc(px, py, dotR, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${dr},${dg},${db},${alpha})`;
            ctx.fill();
          }
        }
      }

      // Left-side fade — blends ASCII/dots into the page background
      const fadeW = w * 0.45;
      const fadeGrad = ctx.createLinearGradient(0, 0, fadeW, 0);
      fadeGrad.addColorStop(0, dark ? "#0f0f12" : "#ffffff");
      fadeGrad.addColorStop(1, dark ? "rgba(15,15,18,0)" : "rgba(255,255,255,0)");
      ctx.fillStyle = fadeGrad;
      ctx.fillRect(0, 0, fadeW, h);

      stateRef.current.animId = requestAnimationFrame(render);
    }

    stateRef.current.animId = requestAnimationFrame(render);
    return () => {
      stateRef.current.destroyed = true;
      cancelAnimationFrame(stateRef.current.animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [handleMouseMove]);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}
