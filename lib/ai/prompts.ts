import { k1Profile } from "./k1Profile";
import { isAutoDetect } from "./businessPresets";
import { FAMILIES, zonesHintFor } from "./families";

export const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    scene: {
      type: "object",
      properties: {
        room: {
          type: "object",
          properties: { width: { type: "number" }, depth: { type: "number" } },
          required: ["width", "depth"],
        },
        zones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              x: { type: "number" },
              z: { type: "number" },
              w: { type: "number" },
              d: { type: "number" },
            },
            required: ["id", "label", "x", "z", "w", "d"],
          },
        },
      },
      required: ["room", "zones"],
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          zone_id: { type: "string" },
          description: { type: "string" },
          frequency_per_day: { type: "number" },
          minutes_each: { type: "number" },
        },
        required: ["id", "title", "zone_id", "description", "frequency_per_day", "minutes_each"],
      },
    },
    // only asked for with Auto-detect
    business_guess: { type: "string", enum: FAMILIES },
    ratings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          fit: { type: "string", enum: ["good", "partial", "no"] },
          score: { type: "number" },
          why: { type: "string" },
          limits: { type: "string" },
        },
        required: ["id", "fit", "why"],
      },
    },
  },
  required: ["scene", "tasks", "ratings"],
};

/** K1 abilities / limits as short bullet lists (the only source of truth about the robot). */
function k1Brief(): string {
  return `K1 CAN: ${k1Profile.can.map((c) => c.ability).join("; ")}.
K1 CANNOT: ${k1Profile.cannot.map((c) => c.limitation).join("; ")}.`;
}

const RATING_RULES = `RATINGS: for EACH task add one rating {id, fit, score, why, limits}: id = task id unchanged;
fit = "good" (K1 can do essentially all of it), "partial" (only the talking/guiding/gesturing part), "no" (needs carrying, cleaning, hands, stairs, doors...);
score 0-100 (good 70-95, partial 30-65, no 0-25); why = 1 sentence naming a concrete K1 ability; limits = 1 short sentence from the CANNOT list.
No money, prices, hours or savings in any text. K1 is a small humanoid WITHOUT hands: do not oversell.`;

/**
 * ONE call does everything: floor plan + tasks + K1 fit ratings.
 * compact = shorter prompt for small local models (Ollama).
 */
export function buildAnalysisPrompt(businessType: string, compact = false): string {
  const auto = isAutoDetect(businessType);
  const hint = zonesHintFor(businessType);
  if (compact) {
    const header = auto
      ? "Look at the frames and infer the business/space type automatically (describe only what is VISIBLE)."
      : `Look at the frames of a "${businessType}" (tailor naming and tasks to this industry; describe what is VISIBLE).`;
    return `${header}
Return JSON only:
{"scene":{"room":{"width":m,"depth":m},"zones":[{"id","label","x","z","w","d"}]},
 "tasks":[{"id","title","zone_id","description","frequency_per_day","minutes_each"}],
 "ratings":[{"id","fit","score","why","limits"}]}
Floor plan in METERS, top-down, origin = room corner, X = width, Z = depth. Zone x,z = CENTER, w along X, d along Z.
- 3-6 zones from visible things only; ids snake_case (e.g. "entrance"); inside the room; no overlaps; no robot/charging zones.
- 4-6 tasks that HUMAN staff do there; zone_id must be a zone id; tailor tasks to this business type; at least 2 are customer-facing talking/wayfinding tasks when visitors come.
- frequency_per_day and minutes_each: realistic numbers.
${k1Brief()}
${RATING_RULES}`;
  }
  const businessLine = auto
    ? "The owner selected Auto-detect: infer the business/space type automatically from visual cues in the frames."
    : `The owner says the business type is: "${businessType}".`;
  const industryZoneLine = hint
    ? `\n- Typical spatial zones for this industry include: ${hint}. Use these names when matching features are visible, but NEVER invent zones you cannot see.`
    : "";
  return `You are analysing frames from a short walk-through video of a real space.
${businessLine}

1. Estimate a top-down floor plan in METERS. Origin (0,0) is a room corner; X = width, Z = depth.
   Return scene.room {width, depth} and scene.zones.
   Zone x,z = zone CENTER; w = size along X; d = size along Z.
2. List repetitive tasks that HUMAN STAFF do (or would do) in this specific business space today.
3. Rate and rank how well a Booster K1 humanoid robot could take over each task, strictly respecting K1 physical limits (speech, greeting, wayfinding, gesturing, patrol — no heavy lifting, cleaning, or door opening).

GROUNDING RULES (most important):
- Zones must be based ONLY on what is actually visible in the frames (furniture, doors, counters, equipment).
  NEVER invent zones for things you cannot see (e.g. do not add an order counter or lounge unless one is visible).
- The business type is used ONLY to name and interpret what is visible (e.g. fitting rooms & checkout in retail, reception desk & elevators in a hotel, waiting area in a clinic).${industryZoneLine}
- If the space clearly does not match the business type (e.g. a bedroom described as a cafe), still describe
  exactly what is visible, using neutral labels.
- Tasks must be tied to visible zones and tailored specifically to what this business type plausibly needs.
- NO robot-related content: no docking, charging, parking or maintenance zones, and no tasks about robots,
  charging or docking. Tasks are work that human staff do today.

Zone rules: 3 to 7 zones; short snake_case ids (e.g. "entrance", "counter"); human-readable label;
every zone fully inside the room; zones must not overlap; realistic sizes (room typically 3-20 m per side).
Task rules: 4 to 7 tasks; id = short snake_case; zone_id MUST be one of the zone ids;
description = one sentence; frequency_per_day = realistic repetitions; minutes_each = realistic minutes.
Include BOTH kinds of work:
 (a) physical work staff really do in the visible space (cleaning, carrying, restocking, tidying...);
 (b) customer-facing COMMUNICATION work that fits the visible space and industry: greeting at the entrance, wayfinding / guiding
     visitors to zones, explaining menus / offers / schedules / products, queue or waiting-area information,
     closing-time or safety announcements.
When the space has visitors or customers, at least 2 of the tasks MUST be communication tasks (b), each tied to a visible zone.

${k1Brief()}
${RATING_RULES}

Return STRICT JSON only, exactly this shape:
{ "scene": { "room": {"width": number, "depth": number}, "zones": [{"id","label","x","z","w","d"}] },
  "tasks": [{"id","title","zone_id","description","frequency_per_day","minutes_each"}],
  "ratings": [{"id","fit","score","why","limits"}]${auto ? ',\n  "business_guess": one of ' + FAMILIES.join(" | ") : ""} }`;
}

