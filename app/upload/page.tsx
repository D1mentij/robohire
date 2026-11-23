"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startDemo } from "@/lib/ai/demo";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { applyShowcase, downloadCurrentAsShowcase, fetchShowcases, type Showcase } from "@/lib/ai/showcase";
import { getCached, hashInputs, putCached } from "@/lib/ai/uploadCache";
import { extractFrames, loadVideo } from "@/lib/ai/extractFrames";
import type { JobsResult, RobotPlan } from "@/types/contracts";
import {
  ANALYSIS_STORAGE_KEY,
  JOBS_STORAGE_KEY,
  PLAN_STORAGE_KEY,
  UPLOAD_STORAGE_KEY,
  clearRunStorage,
  type AnalysisResult,
  type AnalyzeResponse,
  type StoredAnalysis,
  type UploadData,
} from "@/lib/ai/types";

const MAX_SECONDS = 60;
// local models (Ollama) can need up to ~2 minutes for the one analysis call
const FETCH_TIMEOUT_MS = 130_000;

function netError(err: unknown, fallback: string): string {
  if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError"))
    return "The AI took too long (over 2 minutes). Try the smaller model (OLLAMA_MODEL=qwen3-vl:4b-instruct) or demo mode.";
  if (err instanceof TypeError) return "Network error — could not reach the server.";
  return err instanceof Error ? err.message : fallback;
}

const noopSubscribe = () => () => {};
/** /upload?dev=1 on a dev server only (never in a production build). */
const readDev = () => process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).get("dev") === "1";

