import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppEntry, AppInfo, Preset } from "../types/presets";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const GEMINI_MODEL = "gemini-2.0-flash";
const DEBOUNCE_MS = 400;

interface BuilderProps {
  presetId?: string | null; // null for new preset
  onSaved: () => void;
  onRefresh?: (id: string) => void;
  onCancel: () => void;
}

/** Ask Gemini for relevant app names from the provided list based on a preset name. */
async function fetchAiSuggestions(
  presetName: string,
  appNames: string[]
): Promise<string[]> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "your-api-key-here") return [];
  if (!presetName.trim() || appNames.length === 0) return [];

  const prompt = `You are a helpful assistant inside a desktop app launcher called "Setur".
The user is creating a preset named "${presetName}".
Below is the full list of installed applications on their computer:

${appNames.join("\n")}

Return a JSON array of app names from the list above that are most relevant to a preset called "${presetName}".
Only include apps that a user would realistically want in this preset. Be selective — quality over quantity.
Return ONLY the JSON array, no explanation or markdown fences. Example: ["App1", "App2"]`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 512,
        },
      }),
    }
  );

  if (!res.ok) return [];

  const data = await res.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  // Parse the JSON array out of the response (handle optional markdown fences)
  const cleaned = text.replace(/```json\s*|```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (Array.isArray(parsed)) return parsed as string[];
  return [];
}