export const SCENARIO_SCHEMA = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["walk_to", "turn_to", "wave", "point_to", "say", "wait"] },
          target: { type: "string" },
          text: { type: "string" },
          seconds: { type: "number" },
        },
        required: ["action"],
      },
    },
  },
  required: ["steps"],
};

export function buildScenarioPrompt(job: unknown, businessType: string | null, zones: unknown): string {
  return `Write a short demo script showing a small humanoid service robot (Booster K1) doing this job in this exact space.
${businessType ? `Business type: "${businessType}".\n` : ""}JOB: ${JSON.stringify(job)}
ZONES (the only valid targets): ${JSON.stringify(zones)}

Return JSON { "steps": [...] } with 6 to 12 steps. Allowed actions ONLY:
- walk_to {target}   - turn_to {target}   - point_to {target}   - wave   - say {text}   - wait {seconds}
Rules:
- target MUST be one of the zone ids above, spelled exactly. Never invent zones.
- The FIRST step must be walk_to the zone most relevant to the job.
- At least 2 "say" steps and at least 1 gesture (wave or point_to).
- say text: English, friendly, specific to this job and business, MAX 8 words.
- wait seconds: 1 to 3.
- Only things a robot WITHOUT hands can do: walking, turning, gestures, pointing, talking.
- Do not mention prices, savings or money.`;
}

// ---------- whole-shift scenario ----------

export const SHIFT_SCHEMA = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          job: { type: "string" },
          action: { type: "string", enum: ["walk_to", "turn_to", "wave", "point_to", "say", "wait"] },
          target: { type: "string" },
          text: { type: "string" },
          seconds: { type: "number" },
        },
        required: ["job", "action"],
      },
    },
  },
  required: ["steps"],
};

export function buildShiftPrompt(jobs: unknown, businessType: string | null, zones: unknown): string {
  return `Write ONE continuous demo script: a small humanoid service robot (Booster K1) performs its WHOLE shift plan in this exact space.
${businessType ? `Business: "${businessType}".\n` : ""}PLAN JOBS, in this order: ${JSON.stringify(jobs)}
ZONES (the only valid targets): ${JSON.stringify(zones)}

Return JSON { "steps": [...] } with 10 to 20 steps total. Allowed actions ONLY:
- walk_to {target}   - turn_to {target}   - point_to {target}   - wave   - say {text}   - wait {seconds}
Every step has "job": the plan job id it belongs to, or "intro" / "outro".
Structure:
1. intro: one say, e.g. "Starting my shift at <business>".
2. For EACH plan job, in order: walk_to its zone (suggested_zone is a good default), 1 gesture (wave, point_to or turn_to),
   1-2 say lines specific to that job. Make the transition natural (e.g. a short say or turn when moving to the next zone).
3. outro: one closing say.
Rules:
- target MUST be one of the zone ids above, spelled exactly. Never invent zones.
- say text: English, friendly, specific to the job and business, MAX 8 words.
- wait seconds: 1 to 3.
- Only things a robot WITHOUT hands can do: walking, turning, gestures, pointing, talking.
- Do not mention prices, savings or money.`;
}