export default function UploadPage() {
  const router = useRouter();
  const dev = useSyncExternalStore(noopSubscribe, readDev, () => false);
  const [showcases, setShowcases] = useState<Showcase[]>([]);
  useEffect(() => {
    let alive = true;
    void fetchShowcases().then((l) => alive && setShowcases(l));
    return () => {
      alive = false;
    };
  }, []);
  const [file, setFile] = useState<File | null>(null);
  const [businessType, setBusinessType] = useState("");
  const [hoursPerWeek, setHoursPerWeek] = useState("");
  const [hourlyCost, setHourlyCost] = useState("8.5");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [frames, setFrames] = useState<string[]>([]);

  const [checking, setChecking] = useState(false);
  const checkId = useRef(0);
  const hashRef = useRef<string | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState("");

  const [jobs, setJobs] = useState<JobsResult | null>(null);
  const [plan, setPlan] = useState<RobotPlan | null>(null);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState("");

  const [cached, setCached] = useState(false);
  const [runStart, setRunStart] = useState(0);
  const [jobsStart, setJobsStart] = useState(0);
  const [now, setNow] = useState(0);
  const running = analyzing || jobsLoading;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [running]);
  const elapsed = running && runStart ? Math.max(0, Math.round((Math.max(now, runStart) - runStart) / 1000)) : 0;
  const STEPS = ["Reading frames", "Mapping zones", "Matching K1 jobs", "Building shift plan"];
  // The first call does reading + mapping in one go; the split is a time-based estimate.
  const stage = analyzing
    ? elapsed < 6 ? 0 : 1
    : jobsLoading
      ? Math.max(now, jobsStart) - jobsStart < 8000 ? 2 : 3
      : -1;

  const busy = progress !== null;
  const totalKb = Math.round(frames.reduce((n, f) => n + f.length * 0.75, 0) / 1024);

  async function onFile(f: File | null) {
    const id = ++checkId.current;
    clearRunStorage();
    setFile(null);
    setFrames([]);
    setAnalysis(null);
    setJobs(null);
    setPlan(null);
    setJobsError("");
    setAnalyzeError("");
    setErrors((e) => ({ ...e, video: "" }));
    if (!f) {
      setChecking(false);
      return;
    }
    setChecking(true);
    try {
      const { video, url } = await loadVideo(f);
      URL.revokeObjectURL(url);
      if (id !== checkId.current) return; // a newer selection superseded this check
      if (video.duration > MAX_SECONDS) {
        setErrors((e) => ({ ...e, video: `Video is ${Math.round(video.duration)} s; max is ${MAX_SECONDS} s.` }));
        return;
      }
      setFile(f);
    } catch (err) {
      if (id !== checkId.current) return;
      setErrors((e) => ({ ...e, video: err instanceof Error ? err.message : "Unsupported video" }));
    } finally {
      if (id === checkId.current) setChecking(false);
    }
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (checking) return;
    const errs: Record<string, string> = {};
    // Keep the real video error (duration/format) if there is one.
    if (!file) errs.video = errors.video || "Please choose a video (max 60 s).";
    if (!businessType.trim()) errs.businessType = "Enter a business type.";
    const hours = Number(hoursPerWeek);
    if (!(hours > 0 && hours <= 168)) errs.hoursPerWeek = "Enter hours per week (1–168).";
    const cost = Number(hourlyCost);
    if (!(cost > 0)) errs.hourlyCost = "Enter an hourly cost above 0.";
    setErrors(errs);
    if (Object.keys(errs).length || !file) return;

    clearRunStorage();
    setFrames([]);
    setAnalysis(null);
    setJobs(null);
    setPlan(null);
    setJobsError("");
    setAnalyzeError("");
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
      setErrors({ video: `Frame extraction failed: ${err instanceof Error ? err.message : "unknown error"}` });
    } finally {
      setProgress(null);
    }
  }

  async function onAnalyze(force = false) {
    if (!frames.length || analyzing || jobsLoading) return;
    setAnalyzeError("");
    setJobsError("");
    setCached(false);
    const data: UploadData = {
      businessType: businessType.trim(),
      hoursPerWeek: Number(hoursPerWeek),
      hourlyCost: Number(hourlyCost),
      frames,
    };
    const hash = await hashInputs(frames, data.businessType, data.hoursPerWeek, data.hourlyCost);
    hashRef.current = hash;
    const hit = hash && !force ? getCached(hash) : null;
    if (hit) {
      clearRunStorage({ keepUpload: true });
      setAnalysis({ scene: hit.analysis.scene, tasks: hit.analysis.tasks });
      setJobs(hit.jobs);
      setPlan(hit.plan);
      setCached(true);
      sessionStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(hit.analysis));
      sessionStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(hit.jobs));
      sessionStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(hit.plan));
      return;
    }
    clearRunStorage({ keepUpload: true });
    setAnalysis(null);
    setJobs(null);
    setPlan(null);
    setRunStart(Date.now());
    setNow(Date.now());
    setAnalyzing(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      let json: AnalyzeResponse | null = null;
      try {
        json = (await res.json()) as AnalyzeResponse;
      } catch {
        /* non-JSON error page */
      }
      if (!json) throw new Error(`Server error (${res.status})`);
      if (!json.ok) throw new Error(json.error);
      setAnalysis(json.result);
      const stored: StoredAnalysis = {
        ...json.result,
        businessType: data.businessType,
        hoursPerWeek: data.hoursPerWeek,
        hourlyCost: data.hourlyCost,
      };
      sessionStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(stored));
      setAnalyzing(false);
      await loadJobs(stored);
      return;
    } catch (err) {
      setAnalyzeError(netError(err, "Analysis failed"));
    }
    setAnalyzing(false);
  }

  async function loadJobs(stored: StoredAnalysis) {
    setJobsLoading(true);
    setJobsStart(Date.now());
    setJobsError("");
    try {
      sessionStorage.removeItem(JOBS_STORAGE_KEY);
      sessionStorage.removeItem(PLAN_STORAGE_KEY);
      setPlan(null);
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stored),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      let json: { ok: true; jobs: JobsResult; plan: RobotPlan } | { ok: false; error: string } | null = null;
      try {
        json = await res.json();
      } catch {
        /* non-JSON */
      }
      if (!json) throw new Error(`Server error (${res.status})`);
      if (!json.ok) throw new Error(json.error);
      setJobs(json.jobs);
      setPlan(json.plan);
      sessionStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(json.jobs));
      sessionStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(json.plan));
      if (hashRef.current) putCached(hashRef.current, { analysis: stored, jobs: json.jobs, plan: json.plan });
    } catch (err) {
      setJobsError(netError(err, "Job rating failed"));
    } finally {
      setJobsLoading(false);
    }
  }

  function runDemo() {
    startDemo();
    router.push("/jobs");
  }

  const input =
    "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-2xs transition focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
  const label = "mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200";
  const err = (k: string) =>
    errors[k] ? (
      <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">
        {errors[k]}
      </p>
    ) : null;

  return (
    <main className="flex-1 bg-slate-50 px-4 py-8 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
          <span className="inline-block rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-0.5 font-mono text-xs font-semibold text-sky-700 dark:text-sky-300">
            Step 1 of 3 • Space Analysis
          </span>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Upload a video of your space
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Extract 8 key frames in your browser and let AI map floor zones and repetitive tasks.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900"
        >
          <div>
            <label className={label}>Video (max {MAX_SECONDS} s)</label>
            <input
              type="file"
              accept="video/*"
              capture="environment"
              disabled={busy}
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              className={input}
            />
            {checking && (
              <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                Checking video…
              </p>
            )}
            {err("video")}
          </div>

          <div>
            <label className={label}>Business type</label>
            <input
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              placeholder="café"
              className={input}
            />
            {err("businessType")}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Opening hours per week</label>
              <input
                type="number"
                min={1}
                max={168}
                value={hoursPerWeek}
                onChange={(e) => setHoursPerWeek(e.target.value)}
                className={input}
              />
              {err("hoursPerWeek")}
            </div>

            <div>
              <label className={label}>Staff hourly cost (€)</label>
              <input
                type="number"
                min={0}
                step="0.5"
                value={hourlyCost}
                onChange={(e) => setHourlyCost(e.target.value)}
                className={input}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Typical Latvian hospitality cost ≈ €8.5/h incl. employer tax
              </p>
              {err("hourlyCost")}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              disabled={busy || checking}
              className="cursor-pointer rounded-xl border border-sky-400/50 bg-sky-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Extracting…" : checking ? "Checking video…" : "Extract frames"}
            </button>
            <button
              type="button"
              onClick={() => void onAnalyze()}
              disabled={!frames.length || busy || analyzing || jobsLoading}
              title={frames.length ? "" : "Extract frames first"}
              className="cursor-pointer rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-800 shadow-2xs transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              {analyzing ? "Analyzing…" : "Analyze"}
            </button>
            <button
              type="button"
              onClick={runDemo}
              disabled={busy || analyzing || jobsLoading}
              className="cursor-pointer rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-5 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-500/20 disabled:opacity-50 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:bg-emerald-950"
            >
              Try demo (no video needed)
            </button>
            {showcases.map((sc) => (
              <button
                key={sc.name}
                type="button"
                data-testid="showcase-btn"
                onClick={() => {
                  applyShowcase(sc);
                  router.push("/jobs");
                }}
                disabled={busy || analyzing || jobsLoading}
                title="A saved real analysis, no AI call"
                className="cursor-pointer rounded-xl border border-violet-500/50 bg-violet-500/10 px-5 py-2.5 text-sm font-bold text-violet-700 transition hover:bg-violet-500/20 disabled:opacity-50 dark:border-violet-500/40 dark:text-violet-300 dark:hover:bg-violet-950"
              >
                Try real example: {sc.name}
              </button>
            ))}
            {dev && jobs && plan && (
              <button
                type="button"
                data-testid="save-showcase-btn"
                onClick={() => {
                  const name = window.prompt("Showcase name", analysis ? businessType.trim() || "My space" : "My space");
                  if (name && !downloadCurrentAsShowcase(name)) window.alert("No complete run to save yet.");
                }}
                className="cursor-pointer rounded-xl border border-dashed border-slate-400 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Save as showcase (dev)
              </button>
            )}
          </div>
        </form>

        {progress && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
            <progress value={progress.done} max={progress.total} className="w-full" />
            <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">
              Frame {progress.done} / {progress.total}
            </p>
          </div>
        )}

        {frames.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="mb-3 text-xs font-medium text-slate-600 dark:text-slate-400">
              {frames.length} frames, {totalKb} KB total · saved to sessionStorage
            </p>
            <div className="grid grid-cols-4 gap-2.5">
              {frames.map((f, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={f}
                  alt={`Frame ${i + 1}`}
                  className="aspect-video w-full rounded-lg border border-slate-200 object-cover dark:border-slate-800"
                />
              ))}
            </div>
          </section>
        )}

        {running && (
          <section aria-live="polite" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
            <ol className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
              {STEPS.map((name, i) => (
                <li
                  key={name}
                  className={
                    i < stage
                      ? "font-medium text-emerald-700 dark:text-emerald-400"
                      : i === stage
                        ? "font-bold text-sky-700 dark:text-sky-300"
                        : "text-slate-400 dark:text-slate-600"
                  }
                >
                  {i < stage ? "✓ " : i === stage ? "● " : "○ "}
                  {name}
                  {i < STEPS.length - 1 && <span className="ml-2 text-slate-400">→</span>}
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              {elapsed} s elapsed · usually 10–40 s
            </p>
          </section>
        )}
        {analyzeError && (
          <p
            role="alert"
            className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400"
          >
            {analyzeError}
          </p>
        )}

        {(analyzeError || jobsError || (errors.video && !checking)) && (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            Something went wrong, but you can still see how RoboHire works.{" "}
            <button
              type="button"
              onClick={runDemo}
              className="cursor-pointer rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-700 transition hover:bg-emerald-500/20 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:bg-emerald-950"
            >
              Continue with demo
            </button>
          </p>
        )}

        {jobsLoading && (
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Rating robot jobs…
          </p>
        )}
        {jobsError && (
          <p
            role="alert"
            className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400"
          >
            Job rating failed: {jobsError}{" "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                const raw = sessionStorage.getItem(ANALYSIS_STORAGE_KEY);
                if (raw) void loadJobs(JSON.parse(raw) as StoredAnalysis);
              }}
            >
              Retry
            </button>
          </p>
        )}
        {jobs && jobs.jobs.length > 0 && (
          <section className="space-y-3 rounded-2xl border border-emerald-500/40 bg-white p-5 shadow-sm dark:border-emerald-500/30 dark:bg-slate-900">
            <p className="text-sm text-slate-800 dark:text-slate-200">
              {plan && plan.job_ids.length > 0 ? (
                <>
                  1 K1 robot:{" "}
                  <b>
                    {plan.job_ids
                      .map((id) => jobs.jobs.find((j) => j.id === id)?.title ?? id)
                      .join(" + ")}
                  </b>{" "}
                  → €{plan.net_savings_eur_month}/month net
                  {plan.payback_months !== null
                    ? `, payback ${plan.payback_months} months`
                    : ", no payback"}
                </>
              ) : (
                <>{jobs.jobs.length} jobs found, but none is worth a robot yet.</>
              )}
            </p>
            {plan && plan.job_ids.length > 0 && (
              <details className="text-xs text-slate-600 dark:text-slate-400">
                <summary className="cursor-pointer font-semibold">
                  Plan assumptions ({plan.hours_per_week} of {plan.capacity_hours_per_week} robot-hours/week)
                </summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {plan.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </details>
            )}
            {cached && (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                <span className="mr-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-300">
                  cached
                </span>
                Same video and settings as before — no AI call made.{" "}
                <button type="button" className="cursor-pointer underline" onClick={() => void onAnalyze(true)}>
                  Re-run AI
                </button>
              </p>
            )}
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/jobs"
                className="inline-block rounded-xl border border-sky-400/50 bg-sky-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-sky-500"
              >
                See robot jobs →
              </Link>
              <Link href="/report" className="text-sm font-semibold text-sky-700 underline dark:text-sky-300">
                Open business report →
              </Link>
            </div>
          </section>
        )}

        {analysis && (
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Space
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Room: {analysis.scene.room.width} × {analysis.scene.room.depth} m
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
                {analysis.scene.zones.map((z) => (
                  <li key={z.id}>
                    <b>{z.label}</b> <code>({z.id})</code> — center ({z.x}, {z.z}),{" "}
                    {z.w} × {z.d} m
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Repetitive tasks
              </h2>
              <ul className="mt-2 space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
                {analysis.tasks.map((t) => (
                  <li
                    key={t.id}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/50"
                  >
                    <b>{t.title}</b>{" "}
                    <span className="text-slate-600 dark:text-slate-400">
                      @ {t.zone_id} · {t.frequency_per_day}×/day · {t.minutes_each} min each
                    </span>
                    <br />
                    {t.description}
                  </li>
                ))}
              </ul>
            </div>
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-400">
                Raw JSON
              </summary>
              <pre className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-950">
                {JSON.stringify(analysis, null, 2)}
              </pre>
            </details>
          </section>
        )}
      </div>
    </main>
  );
}
