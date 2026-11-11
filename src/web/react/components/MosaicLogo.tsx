import React, { useEffect, useId, useRef } from "react";
import { gsap } from "gsap";

// A whole made of shares: six glossy arcs pool into one ring around a glass core, and one gold share lands in the middle.
// Intro: arcs drift in and draw themselves into place, the core swells, the gold share drops in and the ring catches a glint.
// Idle: the ring turns very slowly and the core breathes. Hover: the ring takes a quarter turn.

const SEGMENTS = [
  { fill: "url(#GRAD_BLUE)", opacity: 1 },
  { fill: "url(#GRAD_BLUE)", opacity: 0.66 },
  { fill: "url(#GRAD_NAVY)", opacity: 1 },
  { fill: "url(#GRAD_NAVY)", opacity: 0.45 },
  { fill: "url(#GRAD_BLUE)", opacity: 0.34 },
  { fill: "url(#GRAD_GOLD)", opacity: 1 }
];

const RADIUS = 21;
const STROKE = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 6;
const ARC = CIRCUMFERENCE / SEGMENTS.length - GAP;

interface MosaicLogoProps {
  size?: number;
  intro?: boolean;
  loop?: boolean;
  wordmark?: boolean;
  textSize?: number;
}

export const MosaicLogo: React.FC<MosaicLogoProps> = ({ size = 32, intro = true, loop = true, wordmark = true, textSize = 18 }) => {
  const rootRef = useRef<HTMLSpanElement>(null);
  const uid = useId().replace(/:/g, "");
  const ref = (name: string) => `${name}-${uid}`;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const arcs = gsap.utils.toArray<SVGCircleElement>(".mlogo-arc", root);
    const ring = root.querySelector(".mlogo-ring");
    const core = root.querySelector(".mlogo-core");
    const spark = root.querySelector(".mlogo-spark");
    const glint = root.querySelector(".mlogo-glint");
    const word = root.querySelector(".mlogo-word");
    const gold = arcs[SEGMENTS.length - 1];

    const ctx = gsap.context(() => {
      if (intro) {
        gsap.set(ring, { rotation: -150, transformOrigin: "50% 50%" });
        gsap.set(core, { scale: 0, transformOrigin: "50% 50%" });
        gsap.set(spark, { scale: 0, y: -14, transformOrigin: "50% 50%", opacity: 0 });
        gsap.set(glint, { opacity: 0 });
        arcs.forEach((arc, index) => {
          void index;
          const mid = ((ARC / 2 / RADIUS) * 180) / Math.PI;
          gsap.set(arc, {
            strokeDashoffset: ARC,
            x: Math.cos((mid * Math.PI) / 180) * 16,
            y: Math.sin((mid * Math.PI) / 180) * 16,
            opacity: 0
          });
        });
        const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
        tl.to(arcs, { x: 0, y: 0, strokeDashoffset: 0, opacity: (i) => SEGMENTS[i].opacity, duration: 1, stagger: 0.09 });
        tl.to(ring, { rotation: 0, duration: 1.4, ease: "power4.out" }, 0);
        tl.to(core, { scale: 1, duration: 0.7, ease: "back.out(2.2)" }, "-=0.6");
        tl.to(spark, { scale: 1, y: 0, opacity: 1, duration: 0.55, ease: "bounce.out" }, "-=0.35");
        tl.fromTo(gold, { strokeWidth: STROKE }, { strokeWidth: STROKE + 4, duration: 0.25, yoyo: true, repeat: 1, ease: "power2.inOut" }, "-=0.3");
        tl.to(glint, { opacity: 0.9, duration: 0.3, yoyo: true, repeat: 1 }, "-=0.2");
        if (word) tl.from(word, { x: -12, opacity: 0, duration: 0.6 }, 0.5);
      }
      if (loop) {
        gsap.to(ring, { rotation: "+=360", duration: 40, ease: "none", repeat: -1, transformOrigin: "50% 50%" });
        gsap.to(core, { scale: 1.07, duration: 2.2, ease: "sine.inOut", yoyo: true, repeat: -1, transformOrigin: "50% 50%" });
        gsap.to(arcs, {
          strokeWidth: STROKE + 3,
          duration: 0.5,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
          repeatDelay: 6,
          stagger: { each: 0.18, repeat: -1, repeatDelay: 6 },
          delay: 4
        });
      }
    }, root);

    const onEnter = () => {
      gsap.to(ring, { rotation: "+=60", duration: 0.9, ease: "elastic.out(1, 0.6)", transformOrigin: "50% 50%", overwrite: "auto" });
    };
    root.addEventListener("pointerenter", onEnter);
    return () => {
      root.removeEventListener("pointerenter", onEnter);
      ctx.revert();
    };
  }, [intro, loop]);

  const box = 56;
  const center = box / 2;
  return (
    <span ref={rootRef} className="mlogo" style={{ display: "inline-flex", alignItems: "center", gap: Math.round(size * 0.28) }} aria-label="WholeShare">
      <svg width={size} height={size} viewBox={`0 0 ${box} ${box}`} fill="none" aria-hidden="true" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id={ref("blue")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3AA6E6" />
            <stop offset="1" stopColor="#0070BA" />
          </linearGradient>
          <linearGradient id={ref("navy")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2A4A6B" />
            <stop offset="1" stopColor="#0F1F2E" />
          </linearGradient>
          <linearGradient id={ref("gold")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFE08A" />
            <stop offset="1" stopColor="#FFC439" />
          </linearGradient>
          <radialGradient id={ref("core")} cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stopColor="#3C628A" />
            <stop offset="0.55" stopColor="#173049" />
            <stop offset="1" stopColor="#0A1622" />
          </radialGradient>
          <filter id={ref("glow")} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>
        <circle cx={center} cy={center} r="9.5" fill="#0070BA" opacity="0.22" filter={`url(#${ref("glow")})`} />
        <g className="mlogo-ring">
          {SEGMENTS.map((segment, index) => (
            <g key={index} transform={`rotate(${(index * 360) / SEGMENTS.length - 90} ${center} ${center})`}>
              <circle
                className="mlogo-arc"
                cx={center}
                cy={center}
                r={RADIUS}
                stroke={segment.fill.replace(/GRAD_(\w+)/, (_match, name: string) => ref(name.toLowerCase()))}
                strokeOpacity={segment.opacity}
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={`${ARC} ${CIRCUMFERENCE - ARC}`}
              />
            </g>
          ))}
        </g>
        <circle className="mlogo-core" cx={center} cy={center} r="10" fill={`url(#${ref("core")})`} />
        <path className="mlogo-glint" d={`M ${center - 7} ${center - 3.5} A 8 8 0 0 1 ${center - 2} ${center - 7.6}`} stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        <circle className="mlogo-spark" cx={center} cy={center} r="3.4" fill={`url(#${ref("gold")})`} />
      </svg>
      {wordmark && (
        <span className="mlogo-word" style={{ fontFamily: "'Geist', sans-serif", fontWeight: 600, fontSize: textSize, letterSpacing: "-0.03em", color: "#0F1F2E", lineHeight: 1 }}>
          Whole<span style={{ color: "#0070BA" }}>Share</span>
        </span>
      )}
    </span>
  );
};
