import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, Window as TauriWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import type { Preset } from "../types/presets";

/* ─── tiny icons ─────────────────────────────────────────────────────────── */

function SeturLogo() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="6" height="6" rx="1.5" fill="#5a5855" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" fill="#5a5855" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" fill="#5a5855" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" fill="#2e2c28" />
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
      <div className="flex items-start gap-2 bg-[#181614] border border-[#2e2c28] text-text-secondary text-xs rounded-[8px] px-3 py-2 shadow-xl max-w-xs">
        <span className="mt-0.5 text-[#E5534B] shrink-0">⚠</span>
        <span>Failed to launch: <span className="font-medium text-[#d4d1ca]">{message}</span></span>
      </div>
    </div>
  );
}

/* ─── Preset Card ─────────────────────────────────────────────────────────── */

interface CardProps {
  preset: Preset;
  loading: boolean;
  onClick: () => void;
  accentColor: string;
}

function PresetCard({ preset, loading, onClick, accentColor }: CardProps) {
  const itemCount = preset.apps.length + preset.urls.length;

  return (
    <div
      role="button"
      onClick={onClick}
      className={
        "group relative flex items-center gap-[10px] w-full cursor-pointer " +
        "rounded-[9px] bg-[#181614] border-[0.5px] border-[#252320] px-[12px] py-[10px] " +
        "overflow-hidden transition-all duration-150 ease-out " +
        "hover:bg-[#1e1c1a] hover:border-[#383430] " +
        (loading ? "opacity-50 pointer-events-none" : "")
      }
    >
      {/* Accent strip on hover */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[2px] opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: accentColor }}
      />

      {/* 7x7 circle */}
      <div
        className="shrink-0 rounded-full w-[7px] h-[7px]"
        style={{
          backgroundColor: accentColor,
          boxShadow: `0 0 6px ${accentColor}66` // 40% opacity hex is 66
        }}
      />

      {/* Name */}
      <span className="text-[13px] font-medium text-[#d0cdc6] truncate">
        {preset.name}
      </span>

      <div className="flex-1" />

      {/* Count */}
      <span className="text-[11px] text-[#3e3c39] whitespace-nowrap">
        {itemCount} {itemCount === 1 ? 'item' : 'items'}
      </span>

      {/* Chevron */}
      <span className="text-[13px] text-[#2e2c29] leading-none shrink-0 relative top-[0.5px] ml-1">›</span>
    </div>
  );
}

const ACCENT_COLORS = ["#4aad6a", "#5a8ad4", "#c4883a", "#9a6ac8"];

/* ─── Boot Page ───────────────────────────────────────────────────────────── */

export default function Boot() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ─── load presets on mount ─────────────────────────────────────────────── */
  const loadPresets = async () => {
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

  useEffect(() => {
    loadPresets();
  }, []);

  /* ── refresh on window show ────────────────────────────────────────────── */
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      const win = await getCurrentWindow();
      unlisten = await win.listen("tauri://window-shown", () => {
        loadPresets();
      });
    };

    setupListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);


  /* ── dynamic resize effect ────────────────────────────────────────────── */
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "ready") {
      const resize = async () => {
        if (containerRef.current) {
          try {
            const { LogicalSize } = await import("@tauri-apps/api/window");
            const height = containerRef.current.scrollHeight;
            const win = await getCurrentWindow();
            await win.setSize(new LogicalSize(360, height));
          } catch (e) {
            console.error("Resize failed:", e);
          }
        }
      };

      resize(); // Immediate pass
      const t1 = setTimeout(resize, 200);
      const t2 = setTimeout(resize, 600);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [status, presets]);

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

  const hour = new Date().getHours();
  let greeting = "Good evening";
  if (hour < 12) greeting = "Good morning";
  else if (hour < 18) greeting = "Good afternoon";

  return (
    <div
      ref={containerRef}
      data-tauri-drag-region
      className="relative flex flex-col w-[360px] bg-[#0f0e0d] border-[0.5px] border-[#2e2c28] rounded-[14px] p-[26px_22px_16px] gap-4 font-sans select-none opacity-0 animate-[fadeUp_0.18s_ease_forwards]"
    >
      {/* Header row */}
      <div data-tauri-drag-region className="flex items-center gap-[10px]">
        <div className="flex items-center justify-center w-[30px] h-[30px] shrink-0 bg-[#1e1d1b] border-[0.5px] border-[#333028] rounded-[8px]">
          <SeturLogo />
        </div>
        <div className="flex flex-col">
          <span className="text-[13px] font-medium text-[#d4d1ca] leading-tight">Setur</span>
          <span className="text-[11px] text-[#52504c]">{greeting}</span>
        </div>
      </div>

      {/* Divider */}
      <div className="w-full border-t-[0.5px] border-[#222120]" />

      {/* List area */}
      <div className="flex flex-col">
        <p className="text-[12px] text-[#6a6763] mb-[10px]">What are you working on today?</p>

        {status === "loading" && (
          <div className="py-4 text-center text-[12px] text-[#52504c]">Loading...</div>
        )}
        {status === "error" && (
          <div className="py-4 text-center text-[12px] text-[#E5534B]">Failed to load presets</div>
        )}
        {status === "ready" && (
          <div className="flex flex-col gap-2">
            {presets.map((preset, idx) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                loading={launchingId === preset.id}
                onClick={() => handleLaunch(preset)}
                accentColor={preset.color || ACCENT_COLORS[idx % ACCENT_COLORS.length]}
              />
            ))}
            {presets.length === 0 && (
              <div className="py-4 text-center text-[12px] text-[#52504c]">
                No presets found. <span className="cursor-pointer text-[#4aad6a] hover:underline" onClick={openMain}>Create one</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-1">
        <button
          onClick={selfHide}
          className="text-[12px] text-[#3a3835] hover:text-[#6a6763] transition-[color] duration-100 bg-transparent border-none p-0 cursor-pointer outline-none shrink-0"
        >
          Skip for now
        </button>

        <div className="flex items-center gap-1.5">
          <button
            onClick={openMain}
            className="flex items-center gap-[5px] text-[12px] text-[#4a4845] px-[8px] py-[5px] border-[0.5px] border-[#222120] rounded-[6px] bg-[#111010] hover:border-[#3a3835] hover:text-[#7a7673] transition-[background-color,border-color,color] duration-100 cursor-pointer outline-none shrink-0"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" />
              <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" />
              <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" />
              <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.4" />
            </svg>
            Manage
          </button>

          <button
            onClick={() => presets.length > 0 && handleLaunch(presets[0])}
            disabled={presets.length === 0 || status !== "ready"}
            className="text-[12px] text-[#52504c] hover:border-[#3a3835] hover:text-[#d4d1ca] transition-[background-color,border-color,color] duration-100 bg-[#161412] border-[0.5px] border-[#272522] rounded-[6px] px-[9px] py-[6px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed outline-none shrink-0"
          >
            ↺ Same as yesterday
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
