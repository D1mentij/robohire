import { GoogleGenAI } from "@google/genai";

/** Swap the AI vendor by changing only this file. Server-side only. */
export interface AiProvider {
  /** images = JPEG data URLs. Returns parsed JSON (unvalidated). */
  generateJson(prompt: string, images: string[], schema?: unknown, opts?: { timeoutMs?: number }): Promise<unknown>;
}

export class MissingKeyError extends Error {}

const DEFAULT_MODEL = "gemini-3.8-flash";
/** Other current fast flash models listed in the @google/genai SDK `Model` type. */
const DEFAULT_FALLBACK_MODELS = ["gemini-3.7-flash", "gemini-3.6-flash"];

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
    const call = async (model: string) => {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          responseMimeType: "application/json",
          ...(schema ? { responseJsonSchema: schema } : {}),
          temperature: 0.4,
          ...(opts?.timeoutMs ? { abortSignal: AbortSignal.timeout(opts.timeoutMs) } : {}),
        },
      });
      const text = res.text;
      if (!text) throw new Error("Empty AI response");
      const json = JSON.parse(text);
      console.log(`[ai] answered by model ${model}${model === primary ? "" : " (fallback)"}`);
      return json;
    };
    try {
      return await call(primary);
    } catch (e) {
      if (!isRetryable(e)) throw e;
      console.warn(`[ai] ${primary} failed (${String(e instanceof Error ? e.message : e).slice(0, 120)}), trying fallback`);
      let last: unknown = e;
      for (const model of fallbackModels(primary)) {
        try {
          return await call(model); // one retry round: first fallback that answers wins
        } catch (e2) {
          last = e2;
          if (!isRetryable(e2)) break;
        }
      }
      throw last;
    }
  },
};

export const provider: AiProvider = geminiProvider;
