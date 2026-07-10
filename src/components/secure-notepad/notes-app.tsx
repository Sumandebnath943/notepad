"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock,
  LogOut,
  Plus,
  Search,
  FileText,
  Trash2,
  Save,
  Loader2,
  Check,
  Settings,
  Menu,
  X,
  Clock,
  Binary,
  Cpu,
} from "lucide-react";
import { useAuthStore, type DecryptedNote } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { LogoMark } from "@/components/brand/logo";

type SaveState = "idle" | "saving" | "saved" | "dirty";

export function NotesApp() {
  const user = useAuthStore((s) => s.user);
  const notes = useAuthStore((s) => s.notes);
  const notesLoading = useAuthStore((s) => s.notesLoading);
  const refreshNotes = useAuthStore((s) => s.refreshNotes);
  const createNote = useAuthStore((s) => s.createNote);
  const updateNote = useAuthStore((s) => s.updateNote);
  const deleteNote = useAuthStore((s) => s.deleteNote);
  const lock = useAuthStore((s) => s.lock);
  const logout = useAuthStore((s) => s.logout);
  const lockTimeoutMs = useAuthStore((s) => s.lockTimeoutMs);
  const setLockTimeout = useAuthStore((s) => s.setLockTimeout);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [query, setQuery] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DecryptedNote | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentNote = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId]
  );

  useEffect(() => {
    void refreshNotes().catch(() => {
      toast.error("Failed to load notes");
    });
  }, []);

  useEffect(() => {
    if (currentNote) {
      setTitle(currentNote.title);
      setBody(currentNote.body);
      setSaveState("idle");
    }
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !currentNote) return;
    if (title === currentNote.title && body === currentNote.body) {
      return;
    }
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        await updateNote(selectedId, title, body);
        setSaveState("saved");
      } catch {
        setSaveState("dirty");
        toast.error("Failed to save note");
      }
    }, 900);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [title, body, selectedId, currentNote, updateNote]);

  const filtered = useMemo(() => {
    if (!query.trim()) return notes;
    const q = query.toLowerCase();
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)
    );
  }, [notes, query]);

  async function handleNewNote() {
    try {
      const created = await createNote("Untitled note", "");
      setSelectedId(created.id);
      setSidebarOpen(false);
      toast.success("New note created");
    } catch {
      toast.error("Could not create note");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    try {
      await deleteNote(id);
      if (selectedId === id) setSelectedId(null);
      toast.success("Note deleted");
    } catch {
      toast.error("Could not delete note");
    } finally {
      setDeleteTarget(null);
    }
  }

  function handleLock() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    lock();
    toast.info("Vault locked");
  }

  async function handleLogout() {
    await logout();
    toast.info("Signed out");
  }

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-white/8 glass-strong relative z-20">
        <div className="flex items-center justify-between h-14 px-3 sm:px-4 gap-3">
          {/* Left cluster: menu (mobile) + brand + status */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden hover:bg-white/5 shrink-0 h-9 w-9"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="Toggle notes list"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>

            {/* Brand lockup — logo mark + wordmark + email (responsive) */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="grid place-items-center h-8 w-8 rounded-lg bg-teal-400/10 ring-1 ring-teal-400/30 shrink-0 glow-teal-sm">
                <LogoMark size={20} />
              </div>
              <div className="hidden sm:block min-w-0 leading-tight">
                <div className="text-sm font-semibold tracking-tight no-wrap">
                  <span className="text-foreground">AEGIS</span>
                  <span className="text-lime-400"> VAULT</span>
                </div>
                <div className="font-mono text-[10px] text-muted-foreground no-wrap">
                  {user?.email}
                </div>
              </div>
            </div>

            {/* Status chips — only on wider screens to avoid crowding */}
            <div className="hidden xl:flex items-center gap-1.5 ml-1">
              <span className="chip chip-lime">
                <span className="h-1.5 w-1.5 rounded-full bg-lime-400 anim-pulse-glow" />
                Unlocked
              </span>
              <span className="chip chip-teal">
                <Binary className="h-3 w-3" />
                AES-256-GCM
              </span>
            </div>
          </div>

          {/* Right cluster: actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <SettingsDialog
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
              lockTimeoutMs={lockTimeoutMs}
              onLockTimeoutChange={setLockTimeout}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleLock}
              className="gap-1.5 btn-outline h-9"
            >
              <Lock className="h-4 w-4" />
              <span className="hidden sm:inline">Lock</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="gap-1.5 text-muted-foreground hover:bg-white/5 h-9"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden md:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 relative">
        {/* ── Sidebar ─────────────────────────────────────────────── */}
        <aside
          className={`
            ${sidebarOpen ? "block" : "hidden"} lg:block
            absolute lg:static inset-0 z-30 lg:z-auto
            w-full sm:w-80 lg:w-80 shrink-0
            glass-strong border-r border-white/8 lg:relative
          `}
        >
          <div className="flex flex-col h-full">
            <div className="p-3 space-y-2 border-b border-white/8">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search notes…"
                  className="pl-9 h-9 bg-white/5 border-white/10 input-brand"
                />
              </div>
              <Button
                onClick={handleNewNote}
                className="w-full btn-brand border-0 gap-1.5 h-9"
                size="sm"
              >
                <Plus className="h-4 w-4" />
                New note
              </Button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scroll">
              {notesLoading ? (
                <div className="p-8 flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin text-lime-400" />
                  <span className="font-mono text-[11px] tracking-wider">
                    Decrypting notes…
                  </span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-8 flex flex-col items-center gap-3 text-center text-muted-foreground">
                  <div className="grid place-items-center h-12 w-12 rounded-xl bg-teal-400/5 ring-1 ring-teal-400/20">
                    <FileText className="h-5 w-5 text-teal-300/80" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {query ? "No matches" : "No notes yet"}
                    </p>
                    <p className="text-xs mt-0.5">
                      {query
                        ? "Try a different search."
                        : "Create your first encrypted note."}
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="p-2 space-y-1">
                  {filtered.map((note) => (
                    <li key={note.id}>
                      <button
                        onClick={() => {
                          setSelectedId(note.id);
                          setSidebarOpen(false);
                        }}
                        className={`relative w-full text-left rounded-lg p-3 transition-all group ${
                          selectedId === note.id
                            ? "bg-lime-400/8 ring-1 ring-lime-400/35 glow-lime-sm"
                            : "hover:bg-white/5 ring-1 ring-transparent"
                        }`}
                      >
                        {selectedId === note.id && (
                          <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-lime-400 glow-lime-sm" />
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-medium truncate flex-1 min-w-0">
                            {note.title || "Untitled note"}
                          </h3>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(note);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.stopPropagation();
                                setDeleteTarget(note);
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-400 transition-all p-1 -m-1 rounded shrink-0"
                            aria-label="Delete note"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1 break-words">
                          {note.body || "No content"}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground/60 mt-1.5 tracking-wider">
                          {formatDistanceToNow(new Date(note.updatedAt), {
                            addSuffix: true,
                          })}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="p-3 border-t border-white/8 flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-lime-400/70 shrink-0" />
              <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase no-wrap">
                Auto-lock · {Math.round(lockTimeoutMs / 60000)} min idle
              </span>
            </div>
          </div>
        </aside>

        {/* Backdrop for mobile sidebar */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Editor ──────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 flex flex-col relative">
          <div className="absolute inset-0 dot-bg dot-bg-fade opacity-25 pointer-events-none" />
          <AnimatePresence mode="wait">
            {currentNote ? (
              <motion.div
                key={currentNote.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex-1 flex flex-col min-h-0 relative"
              >
                <div className="flex-1 overflow-y-auto custom-scroll">
                  <div className="max-w-5xl mx-auto px-6 sm:px-12 lg:px-16 py-8 sm:py-10">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="chip chip-lime">
                        <Lock className="h-2.5 w-2.5" />
                        Encrypted
                      </span>
                    </div>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Untitled note"
                      className="w-full bg-transparent text-2xl sm:text-3xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/30 mb-4 focus:text-lime-50 transition-colors"
                    />
                    <Textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Start writing… Everything you type is encrypted in your browser before it reaches the server."
                      className="w-full min-h-[60vh] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 text-base leading-relaxed p-0 placeholder:text-muted-foreground/30"
                    />
                  </div>
                </div>
                <div className="shrink-0 border-t border-white/8 glass-strong px-4 py-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2 min-w-0">
                    <SaveIndicator state={saveState} />
                  </div>
                  <span className="hidden sm:inline font-mono text-[10px] tracking-wider no-wrap">
                    Updated{" "}
                    {formatDistanceToNow(new Date(currentNote.updatedAt), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </motion.div>
            ) : (
              <EmptyEditor onNew={handleNewNote} />
            )}
          </AnimatePresence>
        </main>
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent className="glass-solid border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.title || "Untitled note"}&quot; will be
              permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-white/5 hover:bg-white/10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-rose-600 hover:bg-rose-700 text-white border-0"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving")
    return (
      <span className="flex items-center gap-1.5 text-amber-300 min-w-0">
        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
        <span className="font-mono text-[10px] tracking-wider uppercase no-wrap">
          Encrypting & saving…
        </span>
      </span>
    );
  if (state === "saved")
    return (
      <span className="flex items-center gap-1.5 text-lime-400 min-w-0">
        <Check className="h-3 w-3 shrink-0" />
        <span className="font-mono text-[10px] tracking-wider uppercase no-wrap">
          Saved
        </span>
      </span>
    );
  if (state === "dirty")
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground min-w-0">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400/70 shrink-0" />
        <span className="font-mono text-[10px] tracking-wider uppercase no-wrap">
          Unsaved changes
        </span>
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground min-w-0">
      <Save className="h-3 w-3 shrink-0" />
      <span className="font-mono text-[10px] tracking-wider uppercase no-wrap">
        Auto-save on
      </span>
    </span>
  );
}

function EmptyEditor({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center relative">
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 160 }}
        className="relative grid place-items-center h-24 w-24 mb-6"
      >
        <div className="absolute inset-0 rounded-2xl border border-teal-400/15 anim-spin-slow" />
        <div className="absolute inset-0 rounded-2xl border-t border-teal-400/50 anim-spin-slow" />
        <div className="relative grid place-items-center h-16 w-16 rounded-2xl bg-teal-400/10 ring-1 ring-teal-400/40 glow-teal">
          <LogoMark size={34} />
        </div>
      </motion.div>
      <h2 className="text-xl font-semibold mb-2 tracking-tight">
        Select a note to begin
      </h2>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        Your notes are encrypted on this device before upload. Pick one from the
        list, or create something new.
      </p>
      <Button onClick={onNew} className="btn-brand border-0 gap-1.5 h-10">
        <Plus className="h-4 w-4" />
        Create a note
      </Button>
      <div className="mt-10 flex items-center gap-3 flex-wrap justify-center font-mono text-[10px] tracking-[0.18em] text-muted-foreground/60 uppercase">
        <span className="flex items-center gap-1.5">
          <Cpu className="h-3 w-3" /> Argon2id
        </span>
        <span className="text-white/10">·</span>
        <span className="flex items-center gap-1.5">
          <Binary className="h-3 w-3" /> AES-256-GCM
        </span>
        <span className="text-white/10">·</span>
        <span>Zero-knowledge</span>
      </div>
    </div>
  );
}

function SettingsDialog({
  open,
  onOpenChange,
  lockTimeoutMs,
  onLockTimeoutChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lockTimeoutMs: number;
  onLockTimeoutChange: (ms: number) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Settings"
          className="hover:bg-white/5 h-9 w-9"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-solid border-white/10">
        <DialogHeader>
          <DialogTitle>Security settings</DialogTitle>
          <DialogDescription>
            Configure auto-lock timing. Keys are wiped from memory on lock.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-lime-400" /> Auto-lock after
              inactivity
            </Label>
            <Select
              value={String(lockTimeoutMs)}
              onValueChange={(v) => onLockTimeoutChange(Number(v))}
            >
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="60000">1 minute</SelectItem>
                <SelectItem value="300000">5 minutes</SelectItem>
                <SelectItem value="600000">10 minutes</SelectItem>
                <SelectItem value="1800000">30 minutes</SelectItem>
                <SelectItem value="3600000">1 hour</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Your vault locks automatically after this period of inactivity.
              Keys are wiped from memory.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            className="btn-brand border-0"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
