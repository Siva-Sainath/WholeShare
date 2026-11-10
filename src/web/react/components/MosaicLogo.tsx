import React, { useEffect, useRef } from "react";
import { gsap } from "gsap";

// A whole made of shares: six arcs pool into one ring around a core.
// Intro: arcs drift in from outside and draw themselves into place, the core lands, the gold share sweeps once.
// Idle: a slow highlight travels around the ring. Hover: the ring takes a quarter turn.

const SEGMENTS = [
  { color: "#0070BA", opacity: 1 },
  { color: "#0070BA", opacity: 0.62 },
  { color: "#0F1F2E", opacity: 1 },
  { color: "#5C6A79", opacity: 0.5 },
  { color: "#0070BA", opacity: 0.32 },
  { color: "#FFC439", opacity: 1 }
];

const RADIUS = 20;
const STROKE = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 5;
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

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const arcs = gsap.utils.toArray<SVGCircleElement>(".mlogo-arc", root);
    const ring = root.querySelector(".mlogo-ring");
    const core = root.querySelector(".mlogo-core");
    const word = root.querySelector(".mlogo-word");
    const gold = arcs[SEGMENTS.length - 1];

    const ctx = gsap.context(() => {
      if (intro) {
        gsap.set(ring, { rotation: -150, transformOrigin: "50% 50%" });
        gsap.set(core, { scale: 0, transformOrigin: "50% 50%" });
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
        tl.fromTo(gold, { strokeWidth: STROKE }, { strokeWidth: STROKE + 4, duration: 0.25, yoyo: true, repeat: 1, ease: "power2.inOut" }, "-=0.2");
        if (word) tl.from(word, { x: -12, opacity: 0, duration: 0.6 }, 0.5);
      }
      if (loop) {
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
        <g className="mlogo-ring">
          {SEGMENTS.map((segment, index) => (
            <g key={index} transform={`rotate(${(index * 360) / SEGMENTS.length - 90} ${center} ${center})`}>
              <circle
                className="mlogo-arc"
                cx={center}
                cy={center}
                r={RADIUS}
                stroke={segment.color}
                strokeOpacity={segment.opacity}
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={`${ARC} ${CIRCUMFERENCE - ARC}`}
              />
            </g>
          ))}
        </g>
        <circle className="mlogo-core" cx={center} cy={center} r="6" fill="#0F1F2E" />
      </svg>
      {wordmark && (
        <span className="mlogo-word" style={{ fontFamily: "'Geist', sans-serif", fontWeight: 600, fontSize: textSize, letterSpacing: "-0.03em", color: "#0F1F2E", lineHeight: 1 }}>
          Whole<span style={{ color: "#0070BA" }}>Share</span>
        </span>
      )}
    </span>
  );
};
