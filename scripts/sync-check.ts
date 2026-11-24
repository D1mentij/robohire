/**
 * npm run sync:check — every machine reports itself into sync/<hostname>.json (committed through the repo) and compares with the others.
 *   npm run sync:check              full run incl. demo:check (~2–3 min)
 *   npm run sync:check -- --skip-demo   skip demo:check (marked "skipped" in the report)
 * Only sync/<hostname>.json is ever committed. Secrets are never read into the report: .env.local KEY NAMES only (plus the non-secret AI_PROVIDER value).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const SYNC_DIR = path.join(root, "sync");
const MAX_AGE_H = 24;
const skipDemo = process.argv.includes("--skip-demo");
const win = process.platform === "win32";

type DemoCheck = { verdict: "READY" | "NOT READY" | "skipped"; failed: string[]; warnings: string[]; seconds: number };
export type Report = {
  schema: 1;
  hostname: string;
  os: string;
  node: string;
  git: { head: string; message: string; branch: string; ahead: number | null; behind: number | null; dirty: boolean; offline: boolean };
  ollama: { reachable: boolean; version: string | null; models: string[]; required_model: string; has_required_model: boolean };
  ai_provider: string;
  env_keys_set: string[];
  env_local_exists: boolean;
  demo_check: DemoCheck;
  timestamp: string;
};

function run(cmd: string, args: string[], opts: { inherit?: boolean } = {}): { ok: boolean; out: string } {
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8", shell: win && cmd !== "git", stdio: opts.inherit ? "inherit" : ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024, timeout: 20 * 60 * 1000 }); // demo:check output is long: the default 1 MB buffer would kill it
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}
const git = (...args: string[]) => run("git", args);

/** Short, filesystem-safe machine name (no domain, no odd characters). */
export function safeHostname(raw = os.hostname()): string {
  return raw.split(".")[0].replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "machine";
}

function osName(): string {
  const names: Record<string, string> = { darwin: "macOS", win32: "Windows", linux: "Linux" };
  return `${names[process.platform] ?? process.platform} ${os.release()} (${os.arch()})`;
}

function parseEnv(file: string): Record<string, string> {
  const vals: Record<string, string> = {};
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (m) vals[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* missing file */
  }
  return vals;
}

/** Names of the keys with a non-empty value in .env.local (values are never stored), plus the non-secret provider/model settings. */
function envKeys(): { keys: string[]; provider: string; exists: boolean; model: string } {
  const file = path.join(root, ".env.local");
  const local = parseEnv(file);
  const example = parseEnv(path.join(root, ".env.example"));
  const keys = Object.keys(local).filter((k) => local[k] !== "").sort();
  const pick = (k: string, fallback: string) => process.env[k] || local[k] || example[k] || fallback;
  return { keys, provider: pick("AI_PROVIDER", "ollama").toLowerCase(), exists: existsSync(file), model: pick("OLLAMA_MODEL", "qwen3-vl:4b-instruct") };
}

async function ollamaInfo(requiredModel: string) {
  const base = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/+$/, "");
  const get = async (p: string) => (await fetch(`${base}${p}`, { signal: AbortSignal.timeout(4000) })).json() as Promise<Record<string, unknown>>;
  try {
    const tags = (await get("/api/tags")) as { models?: { name?: string; model?: string }[] };
    const models = (tags.models ?? []).map((m) => m.name ?? m.model ?? "").filter(Boolean).sort();
    const version = await get("/api/version").then((v) => (typeof v.version === "string" ? v.version : null)).catch(() => null);
    const has = models.some((n) => n === requiredModel || n === `${requiredModel}:latest`);
    return { reachable: true, version, models, required_model: requiredModel, has_required_model: has };
  } catch {
    return { reachable: false, version: null, models: [], required_model: requiredModel, has_required_model: false };
  }
}

