import { GoogleGenAI } from "@google/genai";

/** Swap the AI vendor by changing only this file. Server-side only. */
export interface AiProvider {
  /** images = JPEG data URLs. Returns parsed JSON (unvalidated). */
  generateJson(prompt: string, images: string[], schema?: unknown, opts?: { timeoutMs?: number }): Promise<unknown>;
}

/** The AI backend cannot be used at all (no key / Ollama not running / model not pulled). Retrying is pointless. */
export class ProviderUnavailableError extends Error {}
export class MissingKeyError extends ProviderUnavailableError {}
export class OllamaUnavailableError extends ProviderUnavailableError {}

/** Messages that mean "backend not available" (→ HTTP 503 in the routes instead of 502). */
export const isUnavailableMessage = (m: string) => /GEMINI_API_KEY|Start Ollama|ollama pull/i.test(m);

const DEFAULT_MODEL = "gemini-3.8-flash";
/** Other current fast flash models listed in the @google/genai SDK `Model` type. */
const DEFAULT_FALLBACK_MODELS = ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

function fallbackModels(primary: string): string[] {
  const env = process.env.GEMINI_FALLBACK_MODELS;
  const list = env ? env.split(",").map((m) => m.trim()).filter(Boolean) : DEFAULT_FALLBACK_MODELS;
  return list.filter((m) => m !== primary);
}

/** 429 / 503 / overloaded / timeout → worth trying another model. */
function isRetryable(e: unknown): boolean {
  if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) return true;
  const status = (e as { status?: unknown } | null)?.status;
  if (status === 429 || status === 503) return true;
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /\b(429|503)\b|overload|unavailable|resource.?exhausted|quota|rate.?limit|timeout|timed out|aborted/i.test(msg);
}

