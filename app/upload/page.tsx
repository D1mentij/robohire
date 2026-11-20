"use client";

import { useState } from "react";
import { extractFrames, loadVideo } from "@/lib/ai/extractFrames";
import { UPLOAD_STORAGE_KEY, type UploadData } from "@/lib/ai/types";

const MAX_SECONDS = 60;

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [businessType, setBusinessType] = useState("");
  const [hoursPerWeek, setHoursPerWeek] = useState("");
  const [hourlyCost, setHourlyCost] = useState("12");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [frames, setFrames] = useState<string[]>([]);

  const busy = progress !== null;
  const totalKb = Math.round(frames.reduce((n, f) => n + f.length * 0.75, 0) / 1024);

  async function onFile(f: File | null) {
    setFile(null);
    setFrames([]);
    setErrors((e) => ({ ...e, video: "" }));
    if (!f) return;
    try {
      const { video, url } = await loadVideo(f);
      URL.revokeObjectURL(url);
      if (video.duration > MAX_SECONDS) {
        setErrors((e) => ({ ...e, video: `Video is ${Math.round(video.duration)} s; max is ${MAX_SECONDS} s.` }));
        return;
      }
      setFile(f);
    } catch (err) {
      setErrors((e) => ({ ...e, video: err instanceof Error ? err.message : "Unsupported video" }));
    }
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const errs: Record<string, string> = {};
    if (!file) errs.video = "Please choose a video (max 60 s).";
    if (!businessType.trim()) errs.businessType = "Enter a business type.";
    const hours = Number(hoursPerWeek);
    if (!(hours > 0 && hours <= 168)) errs.hoursPerWeek = "Enter hours per week (1–168).";
    const cost = Number(hourlyCost);
    if (!(cost > 0)) errs.hourlyCost = "Enter an hourly cost above 0.";
    setErrors(errs);
    if (Object.keys(errs).length || !file) return;

    setFrames([]);
    setProgress({ done: 0, total: 8 });
    try {
      const out = await extractFrames(file, {
        count: 8,
        maxSide: 768,
        quality: 0.7,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setFrames(out);
      const data: UploadData = { businessType: businessType.trim(), hoursPerWeek: hours, hourlyCost: cost, frames: out };
      sessionStorage.setItem(UPLOAD_STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      setErrors({ video: err instanceof Error ? err.message : "Frame extraction failed" });
    } finally {
      setProgress(null);
    }
  }

  const input = "w-full rounded border border-gray-300 px-3 py-2";
  const err = (k: string) => (errors[k] ? <p className="mt-1 text-sm text-red-600">{errors[k]}</p> : null);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Upload a video of your space</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block font-medium">Video (max {MAX_SECONDS} s)</label>
          <input type="file" accept="video/*" capture="environment" disabled={busy}
            onChange={(e) => onFile(e.target.files?.[0] ?? null)} className={input} />
          {err("video")}
        </div>
        <div>
          <label className="mb-1 block font-medium">Business type</label>
          <input value={businessType} onChange={(e) => setBusinessType(e.target.value)} placeholder="café" className={input} />
          {err("businessType")}
        </div>
        <div>
          <label className="mb-1 block font-medium">Opening hours per week</label>
          <input type="number" min={1} max={168} value={hoursPerWeek} onChange={(e) => setHoursPerWeek(e.target.value)} className={input} />
          {err("hoursPerWeek")}
        </div>
        <div>
          <label className="mb-1 block font-medium">Staff hourly cost (€)</label>
          <input type="number" min={0} step="0.5" value={hourlyCost} onChange={(e) => setHourlyCost(e.target.value)} className={input} />
          {err("hourlyCost")}
        </div>
        <div className="flex gap-3">
          <button type="submit" disabled={busy} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
            {busy ? "Extracting…" : "Extract frames"}
          </button>
          <button type="button" disabled title="Coming in the next step" className="rounded border px-4 py-2 opacity-50">
            Analyze
          </button>
        </div>
      </form>

      {progress && (
        <div>
          <progress value={progress.done} max={progress.total} className="w-full" />
          <p className="text-sm text-gray-600">Frame {progress.done} / {progress.total}</p>
        </div>
      )}

      {frames.length > 0 && (
        <section>
          <p className="mb-2 text-sm text-gray-600">{frames.length} frames, {totalKb} KB total · saved to sessionStorage</p>
          <div className="grid grid-cols-4 gap-2">
            {frames.map((f, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={f} alt={`Frame ${i + 1}`} className="aspect-video w-full rounded object-cover" />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