function demoCheck(): DemoCheck {
  if (skipDemo) return { verdict: "skipped", failed: [], warnings: [], seconds: 0 };
  console.log("Running demo:check (doctor → e2e → real analyze), about 2–3 minutes…");
  const t0 = Date.now();
  const r = run("node", ["scripts/demo-check.mjs"]);
  const summary = r.out.split(/\n\s*Summary\s*\n/).pop() ?? r.out.slice(-600); // the LAST "Summary" block of demo:check
  const failed = [...summary.matchAll(/^\s{2}✘\s+(.+)$/gm)].map((m) => m[1].trim());
  const warnings = [...summary.matchAll(/^\s{2}!\s+(.+)$/gm)].map((m) => m[1].trim());
  if (!r.ok && failed.length === 0) failed.push("demo:check crashed: " + r.out.split("\n").slice(-2).join(" ").slice(0, 160));
  return { verdict: r.ok ? "READY" : "NOT READY", failed, warnings, seconds: Math.round((Date.now() - t0) / 1000) };
}

/** Everything except our own sync files counts as "dirty". */
function dirty(): boolean {
  return git("status", "--porcelain").out.split("\n").some((l) => l.trim() && !/\bsync\/[^/]+\.json$/.test(l));
}

function aheadBehind(): { ahead: number | null; behind: number | null } {
  const r = git("rev-list", "--left-right", "--count", "HEAD...@{upstream}");
  const m = /^(\d+)\s+(\d+)$/.exec(r.out);
  return r.ok && m ? { ahead: Number(m[1]), behind: Number(m[2]) } : { ahead: null, behind: null };
}

function updateRepo(): boolean {
  const fetched = git("fetch", "--quiet");
  const offline = !fetched.ok;
  if (offline) console.log("! git fetch failed (offline?) — reporting local state only");
  const { behind } = aheadBehind();
  if (!offline && behind && behind > 0) {
    if (dirty()) console.log(`! ${behind} commit(s) behind, but you have uncommitted changes — not pulling. Commit/stash, then run: git pull`);
    else {
      const p = git("pull", "--ff-only");
      console.log(p.ok ? `✔ pulled ${behind} new commit(s)` : `! git pull --ff-only failed: ${p.out.split("\n")[0]}`);
    }
  }
  // npm install when node_modules is missing or older than the lockfile
  const lock = path.join(root, "package-lock.json");
  const nm = path.join(root, "node_modules");
  const stamp = existsSync(path.join(nm, ".package-lock.json")) ? path.join(nm, ".package-lock.json") : nm;
  const missing = !existsSync(nm);
  if (missing || (existsSync(lock) && statSync(stamp).mtimeMs < statSync(lock).mtimeMs)) {
    console.log(`node_modules ${missing ? "missing" : "older than package-lock.json"} → ${missing ? "npm ci" : "npm install"}`);
    const lockWasClean = git("diff", "--quiet", "--", "package-lock.json").ok;
    // npm ci installs exactly the lockfile and never rewrites it; npm install may rewrite platform flags in the lockfile
    run("npm", [missing && existsSync(lock) ? "ci" : "install", "--no-audit", "--no-fund"], { inherit: true });
    if (lockWasClean && !git("diff", "--quiet", "--", "package-lock.json").ok) {
      git("checkout", "--", "package-lock.json"); // npm only touched platform flags: keep the tree clean
      console.log("(package-lock.json rewritten by npm for this platform — restored, nothing to commit)");
    }
    const now = new Date();
    try {
      utimesSync(existsSync(path.join(nm, ".package-lock.json")) ? path.join(nm, ".package-lock.json") : nm, now, now); // do not reinstall on every run
    } catch {
      /* ignore */
    }
  }
  return offline;
}

