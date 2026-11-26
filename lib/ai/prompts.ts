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
        required: [
          "id",
          "title",
          "zone_id",
          "description",
          "frequency_per_day",
          "minutes_each",
        ],
      },
    },
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

const FLEET_BRIEF = `COMMERCIAL ROBOT FLEET (15 models):
- HoReCa Tray Waiters: Keenon T8 (55 cm narrow aisles, 20 kg), Bear Servi (65 cm, bussing tub), Pudu BellaBot Pro (70 cm, 40 kg), Keenon T10 (75 cm).
- Greeting & Telepresence: Pudu KettyBot Pro (55 cm ad-screen greeter), Temi (telepresence & wayfinding).
- Hotel & Office Multi-Floor Couriers: Pudu FlashBot & Keenon W3 (enclosed cabinets, smart elevator calling; require elevator integration, wide doors & flat <=15 mm thresholds).
- Commercial & Industrial Scrubbers: LionsBot R3 Vac, Pudu CC1 (4-in-1 hard floor/carpet), Pudu CC1 Pro (5,000-8,000 m² malls/airports), Avidbots Neo 2 & Gausium Scrubber 75P (large 24/7 hubs, >=120 cm aisles).
- Warehouse & Factory AMRs: Pudu T300 (300 kg) & MiR250 (250 kg, 1,450 mm standard / 850 mm min corridor, <=20 mm threshold).
CANNOT DO: fine hand manipulation, unboxing, hanging clothes, bartending, high-bay forklift stacking (>1 m height), stairs, or >20 mm steps.`;

const RATING_RULES = `RATINGS: for EACH task add one rating {id, fit, score, why, limits}: id = task id unchanged;
fit = "good" (directly automatable by one of the 15 commercial robots), "partial" (robot handles transport/greeting/scrubbing while staff load/unload), "no" (needs human hands, stairs, high racking, or heavy manual dexterity);
score 0-100 (good 75-96, partial 40-68, no 5-25); why = 1 sentence naming the matching robot archetype & spatial cue (aisle width, floor type, elevator, corridor); limits = 1 sentence on aisle width, threshold, elevator, or manual loading limits.
No money, prices, hours or savings in any text.`;

export function buildAnalysisPrompt(
  businessType: string,
  compact = false,
): string {
  const auto = isAutoDetect(businessType);
  const hint = zonesHintFor(businessType);
  if (compact) {
    const header = auto
      ? "Inspect the frames and infer the venue type automatically (describe only what is VISIBLE: aisle widths, floor surface, doors/elevators, counters, racks)."
      : `Inspect the frames of a "${businessType}" (check aisle/corridor widths, thresholds, doors/elevators, and floor surface; describe what is VISIBLE).`;
    return `${header}
Return JSON only:
{"scene":{"room":{"width":m,"depth":m},"zones":[{"id","label","x","z","w","d"}]},
 "tasks":[{"id","title","zone_id","description","frequency_per_day","minutes_each"}],
 "ratings":[{"id","fit","score","why","limits"}]}
Floor plan in METERS, top-down, origin = room corner, X = width, Z = depth. Zone x,z = CENTER, w along X, d along Z.
- 3-6 non-overlapping visible zones inside the room; snake_case ids; no robot/charging zones.
- 4-6 realistic staff tasks (delivery, greeting, floor scrubbing/vacuuming, multi-floor courier, or pallet transport + 1 manual-only task).
${FLEET_BRIEF}
${RATING_RULES}`;
  }

  const businessLine = auto
    ? "The owner selected Auto-detect: infer the venue/space class (SMB café, restaurant, hotel, office, retail, mall/airport, warehouse, factory, or gym) from visual cues."
    : `The owner states the venue type is: "${businessType}".`;
  const industryZoneLine = hint
    ? `\n- Expected zones for this venue class (include ONLY what is visible): ${hint}.`
    : "";

  return `You are analyzing frames from a walk-through video of a commercial or industrial space for B2B robot deployment.
${businessLine}

1. Estimate a top-down floor plan in METERS. Origin (0,0) is a room corner; X = width, Z = depth.
   Pay close attention to AISLE / CORRIDOR WIDTHS (<65 cm narrow café vs >=75 cm restaurant vs >=1,450 mm warehouse AMR lane), ELEVATORS / DOORS, FLOOR THRESHOLDS, and FLOOR AREA / SURFACE (tile, concrete, wood, carpet).
2. List 4 to 7 repetitive tasks human staff perform in these visible zones (tray running, guest greeting/wayfinding, multi-floor courier, floor vacuuming/scrubbing, pallet/material transport, plus at least 1 dexterous manual task robots cannot do).
3. Rate each task against RoboHire's 15-robot commercial catalog.

GROUNDING RULES:
- Map ONLY visible zones (doors, counters, tables, elevators, corridors, pallet racks, packing desks).${industryZoneLine}
- Never invent robot charging docks or maintenance bays.
- Zone rules: 3 to 7 non-overlapping zones inside the room; snake_case ids; realistic meter dimensions.

${FLEET_BRIEF}
${RATING_RULES}

Return STRICT JSON only:
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
          action: {
            type: "string",
            enum: ["walk_to", "turn_to", "wave", "point_to", "say", "wait"],
          },
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

export function buildScenarioPrompt(
  job: unknown,
  businessType: string | null,
  zones: unknown,
): string {
  return `Write a realistic 3D simulation script showing the selected commercial service/industrial robot performing this job in this exact space.
${businessType ? `Venue type: "${businessType}".\n` : ""}JOB: ${JSON.stringify(job)}
ZONES (the only valid targets): ${JSON.stringify(zones)}

Return JSON { "steps": [...] } with 6 to 10 steps. Allowed actions ONLY:
- walk_to {target}   - turn_to {target}   - point_to {target}   - wave   - say {text}   - wait {seconds}
Rules:
- target MUST be one of the zone ids above, spelled exactly. Never invent zones.
- Start with walk_to the primary pickup/entry/lane zone, then visit 1-2 destination zones.
- Include at least 2 concise English "say" status/voice lines (MAX 8 words each) and 1 wait or gesture step.
- Do not mention prices or money.`;
}

export const SHIFT_SCHEMA = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          job: { type: "string" },
          action: {
            type: "string",
            enum: ["walk_to", "turn_to", "wave", "point_to", "say", "wait"],
          },
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

export function buildShiftPrompt(
  jobs: unknown,
  businessType: string | null,
  zones: unknown,
): string {
  return `Write ONE continuous simulation routine showing the commercial robot executing its shift tasks across this space.
${businessType ? `Venue: "${businessType}".\n` : ""}PLAN JOBS: ${JSON.stringify(jobs)}
ZONES (the only valid targets): ${JSON.stringify(zones)}

Return JSON { "steps": [...] } with 10 to 18 steps total. Allowed actions ONLY:
- walk_to {target}   - turn_to {target}   - point_to {target}   - wave   - say {text}   - wait {seconds}
Every step has "job": the plan job id, or "intro" / "outro".
Rules:
- target MUST be one of the zone ids above, spelled exactly.
- say text: natural English, MAX 8 words.
- wait seconds: 1 to 3.`;
}
