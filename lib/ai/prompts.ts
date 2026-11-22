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
Task rules: repetitive work suggested by the visible space (greeting, explaining, guiding, cleaning, carrying,
restocking, tidying...); 3 to 8 tasks; id = short snake_case; zone_id MUST be one of the zone ids;
description = one sentence; frequency_per_day = realistic repetitions; minutes_each = realistic minutes.

Return STRICT JSON only, exactly this shape:
{ "scene": { "room": {"width": number, "depth": number}, "zones": [{"id","label","x","z","w","d"}] },
  "tasks": [{"id","title","zone_id","description","frequency_per_day","minutes_each"}] }`;
}
