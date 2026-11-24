import assert from "node:assert/strict";
import { compare, safeHostname, type Report } from "./sync-check";

const NOW = Date.parse("2026-11-24T12:00:00Z");
const base = (host: string, over: Partial<Report> = {}): Report => ({
  schema: 1, hostname: host, os: "macOS 25 (arm64)", node: "22.1.0",
  git: { head: "aaaaaaaa", message: "x", branch: "main", ahead: 0, behind: 0, dirty: false, offline: false },
  ollama: { reachable: true, version: "0.9.0", models: ["qwen3-vl:4b-instruct"], required_model: "qwen3-vl:4b-instruct", has_required_model: true },
  ai_provider: "ollama", env_keys_set: [], env_local_exists: true,
  demo_check: { verdict: "READY", failed: [], warnings: [], seconds: 100 }, timestamp: "2026-11-24T11:30:00Z", ...over,
});
const anc = (older: string, newer: string) => (older === "bbbbbbbb" && newer === "aaaaaaaa" ? true : older === "aaaaaaaa" && newer === "bbbbbbbb" ? false : null);

assert.equal(safeHostname("Dmitrijs-MacBook-Air.local"), "Dmitrijs-MacBook-Air");
assert.equal(safeHostname("we ird/name!.lan"), "we-ird-name");
assert.equal(safeHostname(""), "machine");

// everything fine → no issues
assert.deepEqual(compare([base("mac"), base("win")], "mac", NOW, anc), []);
assert.deepEqual(compare([base("mac")], "mac", NOW, anc), []);

// every kind of difference gets a plain-English line naming the host
const bad = base("win", {
  git: { head: "bbbbbbbb", message: "old", branch: "main", ahead: 0, behind: 2, dirty: true, offline: false },
  ollama: { reachable: true, version: "0.9.0", models: [], required_model: "qwen3-vl:4b-instruct", has_required_model: false },
  ai_provider: "gemini", node: "20.0.0", env_local_exists: false,
  demo_check: { verdict: "NOT READY", failed: ["e2e (demo mode)"], warnings: [], seconds: 50 }, timestamp: "2026-11-22T09:00:00Z",
});
const out = compare([base("mac"), bad], "mac", NOW, anc).join("\n");
for (const re of [/win is on an older commit.*git pull/, /win report is older than 24 h/, /win is 2 commit\(s\) behind/, /uncommitted/, /qwen3-vl:4b-instruct missing on win/, /AI_PROVIDER differs: mac=ollama, win=gemini/, /win demo:check NOT READY: e2e \(demo mode\)/, /Node major differs/, /\.env\.local missing/]) {
  assert.match(out, re, `missing: ${re}\n${out}`);
}
// this machine behind / diverged / Ollama down / skipped demo
assert.match(compare([base("mac", { git: { ...base("x").git, head: "bbbbbbbb" } }), base("win")], "mac", NOW, anc).join("\n"), /this machine is on an older commit than win/);
assert.match(compare([base("mac"), base("win", { git: { ...base("x").git, head: "cccccccc" } })], "mac", NOW, anc).join("\n"), /different commits/);
assert.match(compare([base("mac", { ollama: { ...base("x").ollama, reachable: false, has_required_model: false } })], "mac", NOW, anc).join("\n"), /mac \(this machine\): Ollama is not running/);
assert.match(compare([base("mac", { demo_check: { verdict: "skipped", failed: [], warnings: [], seconds: 0 } })], "mac", NOW, anc).join("\n"), /skipped/);
console.log("test:sync OK");
