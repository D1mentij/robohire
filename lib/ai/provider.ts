import { GoogleGenAI } from "@google/genai";

/** Swap the AI vendor by changing only this file. Server-side only. */
export interface AiProvider {
  /** images = JPEG data URLs. Returns parsed JSON (unvalidated). */
  generateJson(prompt: string, images: string[], schema?: unknown, opts?: { timeoutMs?: number }): Promise<unknown>;
}

export class MissingKeyError extends Error {}

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

export const geminiProvider: AiProvider = {
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

export const provider: AiProvider = geminiProvider;
