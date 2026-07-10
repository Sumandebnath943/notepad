"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Info,
  Fingerprint,
  Cpu,
  Binary,
  ShieldCheck,
} from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { estimatePasswordEntropy, passwordStrengthLabel } from "@/lib/crypto";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Logo } from "@/components/brand/logo";
import { toast } from "sonner";

export function AuthScreen() {
  const login = useAuthStore((s) => s.login);
  const signup = useAuthStore((s) => s.signup);
  const [mode, setMode] = useState<"login" | "signup">("login");

  const [email, setEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPw, setShowLoginPw] = useState(false);

  const [masterPassword, setMasterPassword] = useState("");
  const [confirmMaster, setConfirmMaster] = useState("");
  const [showMaster, setShowMaster] = useState(false);
  const [busy, setBusy] = useState(false);

  const entropy = estimatePasswordEntropy(masterPassword);
  const strength = passwordStrengthLabel(entropy);
  const passwordsMatch =
    masterPassword.length > 0 && masterPassword === confirmMaster;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await login({ email, loginPassword });
      toast.success("Authenticated. Enter your master key to unlock.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (masterPassword.length < 10) {
      toast.error("Master password must be at least 10 characters.");
      return;
    }
    // Password strength is the real weak point in a zero-knowledge model, so
    // gate on estimated entropy (not just length) before generating keys.
    if (entropy < 60) {
      toast.error(
        "Master password is too weak. Add length or a mix of character types."
      );
      return;
    }
    if (!passwordsMatch) {
      toast.error("Master passwords do not match.");
      return;
    }
    if (loginPassword.length < 8) {
      toast.error("Login password must be at least 8 characters.");
      return;
    }
    if (loginPassword === masterPassword) {
      toast.error(
        "Use a different login password and master password for defense in depth."
      );
      return;
    }
    setBusy(true);
    try {
      await signup({ email, loginPassword, masterPassword });
      toast.success("Vault initialized. Keys generated locally.");
      setMasterPassword("");
      setConfirmMaster("");
      setLoginPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col relative z-10">
      <div className="flex-1 grid lg:grid-cols-2 min-h-0">
        {/* ── Left: brand hero ─────────────────────────────────────────── */}
        <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden border-r border-white/5">
          {/* ambient glows */}
          <div
            className="absolute inset-0 -z-10"
            style={{
              backgroundImage:
                "radial-gradient(circle at 30% 20%, rgba(20,184,166,0.20), transparent 45%), radial-gradient(circle at 75% 80%, rgba(163,230,53,0.12), transparent 45%)",
            }}
          />
          <div className="absolute inset-0 -z-10 dot-bg dot-bg-fade opacity-70" />

          {/* top: logo lockup */}
          <div className="relative">
            <Logo size={40} wordmarkClassName="text-xl" />
          </div>

          {/* center hero */}
          <div className="relative space-y-7 max-w-xl">
            <div className="chip chip-lime w-fit">
              <span className="h-1.5 w-1.5 rounded-full bg-lime-400 anim-pulse-glow" />
              End-to-end encrypted
            </div>
            <h1 className="text-[2.75rem] font-bold leading-[1.05] tracking-tight">
              Encrypted notes,
              <br />
              <span className="text-gradient-brand">invisible by design.</span>
            </h1>
            <p className="text-muted-foreground leading-relaxed text-[15px] max-w-md">
              A zero-knowledge vault. Your master key is derived in your browser
              and never transmitted — not even we can read your notes.
            </p>
            <ul className="space-y-3.5">
              <Feature icon={<Cpu className="h-4 w-4" />} title="Argon2id key derivation" sub="64 MB · 3 iterations" />
              <Feature icon={<Binary className="h-4 w-4" />} title="AES-256-GCM authenticated encryption" sub="tamper-evident ciphertext" />
              <Feature icon={<Fingerprint className="h-4 w-4" />} title="Envelope encryption" sub="rotate your password without re-encrypting notes" />
              <Feature icon={<Lock className="h-4 w-4" />} title="Keys live in memory only" sub="auto-lock on inactivity" />
            </ul>
          </div>

          {/* bottom mono readout */}
          <div className="relative font-mono text-[10px] tracking-[0.15em] text-muted-foreground/70 flex items-center gap-3 flex-wrap">
            <span className="chip chip-muted">No custom crypto</span>
            <span className="chip chip-muted">Audited primitives</span>
            <span className="chip chip-muted">Open standard</span>
          </div>
        </div>

        {/* ── Right: auth form ─────────────────────────────────────────── */}
        <div className="flex items-center justify-center p-6 sm:p-10 relative">
          <div
            className="absolute inset-0 -z-10"
            style={{
              backgroundImage:
                "radial-gradient(circle at 50% 25%, rgba(163,230,53,0.10), transparent 55%)",
            }}
          />
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="w-full max-w-md"
          >
            {/* Mobile logo: mark stacked above wordmark */}
            <div className="lg:hidden flex flex-col items-center gap-3 mb-7">
              <Logo size={44} showWordmark={false} />
              <span className="font-semibold tracking-tight text-lg leading-none">
                <span className="text-foreground">AEGIS</span>
                <span className="text-lime-400"> VAULT</span>
              </span>
            </div>

            <Tabs value={mode} onValueChange={(v) => setMode(v as "login" | "signup")}>
              <TabsList className="grid grid-cols-2 w-full mb-5 bg-white/5 border border-white/10 h-10">
                <TabsTrigger
                  value="login"
                  className="data-[state=active]:bg-lime-400/10 data-[state=active]:text-lime-300 data-[state=active]:shadow-[0_0_14px_rgba(163,230,53,0.20)] text-sm"
                >
                  Log in
                </TabsTrigger>
                <TabsTrigger
                  value="signup"
                  className="data-[state=active]:bg-lime-400/10 data-[state=active]:text-lime-300 data-[state=active]:shadow-[0_0_14px_rgba(163,230,53,0.20)] text-sm"
                >
                  Create vault
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <Card className="glass-strong border-white/10 shadow-2xl">
                  <CardHeader className="space-y-1.5">
                    <CardTitle className="text-xl">Welcome back</CardTitle>
                    <CardDescription>
                      Authenticate with your account password. You&apos;ll unlock
                      the vault next.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                      <Field label="Email">
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="pl-9 bg-white/5 border-white/10 input-brand"
                          />
                        </div>
                      </Field>
                      <Field label="Login password">
                        <PasswordInput
                          value={loginPassword}
                          onChange={setLoginPassword}
                          show={showLoginPw}
                          onToggle={() => setShowLoginPw((v) => !v)}
                          autoComplete="current-password"
                          placeholder="Your account password"
                        />
                      </Field>
                      <Button
                        type="submit"
                        className="w-full btn-brand border-0 h-10"
                        disabled={busy}
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Authenticate"
                        )}
                      </Button>
                      <p className="text-xs text-muted-foreground text-center leading-relaxed">
                        Login password authenticates you · master password
                        decrypts your notes
                      </p>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="signup">
                <Card className="glass-strong border-white/10 shadow-2xl">
                  <CardHeader className="space-y-1.5">
                    <CardTitle className="text-xl">Initialize your vault</CardTitle>
                    <CardDescription>
                      Set a login password and an encryption master password.
                      Keep them distinct.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSignup} className="space-y-4">
                      <Field label="Email">
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="pl-9 bg-white/5 border-white/10 input-brand"
                          />
                        </div>
                      </Field>
                      <Field label="Login password" hint="Min 8 characters">
                        <PasswordInput
                          value={loginPassword}
                          onChange={setLoginPassword}
                          show={showLoginPw}
                          onToggle={() => setShowLoginPw((v) => !v)}
                          autoComplete="new-password"
                          placeholder="Account password"
                        />
                      </Field>

                      <div className="relative flex items-center gap-3 py-1">
                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-lime-400/30 to-transparent" />
                        <span className="font-mono text-[9px] tracking-[0.25em] text-lime-400/70 uppercase">
                          Encryption layer
                        </span>
                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-lime-400/30 to-transparent" />
                      </div>

                      <Field label="Master password" hint="Never sent to server">
                        <PasswordInput
                          value={masterPassword}
                          onChange={setMasterPassword}
                          show={showMaster}
                          onToggle={() => setShowMaster((v) => !v)}
                          autoComplete="new-password"
                          placeholder="Encryption key"
                          icon={<KeyRound className="h-4 w-4 text-lime-400/70" />}
                        />
                      </Field>

                      {masterPassword.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                              Entropy
                            </span>
                            <span className="font-medium text-lime-300">
                              {strength.label}
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden border border-white/5">
                            <div
                              className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-teal-400 to-lime-400"
                              style={{
                                width: `${strength.pct}%`,
                                boxShadow: "0 0 12px rgba(163,230,53,0.5)",
                              }}
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Info className="h-3 w-3" />
                            ~{entropy} bits. If forgotten, notes are unrecoverable
                            by design.
                          </p>
                        </div>
                      )}

                      <Field label="Confirm master password">
                        <PasswordInput
                          value={confirmMaster}
                          onChange={setConfirmMaster}
                          show={showMaster}
                          onToggle={() => setShowMaster((v) => !v)}
                          autoComplete="new-password"
                          placeholder="Re-enter master password"
                          icon={<KeyRound className="h-4 w-4 text-lime-400/70" />}
                        />
                      </Field>
                      {confirmMaster.length > 0 && !passwordsMatch && (
                        <p className="text-xs text-rose-400">
                          Master passwords do not match.
                        </p>
                      )}

                      <Button
                        type="submit"
                        className="w-full btn-brand border-0 h-10"
                        disabled={busy}
                      >
                        {busy ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Generating keys…
                          </>
                        ) : (
                          "Create encrypted vault"
                        )}
                      </Button>
                      <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-lime-400/5 border border-lime-400/15 rounded-md p-2.5">
                        <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-lime-400/70" />
                        <span>
                          A unique salt and random data-encryption key are
                          generated in your browser. We store only ciphertext.
                        </span>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>
      </div>

      <footer className="relative z-10 border-t border-white/5 bg-black/30 backdrop-blur py-4 px-6">
        <div className="flex items-center justify-center gap-2 flex-wrap max-w-4xl mx-auto">
          <span className="chip chip-teal">Zero-knowledge</span>
          <span className="text-xs text-muted-foreground text-center">
            All encryption happens in your browser. We never see your master
            password or plaintext.
          </span>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <li className="flex items-center gap-3 group">
      <div className="grid place-items-center h-9 w-9 rounded-lg bg-teal-400/10 ring-1 ring-teal-400/25 text-teal-300 shrink-0 group-hover:glow-teal-sm transition-all">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="font-medium leading-tight">{title}</div>
        <div className="font-mono text-[11px] text-muted-foreground leading-tight mt-0.5">
          {sub}
        </div>
      </div>
    </li>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && (
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase no-wrap">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  placeholder,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete?: string;
  placeholder?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="relative">
      {icon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2">{icon}</span>
      )}
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        className={`${icon ? "pl-9 pr-10" : "pr-10"} bg-white/5 border-white/10 input-brand`}
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-lime-300 transition-colors"
        tabIndex={-1}
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
