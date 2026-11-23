/** Zone types the local model must use (a fixed list keeps small models reliable). Ids in the local flow are the type (+ _2, _3). */
export const ZONE_TYPES = ["entrance", "counter", "seating", "display", "waiting", "shelves", "desk", "corridor", "other"] as const;
export type ZoneType = (typeof ZONE_TYPES)[number];

const TYPE_RE: [ZoneType, RegExp][] = [
  ["entrance", /entr|door|lobby entrance|reception|foyer|gate/i],
  ["counter", /counter|bar\b|cash|checkout|register|kitchen|service/i],
  ["seating", /seat|table|chair|sofa|bench|lounge|booth|dining/i],
  ["display", /display|menu|board|showcase|product|exhibit|window|vitrine|vehicle|car\b/i],
  ["waiting", /wait|queue|lobby|lounge area/i],
  ["shelves", /shelf|shelves|rack|storage|stock/i],
  ["desk", /desk|office|info|workstation/i],
  ["corridor", /corridor|hall|aisle|passage|stair/i],
];
export const inferZoneType = (label: string): ZoneType => TYPE_RE.find(([, re]) => re.test(label))?.[0] ?? "other";

/** Zone ids in the local flow are the type (+ _2, _3 when repeated), so the type survives scene cleanup. */
export const zoneTypeOfId = (id: string): ZoneType => {
  const t = id.replace(/_\d+$/, "");
  return (ZONE_TYPES as readonly string[]).includes(t) ? (t as ZoneType) : inferZoneType(id);
};

