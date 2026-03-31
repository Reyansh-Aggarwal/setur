import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, Window as TauriWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import type { Preset } from "../types/presets";

/* ─── tiny icons ─────────────────────────────────────────────────────────── */

function DefaultIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="w-10 h-10 text-zinc-400"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

/* ─── Toast ───────────────────────────────────────────────────────────────── */

interface ToastProps {
  message: string;
  onDone: () => void;
}

function Toast({ message, onDone }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 animate-[fadeSlideUp_0.25s_ease-out]">
      <div className="flex items-start gap-2 bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-3 py-2 shadow-xl max-w-xs">
        <span className="mt-0.5 text-amber-400 shrink-0">⚠</span>
        <span>Failed to launch: <span className="font-medium text-white">{message}</span></span>
      </div>
    </div>
  );
}

/* ─── Preset Card ─────────────────────────────────────────────────────────── */

interface CardProps {
  preset: Preset;
  loading: boolean;
  onClick: () => void;
}

function PresetCard({ preset, loading, onClick }: CardProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={[
        "group relative flex flex-col items-center justify-center gap-3",
        "w-full aspect-square rounded-xl border border-zinc-800",
        "bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-600",
        "transition-all duration-150 ease-out",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70",
      ].join(" ")}
    >
      {/* shimmer overlay while launching */}
      {loading && (
        <div className="absolute inset-0 rounded-xl overflow-hidden">
          <div className="absolute inset-0 animate-[shimmer_1.2s_linear_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full" />
        </div>
      )}

      {/* icon */}
      <div className="flex items-center justify-center w-12 h-12">
        {preset.icon ? (
          <img
            src={preset.icon}
            alt={preset.name}
            className="w-10 h-10 object-contain rounded"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
              (e.target as HTMLImageElement).nextElementSibling?.removeAttribute("style");
            }}
          />
        ) : null}
        <span style={{ display: preset.icon ? "none" : undefined }}>
          <DefaultIcon />
        </span>
      </div>

      {/* name */}
      <span className="text-zinc-200 text-xs font-medium leading-tight text-center px-1 line-clamp-2 group-hover:text-white transition-colors">
        {preset.name}
      </span>
    </button>
  );
}

/* ─── Boot Page ───────────────────────────────────────────────────────────── */

export default function Boot() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── load presets on mount ─────────────────────────────────────────────── */
  useEffect(() => {
    const checkFirstLaunch = async () => {
      try {
        const isFirst = await invoke<boolean>("is_first_launch");
        if (isFirst) {
          openMain();
          return;
        }

        const data = await invoke<Preset[]>("load_presets");
        setPresets(data);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    };

    checkFirstLaunch();
  }, []);

  /* ── helpers ───────────────────────────────────────────────────────────── */
  const selfHide = async () => {
    const win = await getCurrentWindow();
    await win.hide();
  };

  const openMain = async () => {
    try {
      const main = await TauriWindow.getByLabel("main");
      if (main) {
        await main.show();
        await main.unminimize();
        await main.setFocus();
      }
    } catch (e) {
      console.error("Failed to open main window:", e);
    }
    await selfHide();
  };
  const showToast = (msg: string) => {
    if (clearToast.current) clearTimeout(clearToast.current);
    setToast(msg);
  };

  const handleLaunch = async (preset: Preset) => {
    if (launchingId) return;
    setLaunchingId(preset.id);
    try {
      const failed = await invoke<string[]>("launch_preset", { id: preset.id });
      if (failed.length > 0) {
        showToast(failed.join(", "));
        // stay open briefly so the user can see the toast
        setTimeout(selfHide, 3600);
      } else {
        selfHide();
      }
    } catch (err) {
      showToast(String(err));
    } finally {
      setLaunchingId(null);
    }
  };

  /* ── render ────────────────────────────────────────────────────────────── */
  return (
    <div
      // drag region covers the whole window (borderless)
      data-tauri-drag-region
      className="relative flex flex-col w-screen h-screen bg-zinc-950 text-white select-none overflow-hidden"
    >
      {/* ── header ── */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0"
      >
        <span className="text-xs font-semibold tracking-widest text-zinc-500 uppercase">
          Setur
        </span>

        <div className="flex items-center gap-1.5">
          <button
            onClick={openMain}
            title="Settings"
            className="flex items-center gap-1 text-zinc-500 hover:text-zinc-200 text-xs px-2 py-1 rounded-md hover:bg-zinc-800 transition-all"
          >
            <SettingsIcon />
            <span>Settings</span>
          </button>

          <button
            onClick={selfHide}
            title="Skip"
            className="text-zinc-600 hover:text-zinc-300 text-xs px-2 py-1 rounded-md hover:bg-zinc-800 transition-all"
          >
            Skip
          </button>
        </div>
      </div>

      {/* ── body ── */}
      <div className="flex-1 px-4 pb-4 overflow-y-auto">
        {status === "loading" && (
          <div className="flex items-center justify-center h-full">
            <div className="w-5 h-5 rounded-full border-2 border-zinc-700 border-t-indigo-500 animate-spin" />
          </div>
        )}

        {status === "error" && (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            Failed to load presets.
          </div>
        )}

        {status === "ready" && presets.length > 0 && (
          <>
            <p className="text-xs text-zinc-500 mb-3">Choose a preset to launch</p>
            <div className="grid grid-cols-3 gap-2">
              {presets.map((preset) => (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  loading={launchingId === preset.id}
                  onClick={() => handleLaunch(preset)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── toast ── */}
      {toast && (
        <Toast message={toast} onDone={() => setToast(null)} />
      )}
    </div>
  );
}
