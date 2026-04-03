import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

function Toggle({ checked, onChange }: { checked: boolean, onChange: (c: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="relative w-[34px] h-[20px] rounded-[10px] border-[0.5px] cursor-pointer transition-[background-color,border-color] duration-150 shrink-0 outline-none"
      style={{
        backgroundColor: checked ? '#1f6e38' : '#1e1c1a',
        borderColor: checked ? '#2a7a40' : '#2e2c29',
      }}
    >
      <div
        className="absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full transition-transform duration-150"
        style={{
          backgroundColor: checked ? '#6de898' : '#4a4845',
          transform: checked ? 'translateX(14px)' : 'translateX(0px)'
        }}
      />
    </button>
  );
}

export default function Settings() {
  const [autostart, setAutostart] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const as = await invoke<boolean>("get_autostart_enabled");
        setAutostart(as);
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleAutostartChange = async (val: boolean) => {
    setAutostart(val);
    try {
      await invoke("set_autostart", { enabled: val });
    } catch (err) {
      console.error(err);
      setAutostart(!val); // revert
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-[#0f0e0d] text-[#d0cdc6] overflow-hidden">
        <div className="flex items-center justify-center flex-1">
          <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-indigo-500 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 h-full bg-[#0f0e0d] text-[#d0cdc6] overflow-hidden">
      {/* Top Accent Bar */}
      <div
        className="w-full h-[2px] shrink-0"
        style={{ background: `linear-gradient(90deg, #5a8ad4 0%, transparent 75%)` }}
      />

      {/* Header */}
      <div className="flex flex-row items-center gap-[8px] px-[20px] pt-[14px] pb-[13px] border-b-[0.5px] border-[#1c1a18] shrink-0">
        <svg
          width="14" height="14" viewBox="0 0 16 16" fill="none"
          className="text-[#d0cdc6] opacity-60"
        >
          <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" fill="currentColor" />
          <path d="M13 8a5.3 5.3 0 00-.1-.9l1.2-.9-1-1.8-1.4.5a5 5 0 00-1.6-.9L9.8 3h-2l-.3 1a5 5 0 00-1.6.9l-1.4-.5-1 1.8 1.2.9A5.3 5.3 0 004.6 8c0 .3 0 .6.1.9l-1.2.9 1 1.8 1.4-.5a5 5 0 001.6.9l.3 1h2l.3-1a5 5 0 001.6-.9l1.4.5 1-1.8-1.2-.9c.1-.3.1-.6.1-.9z" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        <span className="text-[14px] font-medium text-[#d0cdc6]">Settings</span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-[20px] flex flex-col gap-[6px]">

        {/* Group 1 */}
        <div className="text-[11px] uppercase tracking-[0.09em] text-[#3a3835] pb-[7px]">Startup</div>
        <div className="flex items-center justify-between p-[11px_14px] bg-[#131211] border-[0.5px] border-[#1e1c1a] rounded-[7px] mb-[4px] hover:border-[#282522] transition-[background-color,border-color] duration-100 gap-[16px]">
          <div className="flex flex-col gap-[1px]">
            <span className="text-[13px] text-[#c8c5be]">Launch on startup</span>
            <span className="text-[11px] text-[#4a4845]">Show the boot window automatically when Windows starts</span>
          </div>
          <Toggle checked={autostart} onChange={handleAutostartChange} />
        </div>

        {/* Group 2 */}
        <div className="text-[11px] uppercase tracking-[0.09em] text-[#3a3835] pb-[7px] mt-[10px]">About</div>
        <div className="flex items-center justify-between p-[11px_14px] bg-[#131211] border-[0.5px] border-[#1e1c1a] rounded-[7px] mb-[4px] hover:border-[#282522] transition-[background-color,border-color] duration-100 gap-[16px]">
          <div className="flex flex-col gap-[1px]">
            <span className="text-[13px] text-[#c8c5be]">Version</span>
            <span className="text-[11px] text-[#4a4845]">Setur v0.1.1</span>
          </div>
        </div>

      </div>
    </div>
  );
}
