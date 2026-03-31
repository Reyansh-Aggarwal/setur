import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppEntry, AppInfo, Preset } from "../types/presets";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const GEMINI_MODEL = "gemini-2.0-flash";
const DEBOUNCE_MS = 400;

interface BuilderProps {
  presetId?: string | null; // null for new preset
  onSaved: () => void;
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
  // Form State
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [selectedApps, setSelectedApps] = useState<AppEntry[]>([]);
  const [urls, setUrls] = useState<string[]>([]);

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
            setIcon(found.icon || null);
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

  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      setIcon(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    setSaving(true);
    const preset: Preset = {
      id: presetId || crypto.randomUUID(),
      name: name.trim(),
      icon,
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

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-full text-zinc-400">
        <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-200">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-900 bg-zinc-950 shrink-0">
        <h1 className="text-lg font-medium text-white">
          {presetId ? "Edit Preset" : "New Preset"}
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save Preset"}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">

        {/* Basic Info */}
        <section className="space-y-4">
          <div className="flex items-start gap-6">
            {/* Icon Picker */}
            <div className="flex flex-col items-center gap-2">
              <label
                htmlFor="icon-upload"
                className="relative flex items-center justify-center w-20 h-20 bg-zinc-900 border border-zinc-800 rounded-xl cursor-pointer hover:border-indigo-500 transition-colors group overflow-hidden"
              >
                {icon ? (
                  <img src={icon} alt="Icon preview" className="w-full h-full object-contain" />
                ) : (
                  <svg
                    className="w-8 h-8 text-zinc-500 group-hover:text-indigo-400 transition-colors"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                )}
                {/* Overlay on hover */}
                {icon && (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <span className="text-xs font-medium text-white">Change</span>
                  </div>
                )}
              </label>
              <input
                id="icon-upload"
                type="file"
                accept=".png,.jpg,.jpeg,.ico"
                className="hidden"
                onChange={handleIconChange}
              />
              <span className="text-xs text-zinc-500">Icon (Opt)</span>
            </div>

            {/* Name Input */}
            <div className="flex-1 space-y-2">
              <label className="block text-sm font-medium text-zinc-400">Preset Name</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g., Work Mode"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg px-4 py-2 text-white placeholder:text-zinc-600 outline-none transition-all"
                  autoFocus
                />
                {/* AI loading indicator next to name input */}
                {aiLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    <div className="w-3.5 h-3.5 rounded-full border-[1.5px] border-violet-500/30 border-t-violet-400 animate-spin" />
                    <span className="text-[11px] text-violet-400/70">AI</span>
                  </div>
                )}
              </div>
              {!presetId && GEMINI_API_KEY && GEMINI_API_KEY !== "your-api-key-here" && (
                <p className="text-[11px] text-zinc-600">
                  ✨ AI will suggest apps based on the preset name
                </p>
              )}
            </div>
          </div>
        </section>

        <hr className="border-zinc-900" />

        {/* URLs Section */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-medium text-white mb-1">Websites</h2>
            <p className="text-xs text-zinc-500">URLs to open in your default browser.</p>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="github.com"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg px-4 py-2 text-sm text-white placeholder:text-zinc-600 outline-none transition-all"
            />
            <button
              type="button"
              onClick={handleAddUrl}
              disabled={!urlInput.trim()}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              Add URL
            </button>
          </div>

          {urls.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {urls.map((url) => (
                <div
                  key={url}
                  className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-md text-sm group"
                >
                  <span className="text-zinc-300 truncate max-w-[200px]">{url}</span>
                  <button
                    type="button"
                    onClick={() => removeUrl(url)}
                    className="text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <hr className="border-zinc-900" />

        {/* Applications Section */}
        <section className="space-y-4 flex flex-col min-h-[400px]">
          <div>
            <h2 className="text-sm font-medium text-white mb-1">Applications</h2>
            <p className="text-xs text-zinc-500">Select programs to launch. Showing {filteredApps.length} installed apps.</p>
          </div>

          {/* Search Apps */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search applications..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder:text-zinc-600 outline-none transition-all"
            />
          </div>

          {/* App List */}
          <div className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-y-auto max-h-[500px]">
            {filteredApps.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-500">No applications found.</div>
            ) : (
              <div className="divide-y divide-zinc-800/50">
                {filteredApps.map((app) => {
                  const isSelected = selectedApps.some((p) => p.path === app.path);
                  const isAiSuggested = aiSuggestedPaths.has(app.path);
                  return (
                    <label
                      key={app.path}
                      className={`flex items-center gap-4 p-3 hover:bg-zinc-800/50 cursor-pointer transition-colors group ${isAiSuggested && isSelected ? "bg-violet-500/[0.04]" : ""
                        }`}
                    >
                      <div className="relative flex items-center justify-center w-5 h-5 shrink-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleApp(app)}
                          className="peer appearance-none w-5 h-5 border border-zinc-600 rounded bg-zinc-900 checked:bg-indigo-600 checked:border-indigo-600 transition-colors cursor-pointer"
                        />
                        <svg
                          className="absolute w-3.5 h-3.5 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity"
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-200 truncate group-hover:text-white transition-colors">
                            {app.name}
                          </span>
                          {isAiSuggested && isSelected && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-500/15 text-violet-400 border border-violet-500/20 shrink-0 animate-in fade-in">
                              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                              </svg>
                              AI suggested
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-zinc-500 truncate" title={app.path}>
                          {app.path}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </section>

      </div>

      {/* Success Toast */}
      {showSuccess && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 animate-[fadeSlideUp_0.25s_ease-out]">
          <div className="flex items-center gap-2.5 bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-xl px-4 py-2.5 shadow-2xl">
            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <span className="font-medium">Preset saved successfully</span>
          </div>
        </div>
      )}
    </div>
  );
}