async function collect(offline: boolean): Promise<Report> {
  const env = envKeys();
  const ab = aheadBehind();
  return {
    schema: 1,
    hostname: safeHostname(),
    os: osName(),
    node: process.versions.node,
    git: {
      head: git("rev-parse", "--short=8", "HEAD").out,
      message: git("log", "-1", "--pretty=%s").out.slice(0, 120),
      branch: git("rev-parse", "--abbrev-ref", "HEAD").out,
      ahead: ab.ahead,
      behind: ab.behind,
      dirty: dirty(),
      offline,
    },
    ollama: await ollamaInfo(env.model),
    ai_provider: env.provider,
    env_keys_set: env.keys,
    env_local_exists: env.exists,
    demo_check: demoCheck(),
    timestamp: new Date().toISOString(),
  };
}

/** Commits ONLY sync/<host>.json, rebases on the remote and pushes. Returns a status line. */
function publish(file: string, host: string): string {
  const rel = path.relative(root, file).split(path.sep).join("/");
  git("add", "--", rel);
  const c = git("commit", "-m", `sync: ${host} status`, "--only", "--", rel); // --only: nothing else that may be staged goes in
  if (!c.ok && !/nothing to commit|no changes added/.test(c.out)) return `! commit failed: ${c.out.split("\n")[0]}`;
  const push = () => git("push", "--quiet");
  let p = push();
  if (!p.ok) {
    const pull = git("pull", "--rebase", "--autostash", "--quiet");
    if (!pull.ok) return `! git pull --rebase failed (${pull.out.split("\n")[0]}); fix it, then: git push`;
    p = push();
  }
  return p.ok ? `✔ ${rel} committed and pushed` : `! push failed: ${p.out.split("\n")[0]} — report is committed locally; run: git push`;
}

function loadAll(): Report[] {
  if (!existsSync(SYNC_DIR)) return [];
  const out: Report[] = [];
  for (const f of readdirSync(SYNC_DIR).filter((x) => x.endsWith(".json"))) {
    try {
      const j = JSON.parse(readFileSync(path.join(SYNC_DIR, f), "utf8")) as Report;
      if (j && j.schema === 1 && typeof j.hostname === "string" && j.git && j.ollama && j.demo_check) out.push(j);
    } catch {
      console.log(`! sync/${f} is not valid JSON — ignored`);
    }
  }
  return out.sort((a, b) => a.hostname.localeCompare(b.hostname));
}

const isAncestor = (a: string, b: string): boolean | null => {
  const r = spawnSync("git", ["merge-base", "--is-ancestor", a, b], { cwd: root });
  return r.status === 0 ? true : r.status === 1 ? false : null; // null = commit unknown locally
};

const ageH = (r: Report, now = Date.now()) => (now - Date.parse(r.timestamp)) / 3_600_000;

