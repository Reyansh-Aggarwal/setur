import { invoke } from "@tauri-apps/api/core";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState } from "react";
import type { Preset } from "../types/presets";
import { Window as TauriWindow } from "@tauri-apps/api/window";
import Settings from "./Settings";
import Builder from "./Builder";

interface ManagerProps { }

// ── Drag Handle Icon ───────────────────────────────────────────────────────────
function DragHandle() {
  return (
    <svg
      className="w-4 h-4 text-text-secondary group-hover:text-text-primary transition-colors"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </svg>
  );
}

// ── Sortable Preset Row ────────────────────────────────────────────────────────
interface PresetRowProps {
  preset: Preset;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

function PresetRow({ preset, onEdit, onDelete, isDeleting }: PresetRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: preset.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  const appCount = preset.apps.length;
  const urlCount = preset.urls.length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${isDragging
        ? "bg-bg-raised border-text-secondary shadow-xl"
        : "bg-surface border-border hover:border-text-muted"
        }`}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab active:cursor-grabbing touch-none p-0.5 focus:outline-none"
        tabIndex={-1}
        aria-label="Drag to reorder"
      >
        <DragHandle />
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-md font-medium text-[#d0cdc6] truncate">{preset.name}</p>
        <p className="text-[11px] text-text-secondary mt-0.5">
          {[
            appCount > 0 && `${appCount} app${appCount !== 1 ? "s" : ""}`,
            urlCount > 0 && `${urlCount} URL${urlCount !== 1 ? "s" : ""}`,
          ]
            .filter(Boolean)
            .join(" · ") || "Empty preset"}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-bg-surface hover:bg-bg-raised border border-border hover:border-text-muted rounded-lg transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
          </svg>
          Edit
        </button>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-muted hover:text-danger bg-bg-surface hover:bg-danger/10 border border-border hover:border-danger/30 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          {isDeleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}

// ── Confirm Delete Dialog ──────────────────────────────────────────────────────
interface ConfirmDialogProps {
  presetName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ presetName, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#0f0e0d]/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      {/* Panel */}
      <div className="relative w-80 bg-bg-surface border border-border rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-danger/10 border border-danger/20 mb-4 mx-auto">
          <svg className="w-5 h-5 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="text-sm font-semibold text-text-primary text-center mb-1">Delete preset?</h2>
        <p className="text-[11px] text-text-secondary text-center mb-5">
          <span className="text-text-primary font-medium">"{presetName}"</span> will be permanently removed.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-2 text-sm text-text-secondary bg-bg-surface hover:bg-bg-raised border border-border rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-3 py-2 text-sm font-medium text-text-primary bg-danger hover:bg-danger/80 rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manager Page ───────────────────────────────────────────────────────────────
const ACCENT_COLORS = ["#4aad6a", "#5a8ad4", "#c4883a", "#9a6ac8"];

export default function Manager({ }: ManagerProps) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Preset | null>(null);
  const [activeView, setActiveView] = useState<'presets' | 'settings' | 'builder'>('presets');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    invoke<Preset[]>("load_presets")
      .then(setPresets)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = presets.findIndex((p) => p.id === active.id);
    const newIndex = presets.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(presets, oldIndex, newIndex);

    setPresets(reordered);
    try {
      await invoke("reorder_presets", { ids: reordered.map((p) => p.id) });
    } catch (err) {
      console.error("Failed to reorder presets:", err);
      // Revert on failure
      setPresets(presets);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmDelete) return;
    const { id } = confirmDelete;
    setConfirmDelete(null);
    setDeletingId(id);
    try {
      await invoke("delete_preset", { id });
      setPresets((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Failed to delete preset:", err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-row w-full h-full bg-[#0f0e0d]">
      {/* ── Left Sidebar ── */}
      <div className="w-[204px] bg-[#0c0b0a] border-r-[0.5px] border-[#1c1a18] flex flex-col h-full shrink-0">
        {/* Sidebar top */}
        <div className="px-[14px] pt-[14px] pb-[13px] border-b-[0.5px] border-[#181614] shrink-0 flex items-center gap-[10px]">
          <div className="w-[23px] h-[23px] shrink-0 bg-[#181614] border-[0.5px] border-[#272320] rounded-[6px] flex items-center justify-center">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="6" height="6" rx="1.5" fill="#a8a5a0" />
              <rect x="9" y="1" width="6" height="6" rx="1.5" fill="#a8a5a0" />
              <rect x="1" y="9" width="6" height="6" rx="1.5" fill="#a8a5a0" />
              <rect x="9" y="9" width="6" height="6" rx="1.5" fill="#52504c" />
            </svg>
          </div>
          <span className="text-[13px] font-medium text-[#a8a5a0] tracking-[0.04em]">Setur</span>
        </div>

        {/* Nav section */}
        <div className="p-[8px_7px] flex flex-col gap-[1px] shrink-0">
          <div
            onClick={() => setActiveView('presets')}
            onKeyDown={(e) => e.key === 'Enter' && setActiveView('presets')}
            role="button"
            tabIndex={0}
            className={`flex items-center gap-[8px] px-[8px] py-[7px] rounded-[7px] text-[12.5px] cursor-pointer transition-[background-color,color] duration-100 outline-none ${activeView === 'presets' ? 'bg-[#141210] text-[#a8a5a0]' : 'text-[#52504c] hover:bg-[#141210] hover:text-[#8a8784]'}`}
          >
            <div className="w-[6px] flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70 overflow-visible shrink-0">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <span>Home</span>
          </div>

          <div
            onClick={() => setActiveView('settings')}
            onKeyDown={(e) => e.key === 'Enter' && setActiveView('settings')}
            role="button"
            tabIndex={0}
            className={`flex items-center gap-[8px] px-[8px] py-[7px] rounded-[7px] text-[12.5px] cursor-pointer transition-[background-color,color] duration-100 outline-none ${activeView === 'settings' ? 'bg-[#141210] text-[#a8a5a0]' : 'text-[#52504c] hover:bg-[#141210] hover:text-[#8a8784]'}`}
          >
            <div className="w-[6px] flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="opacity-70 overflow-visible shrink-0">
                <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" fill="currentColor" />
                <path d="M13 8a5.3 5.3 0 00-.1-.9l1.2-.9-1-1.8-1.4.5a5 5 0 00-1.6-.9L9.8 3h-2l-.3 1a5 5 0 00-1.6.9l-1.4-.5-1 1.8 1.2.9A5.3 5.3 0 004.6 8c0 .3 0 .6.1.9l-1.2.9 1 1.8 1.4-.5a5 5 0 001.6.9l.3 1h2l.3-1a5 5 0 001.6-.9l1.4.5 1-1.8-1.2-.9c.1-.3.1-.6.1-.9z" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </div>
            <span>Settings</span>
          </div>
        </div>

        {/* Divider */}
        <div className="h-[0.5px] bg-[#181614] mx-2 my-1 shrink-0" />

        {/* Preset list in sidebar */}
        <div className="flex-1 overflow-y-auto px-[7px] pb-[6px] flex flex-col">
          <div className="text-[11px] uppercase tracking-[0.08em] text-[#2e2c29] px-[8px] pt-[4px] pb-[6px]">My Presets</div>
          {presets.map((preset, i) => {
            const accent = preset.color || ACCENT_COLORS[i % ACCENT_COLORS.length];
            const total = preset.apps.length + preset.urls.length;
            return (
              <div
                key={preset.id}
                onClick={() => {
                  setEditingPresetId(preset.id);
                  setActiveView('builder');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setEditingPresetId(preset.id);
                    setActiveView('builder');
                  }
                }}
                role="button"
                tabIndex={0}
                className={`flex items-center gap-[8px] px-[8px] py-[6px] rounded-[6px] text-[12px] cursor-pointer group transition-[background-color,color] duration-100 outline-none ${editingPresetId === preset.id ? 'bg-[#141210] text-[#a8a5a0]' : (activeView === 'presets' ? 'text-[#a8a5a0] hover:bg-[#141210]' : 'text-[#52504c] hover:bg-[#141210] hover:text-[#8a8784]')}`}
              >
                <div className="w-[6px] h-[6px] rounded-full shrink-0" style={{ backgroundColor: accent }} />
                <span className="flex-1 truncate">{preset.name}</span>
                <span className="text-[11px] text-[#2e2c29]">{total}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right Content Area ── */}
      {activeView === 'settings' ? (
        <Settings />
      ) : activeView === 'builder' ? (
        <Builder
          presetId={editingPresetId}
          onSaved={() => { setActiveView('presets'); invoke<Preset[]>("load_presets").then(setPresets); }}
          onRefresh={(id) => {
            setEditingPresetId(id);
            invoke<Preset[]>("load_presets").then(setPresets);
          }}
          onCancel={() => setActiveView('presets')}
        />
      ) : (
        <div className="flex-1 flex flex-col bg-[#0f0e0d] overflow-hidden">
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-bg-shell shrink-0">
            <div>
              <h1 className="text-lg font-semibold text-text-primary">Presets</h1>
              <p className="text-[11px] text-text-secondary mt-0.5">
                {presets.length === 0
                  ? "No presets yet"
                  : `${presets.length} preset${presets.length !== 1 ? "s" : ""}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  try {
                    const boot = await TauriWindow.getByLabel("boot");
                    if (boot) {
                      await boot.show();
                      await boot.unminimize();
                      await boot.setFocus();
                    }
                  } catch (e) {
                    console.error("Could not open boot window:", e);
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-bg-surface hover:bg-bg-raised text-text-secondary text-sm font-medium rounded-lg transition-colors border border-border"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <rect x="2" y="3" width="20" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M12 17v4" />
                </svg>
                Preview Boot
              </button>
              <button
                onClick={() => {
                  setEditingPresetId(null);
                  setActiveView('builder');
                }}
                className="flex items-center gap-2 px-4 py-2 bg-accent-green hover:bg-accent-green/80 text-bg-shell text-sm font-medium rounded-lg transition-colors shadow-lg shadow-accent-green/20"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                New Preset
              </button>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-indigo-500 animate-spin" />
              </div>
            ) : presets.length === 0 ? (
              // Empty state
              <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 text-center">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800">
                  <svg
                    className="w-7 h-7 text-zinc-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">No presets yet</p>
                  <p className="text-[11px] text-text-muted mt-1">Create your first preset to get started</p>
                </div>
                <button
                  onClick={() => {
                    setEditingPresetId(null);
                    setActiveView('builder');
                  }}
                  className="mt-2 flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-[#d4d1ca] text-sm font-medium rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Create First Preset
                </button>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={presets.map((p) => p.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {presets.map((preset) => (
                      <PresetRow
                        key={preset.id}
                        preset={preset}
                        onEdit={() => {
                          setEditingPresetId(preset.id);
                          setActiveView('builder');
                        }}
                        onDelete={() => setConfirmDelete(preset)}
                        isDeleting={deletingId === preset.id}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

        </div>
      )}

      {/* ── Confirm Delete Dialog ── */}
      {confirmDelete && (
        <ConfirmDialog
          presetName={confirmDelete.name}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
