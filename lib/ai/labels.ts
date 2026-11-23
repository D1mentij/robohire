import type { ScenarioStep } from "@/types/contracts";

/**
 * /robot shows a checklist of tasks grouped by step.label, so labels must be short (≤ 4 words), identical for all steps of
 * one task, and spoken texts stay short (≤ 8 words). Everything here is pure and used by every scenario builder.
 */
export const MAX_LABEL_WORDS = 4;
export const MAX_LABEL_CHARS = 32;
export const MAX_SAY_WORDS = 8;

const FILLER = /^(the|a|an|to|and|of|for|all|our|new|arriving|incoming)$/i;

/** "Greet arriving visitors at the entrance" → "Greet visitors at entrance"… capped at 4 words. */
export function shortLabel(text: string, fallback = "Task"): string {
  const words = text
    .replace(/\([^)]*\)/g, " ")
    .split(/[^A-Za-z0-9'&+-]+/)
    .filter(Boolean);
  const kept: string[] = [];
  for (const w of words) {
    if (kept.length >= MAX_LABEL_WORDS) break;
    if (FILLER.test(w) && kept.length > 0 && words.length > MAX_LABEL_WORDS) continue;
    kept.push(w);
  }
  let out = kept.join(" ");
  if (out.length > MAX_LABEL_CHARS) out = kept.slice(0, 3).join(" ").slice(0, MAX_LABEL_CHARS).trim();
  if (!out) return fallback;
  return out[0].toUpperCase() + out.slice(1);
}

const isGoodLabel = (l: unknown): l is string => typeof l === "string" && l.trim().length > 0 && l.trim().split(/\s+/).length <= MAX_LABEL_WORDS && l.trim().length <= MAX_LABEL_CHARS;

/** Spoken text ≤ 8 words: cut at a sentence end if one fits, else at 8 words. */
export function shortenSay(text: string, max = MAX_SAY_WORDS): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.split(" ").length <= max) return t;
  const sentences = t.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences[0].trim().split(" ").length <= max) return sentences[0].trim();
  const w = t.split(" ").slice(0, max);
  while (w.length > 3 && /^(a|an|the|to|and|or|of|for|in|on|at|with|your|our)$/i.test(w[w.length - 1].replace(/[,;:.]+$/, ""))) w.pop(); // no dangling "a"
  const cut = w.join(" ").replace(/[,;:\-–]+$/, "");
  return /[.!?]$/.test(cut) ? cut : `${cut}.`;
}

/**
 * Final pass over any scenario: a missing or too long label is replaced (long → shortened; missing → the previous step's label,
 * or `fallback` for the first steps), say texts are shortened. Never changes actions, targets or order.
 */
export function finalizeSteps(steps: ScenarioStep[], fallback: string): ScenarioStep[] {
  const fb = isGoodLabel(fallback) ? fallback.trim() : shortLabel(fallback);
  let prev: string | null = null;
  return steps.map((s) => {
    const raw = typeof s.label === "string" ? s.label.trim() : "";
    const label = raw ? (isGoodLabel(raw) ? raw : shortLabel(raw, prev ?? fb)) : (prev ?? fb);
    prev = label;
    const out: ScenarioStep = { ...s, label };
    if (s.action === "say" && typeof s.text === "string") out.text = shortenSay(s.text);
    return out;
  });
}
