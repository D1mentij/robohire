import { GoogleGenAI } from "@google/genai";

/** Swap the AI vendor by changing only this file. Server-side only. */
export interface AiProvider {
  /** images = JPEG data URLs. Returns parsed JSON (unvalidated). */
  generateJson(prompt: string, images: string[], schema?: unknown): Promise<unknown>;
}

export class MissingKeyError extends Error {}

const DEFAULT_MODEL = "gemini-3.8-flash";

export const geminiProvider: AiProvider = {
  async generateJson(prompt, images, schema) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new MissingKeyError("GEMINI_API_KEY is not set on the server.");
    const ai = new GoogleGenAI({ apiKey });
    const parts = [
      ...images.map((url) => ({
        inlineData: { mimeType: "image/jpeg", data: url.slice(url.indexOf(",") + 1) },
      })),
      { text: prompt },
    ];
    const res = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        ...(schema ? { responseJsonSchema: schema } : {}),
        temperature: 0.4,
      },
    });
    const text = res.text;
    if (!text) throw new Error("Empty AI response");
    return JSON.parse(text);
  },
};

export const provider: AiProvider = geminiProvider;
