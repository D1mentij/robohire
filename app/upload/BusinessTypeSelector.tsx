"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AUTO_DETECT_ID,
  AUTO_DETECT_LABEL,
  BUSINESS_CATEGORIES,
  BUSINESS_PRESETS,
  CUSTOM_PRESET_ID,
  CUSTOM_PRESET_LABEL,
  type BusinessPreset,
} from "@/lib/ai/businessPresets";

export type BusinessSelection =
  | { mode: "preset"; preset: BusinessPreset }
  | { mode: "auto" }
  | { mode: "custom"; customText: string };

type Props = {
  selection: BusinessSelection;
  onSelectPreset: (preset: BusinessPreset) => void;
  onSelectAuto: () => void;
  onSelectCustom: () => void;
  onCustomTextChange: (text: string) => void;
  disabled?: boolean;
};

const QUICK_PICKS = BUSINESS_PRESETS.filter((p) => p.quickPick);

export function BusinessTypeSelector({
  selection,
  onSelectPreset,
  onSelectAuto,
  onSelectCustom,
  onCustomTextChange,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (selection.mode === "custom") {
      requestAnimationFrame(() => customInputRef.current?.focus());
    }
  }, [selection.mode]);

  const filteredByCategory = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BUSINESS_CATEGORIES.map((category) => ({
      category,
      items: BUSINESS_PRESETS.filter(
        (p) =>
          p.category === category &&
          (!q ||
            p.label.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q) ||
            p.expectedZones.toLowerCase().includes(q)),
      ),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  const showAutoInList =
    !query.trim() ||
    AUTO_DETECT_LABEL.toLowerCase().includes(query.trim().toLowerCase()) ||
    "auto".includes(query.trim().toLowerCase());

  const showCustomInList =
    !query.trim() ||
    CUSTOM_PRESET_LABEL.toLowerCase().includes(query.trim().toLowerCase()) ||
    "other".includes(query.trim().toLowerCase());

  const triggerLabel =
    selection.mode === "preset"
      ? selection.preset.label
      : selection.mode === "auto"
        ? AUTO_DETECT_LABEL
        : selection.customText.trim()
          ? `Custom: ${selection.customText.trim()}`
          : CUSTOM_PRESET_LABEL;

  const triggerBadge =
    selection.mode === "preset"
      ? selection.preset.category
      : selection.mode === "auto"
        ? "Vision AI"
        : "Custom";

  const chipBase =
    "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
  const chipActive =
    "border-sky-500/60 bg-sky-500/15 text-sky-700 dark:border-sky-400/60 dark:bg-sky-500/20 dark:text-sky-200";
  const chipIdle =
    "border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800";

  return (
    <div ref={containerRef} className="space-y-2.5">
      {/* Categorized searchable combobox trigger */}
      <div className="relative">
        <button
          type="button"
          data-testid="business-type-trigger"
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => {
            setQuery("");
            setOpen((v) => !v);
          }}
          className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-left text-sm text-slate-900 shadow-2xs transition focus:border-sky-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{triggerLabel}</span>
            <span className="shrink-0 rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {triggerBadge}
            </span>
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${open ? "rotate-180" : ""}`}
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {open && (
          <div
            role="listbox"
            data-testid="business-type-dropdown"
            className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="border-b border-slate-200 p-2 dark:border-slate-800">
              <input
                ref={searchRef}
                type="text"
                data-testid="business-type-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search industry (e.g. retail, gym, clinic, hotel)..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>

            <div className="max-h-72 overflow-y-auto p-1.5">
              {filteredByCategory.map(({ category, items }) => (
                <div key={category} className="mb-1.5 last:mb-0">
                  <div className="px-2.5 py-1 text-[11px] font-bold tracking-wider text-slate-500 uppercase dark:text-slate-400">
                    {category}
                  </div>
                  {items.map((preset) => {
                    const active = selection.mode === "preset" && selection.preset.id === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        data-testid={`business-option-${preset.id}`}
                        onClick={() => {
                          onSelectPreset(preset);
                          setOpen(false);
                        }}
                        className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition ${
                          active
                            ? "bg-sky-500/15 font-semibold text-sky-700 dark:bg-sky-500/20 dark:text-sky-200"
                            : "text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                        }`}
                      >
                        <span className="truncate">{preset.label}</span>
                        <span className="shrink-0 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {preset.defaultHoursPerWeek}h/wk · €{preset.defaultHourlyCost.toFixed(1)}/h
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}

              {(showAutoInList || showCustomInList) && (
                <div className="mt-1 border-t border-slate-200 pt-1.5 dark:border-slate-800">
                  <div className="px-2.5 py-1 text-[11px] font-bold tracking-wider text-slate-500 uppercase dark:text-slate-400">
                    Auto / Custom
                  </div>
                  {showAutoInList && (
                    <button
                      type="button"
                      role="option"
                      aria-selected={selection.mode === "auto"}
                      data-testid={`business-option-${AUTO_DETECT_ID}`}
                      onClick={() => {
                        onSelectAuto();
                        setOpen(false);
                      }}
                      className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition ${
                        selection.mode === "auto"
                          ? "bg-sky-500/15 font-semibold text-sky-700 dark:bg-sky-500/20 dark:text-sky-200"
                          : "text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span>{AUTO_DETECT_LABEL}</span>
                      <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                        Vision AI infers type
                      </span>
                    </button>
                  )}
                  {showCustomInList && (
                    <button
                      type="button"
                      role="option"
                      aria-selected={selection.mode === "custom"}
                      data-testid={`business-option-${CUSTOM_PRESET_ID}`}
                      onClick={() => {
                        onSelectCustom();
                        setOpen(false);
                      }}
                      className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition ${
                        selection.mode === "custom"
                          ? "bg-sky-500/15 font-semibold text-sky-700 dark:bg-sky-500/20 dark:text-sky-200"
                          : "text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span>{CUSTOM_PRESET_LABEL}</span>
                      <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                        Type any space
                      </span>
                    </button>
                  )}
                </div>
              )}

              {filteredByCategory.length === 0 && !showAutoInList && !showCustomInList && (
                <div className="px-3 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                  No preset matches &ldquo;{query}&rdquo;.{" "}
                  <button
                    type="button"
                    className="cursor-pointer font-semibold text-sky-600 underline dark:text-sky-400"
                    onClick={() => {
                      onSelectCustom();
                      onCustomTextChange(query.trim());
                      setOpen(false);
                    }}
                  >
                    Use as custom business type
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quick-pick chips */}
      <div className="flex flex-wrap gap-1.5" aria-label="Quick business presets">
        {QUICK_PICKS.map((preset) => {
          const active = selection.mode === "preset" && selection.preset.id === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              data-testid={`quick-chip-${preset.id}`}
              onClick={() => onSelectPreset(preset)}
              className={`${chipBase} ${active ? chipActive : chipIdle}`}
            >
              {preset.label}
            </button>
          );
        })}
        <button
          type="button"
          disabled={disabled}
          data-testid={`quick-chip-${AUTO_DETECT_ID}`}
          onClick={onSelectAuto}
          className={`${chipBase} ${selection.mode === "auto" ? chipActive : chipIdle}`}
        >
          {AUTO_DETECT_LABEL}
        </button>
        <button
          type="button"
          disabled={disabled}
          data-testid={`quick-chip-${CUSTOM_PRESET_ID}`}
          onClick={onSelectCustom}
          className={`${chipBase} ${selection.mode === "custom" ? chipActive : chipIdle}`}
        >
          Other / Custom
        </button>
      </div>

      {/* Free-text custom business type input */}
      {selection.mode === "custom" && (
        <div className="pt-0.5">
          <input
            ref={customInputRef}
            type="text"
            data-testid="custom-business-type-input"
            disabled={disabled}
            maxLength={100}
            value={selection.customText}
            onChange={(e) => onCustomTextChange(e.target.value)}
            placeholder="Type any business type (e.g. Yoga Studio, Pet Clinic, Bookstore)..."
            className="w-full rounded-xl border border-sky-500/60 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-2xs transition focus:border-sky-500 focus:outline-none dark:border-sky-500/50 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
      )}
    </div>
  );
}
