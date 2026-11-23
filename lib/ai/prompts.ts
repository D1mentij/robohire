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
  },
  required: ["scene", "tasks"],
};

export function buildAnalysisPrompt(businessType: string): string {
  return `You are analysing frames from a short walk-through video of a real space.
The owner says the business type is: "${businessType}".

1. Estimate a top-down floor plan in METERS. Origin (0,0) is a room corner; X = width, Z = depth.
   Return scene.room {width, depth} and scene.zones.
   Zone x,z = zone CENTER; w = size along X; d = size along Z.
2. List repetitive tasks that HUMAN STAFF do (or would do) in this space today.

GROUNDING RULES (most important):
- Zones must be based ONLY on what is actually visible in the frames (furniture, doors, counters, equipment).
  NEVER invent zones for things you cannot see (e.g. do not add an order counter or lounge unless one is visible).
- The business type is used ONLY to name and interpret what is visible (e.g. a visible table may be "Customer table" in a cafe).
- If the space clearly does not match the business type (e.g. a bedroom described as a cafe), still describe
  exactly what is visible, using neutral labels.
- Tasks must be tied to visible zones and to what that space plausibly needs.
- NO robot-related content: no docking, charging, parking or maintenance zones, and no tasks about robots,
  charging or docking. Tasks are work that human staff do today.

Zone rules: 3 to 7 zones; short snake_case ids (e.g. "entrance", "counter"); human-readable label;
every zone fully inside the room; zones must not overlap; realistic sizes (room typically 3-20 m per side).
Task rules: 4 to 7 tasks; id = short snake_case; zone_id MUST be one of the zone ids;
description = one sentence; frequency_per_day = realistic repetitions; minutes_each = realistic minutes.
Include BOTH kinds of work:
 (a) physical work staff really do in the visible space (cleaning, carrying, restocking, tidying...);
 (b) customer-facing COMMUNICATION work that fits the visible space: greeting at the entrance, wayfinding / guiding
     visitors to zones, explaining the menu / offers / products, queue or waiting-area information,
     closing-time or safety announcements.
When the space has visitors or customers, at least 2 of the tasks MUST be communication tasks (b), each tied to a visible zone.

Return STRICT JSON only, exactly this shape:
{ "scene": { "room": {"width": number, "depth": number}, "zones": [{"id","label","x","z","w","d"}] },
  "tasks": [{"id","title","zone_id","description","frequency_per_day","minutes_each"}] }`;
}

export const JOBS_SCHEMA = {
  type: "object",
  properties: {
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
        required: ["id", "fit", "score", "why", "limits"],
      },
    },
  },
  required: ["ratings"],
};

export function buildJobsPrompt(
  businessType: string,
  tasks: unknown,
  zones: unknown,
  profile: unknown,
): string {
  return `You are rating how well a Booster K1 humanoid robot could take over repetitive tasks in a "${businessType}".

K1 CAPABILITY PROFILE (the only source of truth about the robot):
${JSON.stringify(profile)}

ZONES: ${JSON.stringify(zones)}

TASKS (done by human staff today):
${JSON.stringify(tasks)}

For EACH task, return exactly one rating with:
- id: the task id, unchanged
- fit: "good" (K1 can do essentially all of it with its listed abilities), "partial" (K1 can do a meaningful part, e.g. the talking/guiding/gesturing part, but not the physical part), or "no" (needs something in the K1 "cannot" list: carrying, wiping/cleaning, fine manipulation, stairs, doors, wet work...)
- score: integer 0-100 for overall suitability (good ~70-95, partial ~30-65, no ~0-25)
- why: 1-2 sentences, why this rating, referring to concrete K1 abilities
- limits: ONE honest sentence about what the K1 cannot do for this task, based on the "cannot" list

Be realistic and do not oversell: K1 is a small (95 cm) humanoid with no hands.
STRICT RULES: do NOT write any numbers about money, savings, prices, time or hours anywhere in the text. Do not add or remove tasks.
Return STRICT JSON: { "ratings": [ {"id","fit","score","why","limits"} ] }`;
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
- say text: English, friendly, specific to this job and business, max 15 words.
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
- say text: English, friendly, specific to the job and business, max 15 words.
- wait seconds: 1 to 3.
- Only things a robot WITHOUT hands can do: walking, turning, gestures, pointing, talking.
- Do not mention prices, savings or money.`;
}
