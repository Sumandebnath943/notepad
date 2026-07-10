"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  AlertTriangle,
} from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogoMark } from "@/components/brand/logo";
import { toast } from "sonner";

export function UnlockScreen() {
  const user = useAuthStore((s) => s.user);
  const unlock = useAuthStore((s) => s.unlock);
  const logout = useAuthStore((s) => s.logout);
  const [masterPassword, setMasterPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!masterPassword) return;
    setBusy(true);
    try {
      await unlock(masterPassword);
      toast.success("Vault unlocked");
      setMasterPassword("");
    } catch {
      toast.error("Incorrect master key.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* ambient backdrop */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 25%, rgba(20,184,166,0.18), transparent 55%)",
        }}
      />
      <div className="absolute inset-0 -z-10 dot-bg dot-bg-fade opacity-60" />
      <div className="scanline" />

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        {/* animated lock emblem with logo at its core */}
        <div className="flex flex-col items-center text-center mb-8">
          {/* Container sized to the largest ring (112px) so absolute rings
              never overflow into the chip below. */}
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.12, type: "spring", stiffness: 180 }}
            className="relative h-28 w-28 mb-7"
          >
            {/* rotating rings — centered with left-1/2/top-1/2 + translate */}
            <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-teal-400/20 anim-spin-slow" />
            <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-t-2 border-teal-400/60 anim-spin-slow" />
            <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-lime-400/10 anim-spin-rev" />
            <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-b-2 border-lime-400/30 anim-spin-rev" />
            {/* core: logo mark + lock badge */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 grid place-items-center h-16 w-16 rounded-2xl bg-teal-400/10 ring-1 ring-teal-400/40 glow-teal">
              <LogoMark size={36} />
            </div>
            <div className="absolute bottom-1 right-1 grid place-items-center h-7 w-7 rounded-full bg-lime-400/15 ring-1 ring-lime-400/50 backdrop-blur">
              <Lock className="h-3.5 w-3.5 text-lime-300" />
            </div>
          </motion.div>

          <div className="chip chip-amber mb-3">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 anim-pulse-glow" />
            Vault locked
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Unlock your vault</h1>
          <p className="font-mono text-xs text-muted-foreground mt-1.5 tracking-wider no-wrap max-w-full">
            {user?.email}
          </p>
        </div>

        <Card className="glass-strong border-white/10 shadow-2xl">
          <CardHeader className="space-y-1.5">
            <CardTitle className="text-lg flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-lime-400" />
              Enter master key
            </CardTitle>
            <CardDescription>
              Derives your data-encryption key locally. Never sent to the server.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUnlock} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="master" className="text-sm font-medium">
                  Master password
                </Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-lime-400/70" />
                  <Input
                    id="master"
                    type={show ? "text" : "password"}
                    value={masterPassword}
                    onChange={(e) => setMasterPassword(e.target.value)}
                    autoFocus
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    className="pl-9 pr-10 bg-white/5 border-white/10 input-brand font-mono tracking-widest"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-lime-300 transition-colors"
                    tabIndex={-1}
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full btn-brand border-0 h-10"
                disabled={busy || !masterPassword}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deriving key…
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    Unlock vault
                  </>
                )}
              </Button>

              <div className="flex items-start gap-2 text-[11px] text-amber-300/90 bg-amber-400/10 border border-amber-400/20 rounded-md p-2.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  If you forget your master password, your notes are
                  unrecoverable. This is what zero-knowledge means.
                </span>
              </div>

              <button
                type="button"
                onClick={() => void logout()}
                className="w-full text-xs text-muted-foreground hover:text-lime-300 flex items-center justify-center gap-1.5 pt-1 transition-colors"
              >
                <LogOut className="h-3 w-3" />
                Sign out of {user?.email}
              </button>
            </form>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-1.5 mt-6 text-[10px] font-mono tracking-wider text-muted-foreground">
          <Lock className="h-3.5 w-3.5 text-lime-400/70" />
          <span className="uppercase">Keys cleared from memory on lock</span>
        </div>
      </motion.div>
    </div>
  );
}
