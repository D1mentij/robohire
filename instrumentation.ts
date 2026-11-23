// Runs once when the Next.js server starts: warm the local model so the first Analyze on stage is not slow.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV === "test") return;
  const { warmUpOllama } = await import("./lib/ai/provider");
  void warmUpOllama().then((r) => console.log(`[ai] warm-up: ${r.ok ? `${r.model} loaded in ${r.seconds}s` : `skipped (${r.error})`}`));
}