export default function Builder({ presetId, onSaved, onCancel }: BuilderProps) {
  // Global / local Id
  const [localPresetId] = useState<string>(presetId || crypto.randomUUID());

  // Form State
  const [name, setName] = useState("");
  const [color, setColor] = useState("#4aad6a");
  const [selectedApps, setSelectedApps] = useState<AppEntry[]>([]);
  const [urls, setUrls] = useState<string[]>([]);

  // Edit Detail State
  const [isEditingDetail, setIsEditingDetail] = useState(!presetId);
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState("#4aad6a");

  // Local UI State
  const [availableApps, setAvailableApps] = useState<AppInfo[]>([]);
  const [search, setSearch] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // AI Suggestion State
  const [aiSuggestedPaths, setAiSuggestedPaths] = useState<Set<string>>(new Set());
  const [aiLoading, setAiLoading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Track paths the user has manually toggled so AI doesn't re-add them */
  const userToggledPaths = useRef<Set<string>>(new Set());

  // Load Initial Data
  useEffect(() => {
    setLoading(true);
    Promise.all([
      invoke<AppInfo[]>("get_installed_apps"),
      presetId ? invoke<Preset[]>("load_presets") : Promise.resolve([]),
    ])
      .then(([apps, presets]) => {
        // Deduplicate apps by path to avoid identical entries, and sort alphabetically
        const unique = Array.from(new Map(apps.map((a) => [a.path.toLowerCase(), a])).values());
        unique.sort((a, b) => a.name.localeCompare(b.name));
        setAvailableApps(unique);

        if (presetId) {
          const found = presets.find((p) => p.id === presetId);
          if (found) {
            setName(found.name);
            setDraftName(found.name);
            setColor(found.color || "#4aad6a");
            setDraftColor(found.color || "#4aad6a");
            setSelectedApps(found.apps);
            setUrls(found.urls);
          }
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [presetId]);

  // AI Suggestion Effect — fires on name change with debounce
  const requestAiSuggestions = useCallback(
    async (presetName: string, apps: AppInfo[]) => {
      // Cancel any in-flight request
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      if (!presetName.trim() || apps.length === 0) {
        setAiSuggestedPaths(new Set());
        setAiLoading(false);
        return;
      }

      setAiLoading(true);
      try {
        const appNames = apps.map((a) => a.name);
        const suggested = await fetchAiSuggestions(presetName, appNames);

        // Map suggested names back to app paths (case-insensitive match)
        const suggestedLower = new Set(suggested.map((s) => s.toLowerCase()));
        const matchedApps = apps.filter((a) => suggestedLower.has(a.name.toLowerCase()));

        // Only auto-select apps the user hasn't manually toggled
        const newSuggestedPaths = new Set<string>();
        const newSelectedApps: AppEntry[] = [];

        for (const app of matchedApps) {
          if (!userToggledPaths.current.has(app.path)) {
            newSuggestedPaths.add(app.path);
            newSelectedApps.push({ name: app.name, path: app.path });
          }
        }

        setAiSuggestedPaths(newSuggestedPaths);

        // Merge AI suggestions with any user-selected apps without duplicates
        setSelectedApps((prev) => {
          const existingPaths = new Set(prev.map((a) => a.path));
          const additions = newSelectedApps.filter((a) => !existingPaths.has(a.path));
          return [...prev, ...additions];
        });
      } catch {
        // Silently ignore AI errors
      } finally {
        setAiLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    // Don't fire AI suggestions when editing an existing preset (only for new)
    if (presetId) return;
    if (loading) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(() => {
      if (name.trim().length >= 3) {
        requestAiSuggestions(name, availableApps);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [name, availableApps, loading, presetId, requestAiSuggestions]);

  // Derived filtered apps
  const filteredApps = useMemo(() => {
    if (!search.trim()) return availableApps;
    const lower = search.toLowerCase();
    return availableApps.filter(
      (app) => app.name.toLowerCase().includes(lower) || app.path.toLowerCase().includes(lower)
    );
  }, [availableApps, search]);

  // Handlers
  const toggleApp = (app: AppInfo) => {
    userToggledPaths.current.add(app.path);

    setSelectedApps((prev) => {
      if (prev.some((p) => p.path === app.path)) {
        // Unchecking — also remove from AI badge set
        setAiSuggestedPaths((s) => {
          const next = new Set(s);
          next.delete(app.path);
          return next;
        });
        return prev.filter((p) => p.path !== app.path);
      } else {
        return [...prev, { name: app.name, path: app.path }];
      }
    });
  };

  const handleAddUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    // Simple URL validation (can prepend https:// if missing)
    let finalUrl = trimmed;
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    if (!urls.includes(finalUrl)) {
      setUrls((prev) => [...prev, finalUrl]);
    }
    setUrlInput("");
  };

  const removeUrl = (urlToRemove: string) => {
    setUrls((prev) => prev.filter((u) => u !== urlToRemove));
  };

  const handleCommitEdit = async () => {
    if (!draftName.trim()) return;
    setName(draftName.trim());
    setColor(draftColor);
    setIsEditingDetail(false);

    // Save immediate to backend
    const presetObj: Preset = {
      id: localPresetId,
      name: draftName.trim(),
      color: draftColor,
      apps: selectedApps,
      urls,
    };
    try {
      await invoke("save_preset", { preset: presetObj });
    } catch (err) {
      console.error("Failed to save preset details:", err);
    }
  };

  const handleCancelEdit = () => {
    // If it's a completely new preset and we haven't even given it a name, 
    // maybe cancel whole builder? The instruction says "discard changes, return to normal preset detail view"
    setDraftName(name);
    setDraftColor(color);
    setIsEditingDetail(false);
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    setSaving(true);
    const preset: Preset = {
      id: localPresetId,
      name: name.trim(),
      color,
      apps: selectedApps,
      urls,
    };

    try {
      await invoke("save_preset", { preset });
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onSaved();
      }, 2500);
    } catch (err) {
      console.error("Failed to save preset:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!presetId) return;
    try {
      await invoke("delete_preset", { id: presetId });
      onSaved(); // Return to list and refresh
    } catch (err) {
      console.error("Failed to delete preset:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-full text-text-secondary">
        <div className="w-6 h-6 rounded-full border-2 border-border border-t-accent-green animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col flex-1 h-full bg-[#0f0e0d] text-[#d0cdc6] overflow-hidden"
      style={{ '--accent': color } as React.CSSProperties}
    >
      {/* Top Accent Bar */}
      <div
        className="w-full h-[2px] shrink-0"
        style={{ background: `linear-gradient(90deg, ${color} 0%, transparent 80%)` }}
      />

      {/* ── Header ── */}
      <div className="flex flex-row justify-between items-center px-[20px] pt-[14px] pb-[13px] border-b-[0.5px] border-[#1c1a18] shrink-0">
        <div className="flex flex-row items-center gap-[8px]">
          {isEditingDetail ? (
            <span className="text-[13px] text-[#6a6763] font-medium">Editing preset</span>
          ) : (
            <>
              <div
                className="w-[8px] h-[8px] rounded-full shrink-0"
                style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}80` }}
              />
              <span className="text-[14px] font-medium text-[#d0cdc6] truncate max-w-[200px] block">{name}</span>
              <button
                onClick={() => {
                  setDraftName(name);
                  setDraftColor(color);
                  setIsEditingDetail(true);
                }}
                className="flex items-center justify-center p-[2px] text-[#6a6763] hover:text-[#d0cdc6] transition-colors outline-none cursor-pointer"
                title="Rename"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                </svg>
              </button>
            </>
          )}
        </div>
        <div className="flex flex-row items-center gap-[6px]">
          <button onClick={onCancel} className="flex items-center justify-center w-[28px] h-[28px] rounded-[6px] border-[0.5px] border-[#272320] bg-[#161412] hover:bg-[#1e1c1a] hover:border-[#383430] transition-colors cursor-pointer outline-none" title="Cancel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#a8a5a0]"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>

          {presetId && (
            <button
              onClick={handleDelete}
              className="flex items-center justify-center w-[28px] h-[28px] rounded-[6px] border-[0.5px] border-[#272320] bg-[#161412] hover:bg-danger/10 hover:text-danger hover:border-danger/30 transition-colors cursor-pointer outline-none group"
              title="Delete Preset"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#a8a5a0] group-hover:text-danger">
                <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          )}

          <button onClick={handleSave} disabled={saving || !name.trim()} className="flex items-center justify-center w-[28px] h-[28px] rounded-[6px] border-[0.5px] border-[#272320] bg-[#161412] hover:bg-[#1e1c1a] hover:border-[#383430] transition-colors disabled:opacity-50 cursor-pointer outline-none" title="Save">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#a8a5a0]"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
          </button>

          <button
            onClick={async () => {
              try {
                await invoke("launch_draft", { apps: selectedApps, urls: urls });
              } catch (err) {
                console.error("Failed to launch draft:", err);
              }
            }}
            style={{
              borderColor: `${color}80`,
              backgroundImage: `linear-gradient(to bottom, ${color}30, ${color}10)`
            }}
            className="flex items-center gap-[6px] h-[30px] px-[14px] rounded-[7px] border-[1px] hover:brightness-110 group shrink-0 cursor-pointer outline-none transition-all"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ color: color }} className="group-hover:brightness-110 transition-colors">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span style={{ color: color }} className="text-[12px] font-medium group-hover:brightness-110 transition-colors">Launch</span>
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto p-[20px] flex flex-col gap-[16px]">
        {isEditingDetail && (
          <div className="flex flex-col gap-[12px] pb-[16px] border-b-[0.5px] border-[#1c1a18] shrink-0">
            {/* Name field */}
            <div className="flex flex-col gap-[6px]">
              <label className="text-[11px] uppercase tracking-[0.08em] text-[#3a3835]">Preset name</label>
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                style={{
                  '--focus-color': draftColor
                } as any}
                className="flex-1 h-[32px] bg-[#131211] border-[0.5px] border-[#3a3835] focus:border-[var(--focus-color)] focus:shadow-[0_0_0_2px_var(--focus-color)] focus:shadow-opacity-[0.12] rounded-[7px] px-[10px] text-[13px] font-medium text-[#d4d1ca] font-inherit outline-none transition-all"
                autoFocus
              />
            </div>
            {/* Dot color picker */}
            <div className="flex flex-col gap-[6px]">
              <label className="text-[11px] uppercase tracking-[0.08em] text-[#3a3835]">Dot color</label>
              <div className="flex flex-row gap-[5px]">
                {['#4aad6a', '#5a8ad4', '#c4883a', '#9a6ac8', '#E5534B', '#4ab8c4', '#a8a5a0'].map(c => (
                  <div
                    key={c}
                    onClick={() => setDraftColor(c)}
                    onKeyDown={(e) => e.key === 'Enter' && setDraftColor(c)}
                    role="button"
                    tabIndex={0}
                    className="w-[14px] h-[14px] rounded-full cursor-pointer shrink-0 transition-[transform,box-shadow] duration-100 outline-none hover:scale-110 active:scale-95"
                    style={{
                      backgroundColor: c,
                      boxShadow: draftColor === c ? `0 0 0 2px #131211, 0 0 0 3.5px ${c}` : 'none'
                    }}
                  />
                ))}
              </div>
            </div>
            {/* Action buttons */}
            <div className="flex gap-[6px] mt-[2px]">
              <button
                onClick={handleCommitEdit}
                style={{
                  borderColor: `${draftColor}80`,
                  backgroundImage: `linear-gradient(to bottom, ${draftColor}30, ${draftColor}10)`,
                  color: draftColor
                }}
                className="h-[28px] px-[14px] rounded-[6px] border text-[12px] font-medium transition-all hover:brightness-110 cursor-pointer outline-none"
              >
                Save & back
              </button>
              <button
                onClick={handleCancelEdit}
                className="h-[28px] px-[12px] rounded-[6px] border-[0.5px] border-[#252320] bg-[#161412] text-[#5a5855] hover:text-[#8a8784] hover:bg-[#1a1816] text-[12px] transition-colors cursor-pointer outline-none"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* AI suggestion strip */}
        {!presetId && GEMINI_API_KEY && aiLoading && (
          <div className="p-[9px_11px] rounded-[7px] border-[0.5px] bg-bg-raised flex flex-row items-center gap-[8px]" style={{ borderColor: `${color}20` }}>
            <span className="text-[11px] font-medium rounded-[4px] px-[6px] py-[2px] shrink-0" style={{ backgroundColor: `${color}20`, border: `0.5px solid ${color}40`, color: color }}>AI</span>
            <span className="text-[12px] text-text-secondary flex-1">Analyzing apps...</span>
          </div>
        )}
        {!presetId && GEMINI_API_KEY && aiSuggestedPaths.size > 0 && !aiLoading && (
          <div className="p-[9px_11px] rounded-[7px] border-[0.5px] bg-bg-raised flex flex-row items-center gap-[8px]" style={{ borderColor: `${color}20` }}>
            <span className="text-[11px] font-medium rounded-[4px] px-[6px] py-[2px] shrink-0" style={{ backgroundColor: `${color}20`, border: `0.5px solid ${color}40`, color: color }}>AI</span>
            <span className="text-[12px] text-text-secondary flex-1">Suggested {aiSuggestedPaths.size} apps based on preset name</span>
            <span className="text-[11px] cursor-pointer hover:brightness-110" style={{ color: color }}>Review →</span>
          </div>
        )}

        {/* Selected Items */}
        <div className="flex flex-col gap-[8px]">
          <div className="text-[11px] uppercase tracking-[0.09em] text-[#3a3835] mt-[6px] mb-[4px]">Includes</div>

          {selectedApps.map((app) => (
            <div key={app.path} className="flex items-center gap-[10px] p-[8px_10px] rounded-[7px] border-[0.5px] border-[#1e1c1a] bg-[#131211] hover:border-[#282522] transition-colors group">
              <div className="w-[22px] h-[22px] flex items-center justify-center shrink-0 bg-[#1c1a18] border-[0.5px] border-[#242220] rounded-[5px]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#a8a5a0]"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
              </div>
              <span className="text-[12.5px] text-[#a8a5a0] flex-1 truncate">{app.name}</span>
              <span className="text-[11px] text-[#3e3c38] px-[7px] py-[2px] border-[0.5px] border-[#202020] rounded-[4px] bg-[#141312] shrink-0">App</span>
              <button type="button" onClick={() => toggleApp({ ...app, icon_path: null })} className="flex items-center justify-center w-[18px] h-[18px] rounded-[4px] text-[#333230] hover:bg-[#2a1414] hover:text-[#c05050] transition-colors outline-none cursor-pointer shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          ))}

          {urls.map((url) => (
            <div key={url} className="flex items-center gap-[10px] p-[8px_10px] rounded-[7px] border-[0.5px] border-[#1e1c1a] bg-[#131211] hover:border-[#282522] transition-colors group">
              <div className="w-[22px] h-[22px] flex items-center justify-center shrink-0 bg-[#1c1a18] border-[0.5px] border-[#242220] rounded-[5px]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#a8a5a0]"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
              </div>
              <span className="text-[12.5px] text-[#a8a5a0] flex-1 truncate">{url}</span>
              <span className="text-[11px] text-[#3e3c38] px-[7px] py-[2px] border-[0.5px] border-[#202020] rounded-[4px] bg-[#141312] shrink-0">URL</span>
              <button type="button" onClick={() => removeUrl(url)} className="flex items-center justify-center w-[18px] h-[18px] rounded-[4px] text-[#333230] hover:bg-[#2a1414] hover:text-[#c05050] transition-colors outline-none cursor-pointer shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          ))}


          {selectedApps.length === 0 && urls.length === 0 && (
            <div className="text-[12px] text-[#52504c] py-2">No items added yet.</div>
          )}
        </div>
        <div className="text-[11px] uppercase tracking-[0.09em] text-[#3a3835] mt-[16px] mb-[4px]">Custom URLs</div>
        <div className="flex gap-[8px]">
          <input
            type="text"
            placeholder="github.com"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className="flex-1 bg-[#131211] border-[0.5px] border-[#1e1c1a] focus:border-[#383430] rounded-[7px] px-[12px] py-[6px] text-[12.5px] text-[#a8a5a0] placeholder:text-[#52504c] outline-none transition-all"
          />
          <button
            type="button"
            onClick={handleAddUrl}
            disabled={!urlInput.trim()}
            className="px-[12px] bg-[#1a1714] hover:bg-[#1f1c1a] border-[0.5px] border-[#2a2622] rounded-[7px] text-[12px] text-[#d0cdc6] font-medium transition-colors disabled:opacity-50 cursor-pointer outline-none"
          >
            Add
          </button>
        </div>
        {/* Applications Section */}
        <div className="flex flex-col flex-1 mt-4">
          <div className="text-[11px] uppercase tracking-[0.09em] text-[#3a3835] mt-[6px] mb-[4px]">Library</div>

          <div className="relative mb-2">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#52504c]"
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search applications..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#131211] border-[0.5px] border-[#1e1c1a] focus:border-[#383430] rounded-[7px] pl-[32px] pr-[12px] py-[6px] text-[12.5px] text-[#a8a5a0] placeholder:text-[#52504c] outline-none transition-all"
            />
          </div>

          <div className="flex flex-col overflow-y-auto max-h-[300px]">
            {filteredApps.length === 0 ? (
              <div className="py-4 text-center text-[12.5px] text-[#52504c]">No applications found.</div>
            ) : (
              <div className="flex flex-col">
                {filteredApps.map((app) => {
                  const isSelected = selectedApps.some((p) => p.path === app.path);
                  if (isSelected) return null; // hide from library if already included
                  const isAiSuggested = aiSuggestedPaths.has(app.path);
                  return (
                    <label
                      key={app.path}
                      className={`flex items-center gap-[10px] p-[6px_8px] rounded-[6px] hover:bg-[#141210] cursor-pointer transition-colors group ${isAiSuggested ? "bg-[#131c15]" : ""}`}
                    >
                      <div className="relative flex items-center justify-center w-[16px] h-[16px] shrink-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleApp(app)}
                          style={{
                            backgroundColor: isSelected ? color : 'transparent',
                            borderColor: isSelected ? color : '#333230'
                          }}
                          className="peer appearance-none w-[16px] h-[16px] border-[0.5px] rounded-[3px] transition-colors cursor-pointer outline-none"
                        />
                        <svg
                          className="absolute w-[10px] h-[10px] text-[#0f0e0d] pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity"
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[12.5px] text-[#8a8784] truncate group-hover:text-[#a8a5a0] transition-colors">
                            {app.name}
                          </span>
                          {isAiSuggested && (
                            <span className="text-[11px] font-medium rounded-[3px] px-[4px] py-[1px] shrink-0" style={{ backgroundColor: `${color}20`, border: `0.5px solid ${color}40`, color: color }}>
                              Suggested
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Success Toast */}
      {showSuccess && (
        <div className="absolute top-[80px] right-[20px] z-50 animate-[fadeSlideUp_0.25s_ease-out]">
          <div className="flex items-center gap-[10px] bg-[#131211] border-[0.5px] border-[#282522] text-[#d0cdc6] text-[12.5px] rounded-[8px] px-[14px] py-[8px] shadow-2xl">
            <div className="flex items-center justify-center w-[18px] h-[18px] rounded-full bg-[#132a1a] text-[#52ad72]">
              <svg className="w-[10px] h-[10px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <span>Saved perfectly</span>
          </div>
        </div>
      )}
    </div>
  );
}