/** Plain-English issues across machines (pure; `ancestor` is injectable for tests). */
export function compare(reports: Report[], me: string, now = Date.now(), ancestor = isAncestor): string[] {
  const issues: string[] = [];
  const mine = reports.find((r) => r.hostname === me);
  for (const r of reports) {
    const who = r.hostname === me ? `${r.hostname} (this machine)` : r.hostname;
    if (r.hostname !== me && ageH(r, now) > MAX_AGE_H) issues.push(`${who} report is older than ${MAX_AGE_H} h — run sync:check there`);
    if (r.git.behind && r.git.behind > 0) issues.push(`${who} is ${r.git.behind} commit(s) behind its remote → it must git pull`);
    if (r.git.dirty) issues.push(`${who} has uncommitted changes → commit or stash them (demo prep must run on a clean checkout)`);
    if (r.git.offline) issues.push(`${who} could not reach git when it reported → rerun sync:check online`);
    if (!r.ollama.reachable) issues.push(`${who}: Ollama is not running → start it (open the Ollama app or: ollama serve)`);
    else if (!r.ollama.has_required_model) issues.push(`${r.ollama.required_model} missing on ${who} → ollama pull ${r.ollama.required_model}`);
    if (!r.env_local_exists) issues.push(`${who}: .env.local missing → npm run doctor creates it`);
    if (r.demo_check.verdict === "NOT READY") issues.push(`${who} demo:check NOT READY: ${r.demo_check.failed.join("; ") || "see demo:check output"}`);
    if (r.demo_check.verdict === "skipped") issues.push(`${who} demo:check was skipped → run npm run sync:check without --skip-demo`);
  }
  if (mine) {
    for (const r of reports) {
      if (r.hostname === me) continue;
      if (r.git.head !== mine.git.head) {
        const theirsInMine = ancestor(r.git.head, mine.git.head);
        const mineInTheirs = ancestor(mine.git.head, r.git.head);
        if (theirsInMine) issues.push(`${r.hostname} is on an older commit (${r.git.head}, this machine ${mine.git.head}) → they must git pull`);
        else if (mineInTheirs) issues.push(`this machine is on an older commit than ${r.hostname} (${mine.git.head} vs ${r.git.head}) → git pull here`);
        else issues.push(`${r.hostname} (${r.git.head}) and this machine (${mine.git.head}) are on different commits (unknown or diverged) → both git pull`);
      }
      if (r.ai_provider !== mine.ai_provider) issues.push(`AI_PROVIDER differs: ${mine.hostname}=${mine.ai_provider}, ${r.hostname}=${r.ai_provider}`);
      if (r.ollama.required_model !== mine.ollama.required_model) issues.push(`OLLAMA_MODEL differs: ${mine.hostname}=${mine.ollama.required_model}, ${r.hostname}=${r.ollama.required_model}`);
      const nodeMajor = (v: string) => v.split(".")[0];
      if (nodeMajor(r.node) !== nodeMajor(mine.node)) issues.push(`Node major differs: ${mine.hostname}=${mine.node}, ${r.hostname}=${r.node} → align Node versions`);
    }
  }
  return issues;
}

function table(reports: Report[], me: string, now = Date.now()) {
  const rows = reports.map((r) => ({
    host: r.hostname + (r.hostname === me ? " *" : ""),
    os: r.os.split(" ")[0],
    node: r.node.split(".")[0],
    commit: r.git.head,
    "behind/dirty": `${r.git.behind ?? "?"}/${r.git.dirty ? "dirty" : "clean"}`,
    ollama: r.ollama.reachable ? (r.ollama.has_required_model ? `ok ${r.ollama.version ?? ""}`.trim() : "model missing") : "down",
    provider: r.ai_provider,
    "demo:check": r.demo_check.verdict,
    age: `${ageH(r, now) < 1 ? Math.round(ageH(r, now) * 60) + " min" : ageH(r, now).toFixed(1) + " h"}`,
  }));
  console.table(rows);
}

async function main() {
  const me = safeHostname();
  console.log(`sync:check on ${me}\n`);
  const offline = updateRepo();
  const report = await collect(offline);
  mkdirSync(SYNC_DIR, { recursive: true });
  const file = path.join(SYNC_DIR, `${me}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
  console.log(publish(file, me));
  if (!offline) git("fetch", "--quiet"); // make sure other machines' commits are known for the ancestor checks

  const all = loadAll();
  const others = all.filter((r) => r.hostname !== me);
  console.log("\nMachines (* = this one):");
  table(all, me);
  const issues = compare(all, me);
  console.log("");
  if (others.length === 0) console.log("No other machine has reported yet — run npm run sync:check on the other laptop(s) too.");
  for (const i of issues) console.log(`  ✘ ${i}`);
  const note = others.length === 0 ? " (only this machine has reported)" : "";
  console.log(issues.length === 0 ? `\nALL MACHINES IN SYNC & READY${note}` : `\nNOT IN SYNC: ${issues.length} issue${issues.length === 1 ? "" : "s"}`);
  process.exit(issues.length === 0 ? 0 : 1);
}

if (process.argv[1] && /sync-check\.ts$/.test(process.argv[1])) void main();
