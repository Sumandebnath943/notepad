"use client";

import { LogoMark } from "@/components/brand/logo";

export function LoadingScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 relative z-10 py-10">
      {/* Container sized to the largest ring so absolute rings never overflow
          into the text below. Largest ring = 128px (h-32). */}
      <div className="relative h-32 w-32">
        {/* rotating rings — centered with left-1/2/top-1/2 + translate */}
        <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-teal-400/20 anim-spin-slow" />
        <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-t-2 border-teal-400/60 anim-spin-slow" />
        <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-lime-400/10 anim-spin-rev" />
        <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-b-2 border-lime-400/40 anim-spin-rev" />
        {/* core: logo mark */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 grid place-items-center h-16 w-16 rounded-2xl bg-teal-400/10 ring-1 ring-teal-400/40 glow-teal-sm">
          <LogoMark size={36} />
        </div>
      </div>
      <div className="text-center">
        <p className="font-mono text-xs tracking-[0.3em] text-lime-400/80 uppercase">
          Initializing secure session
          <span className="anim-blink">_</span>
        </p>
      </div>
    </div>
  );
}
