import React, { useEffect, useRef } from "react";

// A generated backdrop for the landing hero: particles drift in toward a central ring and swirl into it,
// the same "pooling" idea as the logo. It pauses offscreen and draws one still frame under reduced motion.

const COLORS = ["#0070BA", "#0070BA", "#0F1F2E", "#5C6A79", "#FFC439"];

interface Particle {
  x: number;
  y: number;
  speed: number;
  color: string;
  size: number;
  swirl: number;
}

export const HeroBackdrop: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const particles: Particle[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#FAF8F3";
      ctx.fillRect(0, 0, width, height);
    };

    const spawn = (): Particle => {
      const side = Math.random();
      const x = side < 0.5 ? (Math.random() < 0.5 ? -20 : width + 20) : Math.random() * width;
      const y = side < 0.5 ? Math.random() * height : Math.random() < 0.5 ? -20 : height + 20;
      return { x, y, speed: 0.4 + Math.random() * 0.9, color: COLORS[Math.floor(Math.random() * COLORS.length)], size: 1 + Math.random() * 1.8, swirl: 0.5 + Math.random() * 0.8 };
    };

    const step = () => {
      const cx = width / 2;
      const cy = height * 0.42;
      const ring = Math.min(width, height) * 0.16;
      ctx.fillStyle = "rgba(250, 248, 243, 0.07)";
      ctx.fillRect(0, 0, width, height);
      for (const p of particles) {
        const dx = cx - p.x;
        const dy = cy - p.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;
        const near = Math.max(0, 1 - dist / (Math.min(width, height) * 0.6));
        const swirl = p.swirl * (0.4 + near * 2.2);
        const prevX = p.x;
        const prevY = p.y;
        p.x += (nx * p.speed + -ny * swirl * 0.6) * (dist > ring ? 1 : 0.35);
        p.y += (ny * p.speed + nx * swirl * 0.6) * (dist > ring ? 1 : 0.35);
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = 0.45 + near * 0.5;
        ctx.lineWidth = p.size * 1.25;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (dist < ring * 0.82) Object.assign(p, spawn());
      }
    };

    const loop = () => {
      if (visible) step();
      frame = requestAnimationFrame(loop);
    };

    resize();
    const count = Math.round(Math.min(220, (width * height) / 5200));
    for (let i = 0; i < count; i += 1) {
      const p = spawn();
      p.x = Math.random() * width;
      p.y = Math.random() * height;
      particles.push(p);
    }
    if (reduced) {
      for (let i = 0; i < 160; i += 1) step();
    } else {
      frame = requestAnimationFrame(loop);
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    observer.observe(canvas);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="lp-backdrop" aria-hidden="true" />;
};
