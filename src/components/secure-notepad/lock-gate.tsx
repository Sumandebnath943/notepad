"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useAuthStore } from "@/lib/store";

/**
 * Wraps the unlocked app. Responsibilities:
 *  - Reset the auto-lock timer on user activity (mousemove, keydown, click,
 *    touch, scroll). Activity is throttled to once per few seconds.
 *  - Lock the vault when the tab is hidden (pagehide/visibilitychange) so keys
 *    don't sit in memory while the user is away. (Defense in depth.)
 *  - Lock on browser/tab close via beforeunload.
 *
 * The DEK lives in the Zustand store (memory only). `lock()` nulls it.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const touchActivity = useAuthStore((s) => s.touchActivity);
  const lock = useAuthStore((s) => s.lock);
  const status = useAuthStore((s) => s.status);
  const lastTouch = useRef(0);

  useEffect(() => {
    if (status !== "unlocked") return;

    const onActivity = () => {
      const now = Date.now();
      if (now - lastTouch.current > 5000) {
        lastTouch.current = now;
        touchActivity();
      }
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"];
    events.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));

    // Lock when tab is hidden for a moment — keys shouldn't sit in memory
    // unattended. (Comment this out if you want background persistence.)
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hideTimer = setTimeout(() => lock(), 30 * 1000); // 30s hidden → lock
      } else if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Best-effort lock on unload.
    const onUnload = () => lock();
    window.addEventListener("beforeunload", onUnload);

    return () => {
      events.forEach((ev) =>
        window.removeEventListener(ev, onActivity)
      );
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onUnload);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [status, touchActivity, lock]);

  return <>{children}</>;
}