const geminiProvider: AiProvider = {
  async generateJson(prompt, images, schema, opts) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new MissingKeyError("GEMINI_API_KEY is not set on the server.");
    const ai = new GoogleGenAI({ apiKey });
    const parts = [
      ...images.map((url) => ({
        inlineData: { mimeType: "image/jpeg", data: url.slice(url.indexOf(",") + 1) },
      })),
      { text: prompt },
    ];
    const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    // One deadline for the whole call incl. model fallbacks (opts.timeoutMs is a TOTAL budget, not per model).
    const deadline = opts?.timeoutMs ? Date.now() + opts.timeoutMs : null;
    const call = async (model: string, share = 1) => {
      const left = deadline === null ? null : Math.round((deadline - Date.now()) * share);
      if (left !== null && left < 1000) throw new DOMException("AI time budget used up", "TimeoutError");
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          responseMimeType: "application/json",
          ...(schema ? { responseJsonSchema: schema } : {}),
          temperature: 0.4,
          ...(left !== null ? { abortSignal: AbortSignal.timeout(left) } : {}),
        },
      });
      const text = res.text;
      if (!text) throw new Error("Empty AI response");
      const json = JSON.parse(text);
      console.log(`[ai] answered by model ${model}${model === primary ? "" : " (fallback)"}`);
      return json;
    };
    try {
      // with a budget and fallbacks available, the primary gets 60% so a hung model leaves time for another
      return await call(primary, deadline !== null && fallbackModels(primary).length > 0 ? 0.6 : 1);
    } catch (e) {
      if (!isRetryable(e)) throw e;
      console.warn(`[ai] ${primary} failed (${String(e instanceof Error ? e.message : e).slice(0, 120)}), trying fallback`);
      let last: unknown = e;
      const chain = fallbackModels(primary);
      for (const [i, model] of chain.entries()) {
        try {
          // each fallback gets half of what is left (the last one all of it), so one hung model cannot starve the rest
          return await call(model, deadline !== null && i < chain.length - 1 ? 0.5 : 1); // first fallback that answers wins
        } catch (e2) {
          last = e2;
          if (!isRetryable(e2) || (deadline !== null && deadline - Date.now() < 1000)) break;
        }
      }
      throw last;
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Ollama (local, default). Docs: https://docs.ollama.com/api (POST /api/chat, GET /api/tags),
// structured outputs via the `format` field: https://docs.ollama.com/capabilities/structured-outputs
// ---------------------------------------------------------------------------------------------
export const DEFAULT_OLLAMA_MODEL = "qwen3-vl:8b-instruct"; // 6.2 GB local vision model
export const DEFAULT_OLLAMA_FALLBACK_MODEL = "qwen3-vl:4b-instruct"; // 3.3 GB compact fallback
const OLLAMA_TIMEOUT_MS = 90_000;

export type ProviderName = "ollama" | "gemini";
export const providerName = (): ProviderName => (process.env.AI_PROVIDER?.trim().toLowerCase() === "gemini" ? "gemini" : "ollama");

const ollamaUrl = () => (process.env.OLLAMA_URL?.trim() || "http://localhost:11434").replace(/\/+$/, "");
const START_OLLAMA = () => `Start Ollama (it is not reachable at ${ollamaUrl()}): open the Ollama app or run "ollama serve". Or use demo mode.`;

/** At most OLLAMA_MAX_FRAMES (default 4), evenly spread: small local models are slow with many images. */
function pickFrames(images: string[]): string[] {
  const max = Math.max(1, Number(process.env.OLLAMA_MAX_FRAMES) || 4);
  if (images.length <= max) return images;
  return Array.from({ length: max }, (_, i) => images[Math.round((i * (images.length - 1)) / (max - 1 || 1))]);
}

const ollamaKeepAlive = () => process.env.OLLAMA_KEEP_ALIVE?.trim() || "30m";

/** Loads the model into RAM so the first real Analyze is not slow. Never throws; returns what happened. */
export async function warmUpOllama(): Promise<{ ok: boolean; model?: string; seconds?: number; error?: string }> {
  if (providerName() !== "ollama") return { ok: false, error: "provider is not ollama" };
  const t0 = Date.now();
  try {
    const names = await installedModels(5000);
    const primary = process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
    const fallback = process.env.OLLAMA_FALLBACK_MODEL?.trim() || DEFAULT_OLLAMA_FALLBACK_MODEL;
    const model = hasModel(names, primary) ? primary : hasModel(names, fallback) ? fallback : null;
    if (!model) return { ok: false, error: `model ${primary} not pulled` };
    const res = await fetch(`${ollamaUrl()}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({ model, prompt: "", stream: false, keep_alive: ollamaKeepAlive(), options: { num_ctx: Number(process.env.OLLAMA_NUM_CTX) || 8192 } }),
    });
    if (!res.ok) return { ok: false, model, error: `HTTP ${res.status}` };
    return { ok: true, model, seconds: Math.round((Date.now() - t0) / 100) / 10 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

let tagsCache: { at: number; url: string; names: string[] } | null = null;

async function installedModels(timeoutMs: number): Promise<string[]> {
  const url = ollamaUrl();
  if (tagsCache && tagsCache.url === url && Date.now() - tagsCache.at < 10_000) return tagsCache.names;
  let res: Response;
  try {
    res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(Math.min(5000, timeoutMs)) });
  } catch {
    throw new OllamaUnavailableError(START_OLLAMA());
  }
  if (!res.ok) throw new OllamaUnavailableError(START_OLLAMA());
  const json = (await res.json().catch(() => null)) as { models?: { name?: string; model?: string }[] } | null;
  const names = (json?.models ?? []).map((m) => m.name ?? m.model ?? "").filter(Boolean);
  tagsCache = { at: Date.now(), url, names };
  return names;
}

const hasModel = (names: string[], wanted: string) => names.some((n) => n === wanted || n === `${wanted}:latest` || (!wanted.includes(":") && n.startsWith(`${wanted}:`)));

/** Strips ```json fences some models add even with a JSON format. */
export function parseModelJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error("Model did not return JSON");
  }
}

const ollamaProvider: AiProvider = {
  async generateJson(prompt, images, schema, opts) {
    const total = opts?.timeoutMs ?? OLLAMA_TIMEOUT_MS;
    const deadline = Date.now() + total;
    const names = await installedModels(total);
    const primary = process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
    const fallback = process.env.OLLAMA_FALLBACK_MODEL?.trim() || DEFAULT_OLLAMA_FALLBACK_MODEL;
    let model = primary;
    if (!hasModel(names, primary)) {
      if (hasModel(names, fallback)) {
        model = fallback;
        console.warn(`[ai] ${primary} is not pulled, using ${fallback}`);
      } else {
        throw new OllamaUnavailableError(`Model not installed. Run: ollama pull ${primary}   (smaller: ollama pull ${fallback})`);
      }
    }
    const left = deadline - Date.now();
    if (left < 1000) throw new DOMException("AI time budget used up", "TimeoutError");
    let res: Response;
    try {
      res = await fetch(`${ollamaUrl()}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(left),
        body: JSON.stringify({
          model,
          stream: false,
          think: false, // thinking models: skip the long reasoning phase, we only need the JSON
          format: schema ?? "json",
          keep_alive: ollamaKeepAlive(), // keep the model in RAM between calls (default 30m)
          options: { temperature: 0.2, num_ctx: Number(process.env.OLLAMA_NUM_CTX) || 8192, num_predict: 3000 },
          messages: [
            {
              role: "user",
              content: prompt,
              ...(images.length ? { images: pickFrames(images).map((u) => u.slice(u.indexOf(",") + 1)) } : {}),
            },
          ],
        }),
      });
    } catch (e) {
      if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) throw e;
      throw new OllamaUnavailableError(START_OLLAMA());
    }
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 200);
      if (res.status === 404) throw new OllamaUnavailableError(`Model not installed. Run: ollama pull ${model}`);
      throw new Error(`Ollama HTTP ${res.status}: ${body}`);
    }
    const json = (await res.json()) as { message?: { content?: string } };
    const text = json.message?.content;
    if (!text) throw new Error("Empty AI response");
    console.log(`[ai] answered by ollama ${model}`);
    return parseModelJson(text);
  },
};

/** Provider is chosen per call from AI_PROVIDER ("ollama" default | "gemini"). */
export const provider: AiProvider = {
  generateJson: (prompt, images, schema, opts) =>
    (providerName() === "gemini" ? geminiProvider : ollamaProvider).generateJson(prompt, images, schema, opts),
};

/** Total AI time allowed for the one-shot whole-shift script (local models are slower than Gemini). */
export const shiftBudgetMs = () => (providerName() === "gemini" ? 25_000 : 60_000);
export const scenarioBudgetMs = () => (providerName() === "gemini" ? 18_000 : 45_000);
