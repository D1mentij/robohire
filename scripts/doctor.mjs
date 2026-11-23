#!/usr/bin/env node
/** npm run doctor — "Is this laptop ready for the stage?" Cross-platform, no dependencies, never prints secrets. */
import { existsSync, readFileSync, copyFileSync, readdirSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const win = process.platform === "win32";
const root = process.cwd();
const c = (n, s) => (process.stdout.isTTY ? `\x1b[${n}m${s}\x1b[0m` : s);
const results = [];
const add = (ok, name, detail, fix) => results.push({ ok, name, detail, fix });

function loadEnv() {
  const env = {};
  for (const f of [".env.example", ".env.local"]) {
    try {
      for (const line of readFileSync(path.join(root, f), "utf8").split(/\r?\n/)) {
        const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
        if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {}
  }
  return { ...env, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("OLLAMA") || k === "AI_PROVIDER")) };
}

export async function runDoctor({ quiet = false } = {}) {
  results.length = 0;
  // Node
  const major = Number(process.versions.node.split(".")[0]);
  add(major >= 20, "Node.js >= 20", `v${process.versions.node}`, win ? "winget install OpenJS.NodeJS.LTS" : "brew install node");
  // node_modules
  add(existsSync(path.join(root, "node_modules", "next")), "node_modules installed", "", "npm install");
  // .env.local
  const envPath = path.join(root, ".env.local");
  if (!existsSync(envPath) && existsSync(path.join(root, ".env.example"))) {
    copyFileSync(path.join(root, ".env.example"), envPath);
    add(true, ".env.local", "created from .env.example", "");
  } else add(existsSync(envPath), ".env.local", existsSync(envPath) ? "present" : "missing", win ? "copy .env.example .env.local" : "cp .env.example .env.local");
  const env = loadEnv();
  const provider = (env.AI_PROVIDER || "ollama").toLowerCase();
  add(true, "AI_PROVIDER", provider, "");
  // Ollama
  const url = (env.OLLAMA_URL || "http://localhost:11434").replace(/\/+$/, "");
  const model = env.OLLAMA_MODEL || "qwen3-vl:4b-instruct";
  let ollamaOk = false;
  let names = [];
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(4000) });
    const j = await res.json();
    names = (j.models ?? []).map((m) => m.name ?? m.model);
    ollamaOk = res.ok;
  } catch {}
  if (provider === "ollama") {
    add(ollamaOk, "Ollama reachable", url, win ? "Start the Ollama app (Start menu) or: ollama serve   (install: winget install Ollama.Ollama)" : "open -a Ollama   (or: ollama serve;  install: brew install --cask ollama)");
    const has = names.some((n) => n === model || n === `${model}:latest`);
    add(ollamaOk && has, `Model ${model} present`, has ? "" : ollamaOk ? `installed: ${names.join(", ") || "none"}` : "", `ollama pull ${model}`);
  } else add(!!env.GEMINI_API_KEY, "GEMINI_API_KEY set", "(value hidden)", "put GEMINI_API_KEY=... into .env.local");
  // Port 3000
  const free = await new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(3000); // all interfaces: also catches servers bound to IPv6 (next dev)
  });
  add(free, "Port 3000 free", free ? "" : "something is already listening (a second `next dev` in this folder also blocks the e2e test)", win ? "netstat -ano | findstr :3000   then   taskkill /PID <pid> /F" : "lsof -ti :3000 | xargs kill");
  // Playwright browser
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || (win ? path.join(process.env.LOCALAPPDATA || "", "ms-playwright") : process.platform === "darwin" ? path.join(os.homedir(), "Library", "Caches", "ms-playwright") : path.join(os.homedir(), ".cache", "ms-playwright"));
  let pw = false;
  try { pw = readdirSync(cache).some((d) => d.startsWith("chromium")); } catch {}
  add(pw, "Playwright Chromium installed", "", "npx playwright install chromium");

  if (!quiet) {
    console.log(c(1, "\nRoboHire doctor\n"));
    for (const r of results) {
      console.log(`${r.ok ? c(32, "✔") : c(31, "✘")} ${r.name}${r.detail ? c(90, `  ${r.detail}`) : ""}`);
      if (!r.ok && r.fix) console.log(`    fix: ${c(33, r.fix)}`);
    }
    const bad = results.filter((r) => !r.ok).length;
    console.log(bad ? c(31, `\nNOT READY: ${bad} problem(s)`) : c(32, "\nAll good."));
  }
  return results.every((r) => r.ok);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("doctor.mjs")) {
  runDoctor().then((ok) => process.exit(ok ? 0 : 1));
}
