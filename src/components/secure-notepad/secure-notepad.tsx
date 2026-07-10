"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/store";
import { AuthScreen } from "@/components/secure-notepad/auth-screen";
import { UnlockScreen } from "@/components/secure-notepad/unlock-screen";
import { NotesApp } from "@/components/secure-notepad/notes-app";
import { LockGate } from "@/components/secure-notepad/lock-gate";
import { LoadingScreen } from "@/components/secure-notepad/loading-screen";

export function SecureNotepad() {
  const status = useAuthStore((s) => s.status);
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      {/* Ambient dot-matrix (sits behind everything) */}
      <div className="pointer-events-none fixed inset-0 dot-bg dot-bg-fade opacity-50" />
      {status === "loading" && <LoadingScreen />}
      {status === "unauthenticated" && <AuthScreen />}
      {status === "authenticated-locked" && <UnlockScreen />}
      {status === "unlocked" && (
        <LockGate>
          <NotesApp />
        </LockGate>
      )}
    </div>
  );
}
