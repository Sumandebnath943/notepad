import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * AEGIS VAULT brand mark — a hexagonal shield with a keyhole.
 *
 * Drawn as crisp SVG so it scales perfectly at any size. Uses the signature
 * teal→lime gradient. Gradient IDs are made unique per-instance via useId()
 * so multiple logos on the same page never collide (a hidden instance's
 * gradient defs would otherwise shadow visible instances).
 */
export function Logo({
  className,
  size = 32,
  showWordmark = true,
  wordmarkClassName,
}: {
  className?: string;
  size?: number;
  showWordmark?: boolean;
  wordmarkClassName?: string;
}) {
  // Unique suffix so each Logo instance references its own gradient defs.
  const uid = useId().replace(/[:]/g, "");
  const gradId = `aegis-grad-${uid}`;
  const gradSoftId = `aegis-grad-soft-${uid}`;

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0d9488" />
            <stop offset="0.5" stopColor="#14b8a6" />
            <stop offset="1" stopColor="#a3e635" />
          </linearGradient>
          <linearGradient id={gradSoftId} x1="24" y1="6" x2="24" y2="42" gradientUnits="userSpaceOnUse">
            <stop stopColor="#5eead4" stopOpacity="0.30" />
            <stop offset="1" stopColor="#bef264" stopOpacity="0.16" />
          </linearGradient>
        </defs>
        {/* Hex shield body — stronger fill + brighter stroke for visibility */}
        <path
          d="M24 3 L41 12.5 V31.5 L24 45 L7 31.5 V12.5 Z"
          fill={`url(#${gradSoftId})`}
          stroke={`url(#${gradId})`}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Inner facet lines (gemstone feel) */}
        <path
          d="M24 3 L24 17 M7 12.5 L18.5 22 M41 12.5 L29.5 22 M24 45 L18.5 22 M24 45 L29.5 22"
          stroke={`url(#${gradId})`}
          strokeWidth="1"
          strokeOpacity="0.55"
          strokeLinejoin="round"
        />
        {/* Keyhole */}
        <circle cx="24" cy="22" r="3.8" fill={`url(#${gradId})`} />
        <path
          d="M24 25.4 L24 31.5 M22.2 31.5 H25.8"
          stroke={`url(#${gradId})`}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      {showWordmark && (
        <span className={cn("font-semibold tracking-tight leading-none", wordmarkClassName)}>
          <span className="text-foreground">AEGIS</span>
          <span className="text-lime-400"> VAULT</span>
        </span>
      )}
    </span>
  );
}

/** Logo mark only (no wordmark) — for tight spaces like the top bar. */
export function LogoMark({ className, size = 32 }: { className?: string; size?: number }) {
  return <Logo className={className} size={size} showWordmark={false} />;
}
