import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseShowcase, type Showcase } from "./showcase";

/** Server-only: loads and validates lib/ai/showcase/*.json (invalid files are skipped). */
export async function readShowcasesFromDisk(dir = path.join(/*turbopackIgnore: true*/ process.cwd(), "lib", "ai", "showcase")): Promise<Showcase[]> {
  let files: string[];
  try {
    files = (await readdir(/*turbopackIgnore: true*/ dir)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const out: Showcase[] = [];
  for (const f of files) {
    try {
      const s = parseShowcase(JSON.parse(await readFile(/*turbopackIgnore: true*/ path.join(dir, f), "utf8")));
      if (s) out.push(s);
      else console.warn(`[showcase] ${f} skipped: invalid`);
    } catch {
      console.warn(`[showcase] ${f} skipped: unreadable`);
    }
  }
  return out;
}
