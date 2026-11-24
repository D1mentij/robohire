import type { Scene, Zone } from "@/types/contracts";
import type { BusinessKind } from "./businessTemplates";
import { ZONE_TYPES, zoneTypeOfId, type ZoneType } from "./zoneTypes";

/**
 * Local-flow post-processing of the model's floor plan: human labels from zone type + business, minimum room size, an entrance,
 * ≥ 4 zones, and a simple grid when zones overlap or sit on one line. Pure functions; ids stay type-based (display, display_2).
 */

const LABELS: Record<BusinessKind, Record<ZoneType, string>> = {
  showroom: { entrance: "Entrance", counter: "Sales desk", seating: "Customer lounge", display: "Car display", waiting: "Waiting area", shelves: "Brochure rack", desk: "Consultation desk", corridor: "Walkway", other: "Showroom floor" },
  cafe: { entrance: "Entrance", counter: "Service counter", seating: "Seating area", display: "Menu board", waiting: "Queue area", shelves: "Shelves", desk: "Cash desk", corridor: "Walkway", other: "Café area" },
  hotel: { entrance: "Entrance", counter: "Reception desk", seating: "Lobby lounge", display: "Info board", waiting: "Waiting area", shelves: "Brochure rack", desk: "Concierge desk", corridor: "Elevator corridor", other: "Lobby" },
  library: { entrance: "Entrance", counter: "Service desk", seating: "Reading area", display: "New arrivals", waiting: "Queue area", shelves: "Book shelves", desk: "Information desk", corridor: "Aisle", other: "Library hall" },
  retail: { entrance: "Entrance", counter: "Checkout", seating: "Rest area", display: "Promo display", waiting: "Queue area", shelves: "Product shelves", desk: "Customer service", corridor: "Aisle", other: "Shop floor" },
  office: { entrance: "Entrance", counter: "Reception desk", seating: "Visitor seating", display: "Info screen", waiting: "Waiting area", shelves: "Storage", desk: "Front desk", corridor: "Corridor", other: "Office area" },
  university: { entrance: "Entrance", counter: "Info desk", seating: "Student seating", display: "Event board", waiting: "Waiting area", shelves: "Notice shelves", desk: "Information desk", corridor: "Main corridor", other: "Lobby" },
  gym: { entrance: "Club entrance", counter: "Check-in desk", seating: "Recovery lounge", display: "Class schedule board", waiting: "Waiting area", shelves: "Towel & drink rack", desk: "Membership desk", corridor: "Studio corridor", other: "Gym floor" },
  event: { entrance: "Venue entrance", counter: "Registration counter", seating: "Networking lounge", display: "Agenda board", waiting: "Queue area", shelves: "Swag rack", desk: "Registration desk", corridor: "Auditorium entrance", other: "Expo hall" },
  museum: { entrance: "Gallery entrance", counter: "Ticket desk", seating: "Atrium benches", display: "Exhibition highlights", waiting: "Tour waiting area", shelves: "Catalogue rack", desk: "Information desk", corridor: "Gallery wing", other: "Exhibition hall" },
  terminal: { entrance: "Terminal entrance", counter: "Check-in counter", seating: "Passenger seating", display: "Departures board", waiting: "Waiting seats", shelves: "Transit maps rack", desk: "Passenger info desk", corridor: "Gate corridor", other: "Concourse" },
  generic: { entrance: "Entrance", counter: "Service counter", seating: "Seating area", display: "Display area", waiting: "Waiting area", shelves: "Shelves", desk: "Info desk", corridor: "Corridor", other: "Common area" },
};

const FILLER = new Set(["area", "zone", "space", "section", "region", "spot", "the", "a", "an", "main", "of", "with", "and", "in", "for", "on", "at", "general", "other"]);
const BARE: Record<ZoneType, string[]> = {
  entrance: ["entrance", "entry", "door", "doors", "front", "gate", "foyer"],
  counter: ["counter", "service", "bar", "desk", "cash", "register"],
  seating: ["seating", "seat", "seats", "table", "tables", "chair", "chairs", "sofa", "sofas", "bench", "benches", "lounge", "booth"],
  display: ["display", "displays", "shelf", "shelves", "board", "showcase", "exhibit", "products"],
  waiting: ["waiting", "wait", "queue", "lobby"],
  shelves: ["shelves", "shelf", "rack", "racks", "storage", "stock"],
  desk: ["desk", "office", "info", "information", "workstation", "reception"],
  corridor: ["corridor", "hall", "hallway", "passage", "aisle", "walkway"],
  other: [],
};

/** A model label is "bare" when it only repeats the zone type ("Seating area", "waiting area") — then the code label is better. */
export function isBareLabel(label: string, type: ZoneType): boolean {
  if (!label.trim() || label.length > 40) return true;
  const tokens = label.toLowerCase().split(/[^a-zà-žа-я0-9]+/).filter((t) => t && !FILLER.has(t) && !/^\d+$/.test(t));
  if (tokens.length === 0) return true;
  if (type === "other") return true;
  return tokens.every((t) => t === type || BARE[type].includes(t));
}

const cap = (s: string) => s.trim().replace(/\s+/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Human, unique labels: model label only when more specific than the bare type. Duplicates → "Car display 2". */
export function relabelZones(scene: Scene, kind: BusinessKind): Scene {
  const used = new Map<string, number>();
  const zones = scene.zones.map((z) => {
    const type = zoneTypeOfId(z.id);
    const base = isBareLabel(z.label, type) ? LABELS[kind][type] : cap(z.label);
    const n = (used.get(base.toLowerCase()) ?? 0) + 1;
    used.set(base.toLowerCase(), n);
    return { ...z, label: n === 1 ? base : `${base} ${n}` };
  });
  return { ...scene, zones };
}

/** Minimum room size per business (m): the K1 needs space to walk; small models often guess 3–5 m. */
const MIN_ROOM: Record<BusinessKind, [number, number]> = {
  showroom: [12, 9], hotel: [10, 8], cafe: [8, 6], library: [10, 8], retail: [8, 6], office: [6, 5], university: [12, 8],
  gym: [10, 8], event: [12, 9], museum: [10, 8], terminal: [14, 9], generic: [6, 5],
};

/** Zone types a business plausibly has, in the order we add missing ones. */
const PLAUSIBLE: Record<BusinessKind, ZoneType[]> = {
  showroom: ["entrance", "display", "seating", "counter", "waiting", "desk"],
  hotel: ["entrance", "counter", "seating", "corridor", "display"],
  cafe: ["entrance", "counter", "seating", "display"],
  library: ["entrance", "shelves", "desk", "seating"],
  retail: ["entrance", "display", "shelves", "counter"],
  office: ["entrance", "desk", "waiting", "corridor"],
  university: ["entrance", "corridor", "desk", "display"],
  gym: ["entrance", "counter", "display", "corridor", "seating"],
  event: ["entrance", "desk", "corridor", "display", "seating"],
  museum: ["entrance", "counter", "display", "corridor", "seating"],
  terminal: ["entrance", "desk", "display", "corridor", "waiting"],
  generic: ["entrance", "display", "seating", "counter"],
};

const r1 = (n: number) => Math.round(n * 10) / 10;
type Rect = { x0: number; x1: number; z0: number; z1: number };
const rect = (z: Zone): Rect => ({ x0: z.x - z.w / 2, x1: z.x + z.w / 2, z0: z.z - z.d / 2, z1: z.z + z.d / 2 });
const overlaps = (a: Zone, b: Zone) => {
  const p = rect(a), q = rect(b);
  return Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0) > 0.05 && Math.min(p.z1, q.z1) - Math.max(p.z0, q.z0) > 0.05;
};
const spread = (v: number[]) => Math.max(...v) - Math.min(...v);

export function hasOverlap(zones: Zone[]): boolean {
  return zones.some((a, i) => zones.slice(i + 1).some((b) => overlaps(a, b)));
}
/** ≥ 3 zones whose centres lie (almost) on one line along X or Z. */
export function isCollinear(zones: Zone[]): boolean {
  return zones.length >= 3 && (spread(zones.map((z) => z.x)) < 0.8 || spread(zones.map((z) => z.z)) < 0.8);
}

function uniqueId(type: ZoneType, zones: Zone[]): string {
  let id: string = type;
  for (let i = 2; zones.some((z) => z.id === id); i++) id = `${type}_${i}`;
  return id;
}

/** Zones evenly in a grid inside the room (entrance first = top-left cell, along the room edge). */
export function gridLayout(room: Scene["room"], zones: Zone[]): Zone[] {
  const ordered = [...zones].sort((a, b) => Number(zoneTypeOfId(b.id) === "entrance") - Number(zoneTypeOfId(a.id) === "entrance"));
  const n = ordered.length;
  const cols = Math.max(1, Math.min(n, Math.ceil(Math.sqrt((n * room.width) / room.depth))));
  const rows = Math.ceil(n / cols);
  const cw = room.width / cols, cd = room.depth / rows;
  return ordered.map((z, i) => ({
    ...z,
    x: r1((i % cols + 0.5) * cw),
    z: r1((Math.floor(i / cols) + 0.5) * cd),
    w: r1(Math.max(1.2, cw * 0.7)),
    d: r1(Math.max(1.2, cd * 0.7)),
  }));
}

/** Entrance zone on the room edge facing the biggest free margin (the "open side"). */
function entranceZone(scene: Scene, zones: Zone[], label: string): Zone {
  const { width: W, depth: D } = scene.room;
  const m = {
    left: Math.min(...zones.map((z) => z.x - z.w / 2)),
    right: W - Math.max(...zones.map((z) => z.x + z.w / 2)),
    top: Math.min(...zones.map((z) => z.z - z.d / 2)),
    bottom: D - Math.max(...zones.map((z) => z.z + z.d / 2)),
  };
  const side = (Object.keys(m) as (keyof typeof m)[]).reduce((a, b) => (m[b] > m[a] ? b : a));
  const long = 2.2, short = 1.2;
  const id = uniqueId("entrance", zones);
  switch (side) {
    case "left": return { id, label, x: r1(short / 2), z: r1(D / 2), w: short, d: long };
    case "right": return { id, label, x: r1(W - short / 2), z: r1(D / 2), w: short, d: long };
    case "top": return { id, label, x: r1(W / 2), z: r1(short / 2), w: long, d: short };
    default: return { id, label, x: r1(W / 2), z: r1(D - short / 2), w: long, d: short };
  }
}

/** Room minimum, entrance, ≥ 4 zones, then a grid if anything overlaps or is collinear. Input zones must already be inside the room. */
export function fixLayout(scene: Scene, kind: BusinessKind, minZones = 4): Scene {
  let { width, depth } = scene.room;
  let zones = scene.zones;
  const [minW, minD] = MIN_ROOM[kind];
  if (width < minW || depth < minD) {
    const fx = Math.max(1, minW / width), fz = Math.max(1, minD / depth);
    zones = zones.map((z) => ({ ...z, x: r1(z.x * fx), w: r1(z.w * fx), z: r1(z.z * fz), d: r1(z.d * fz) }));
    width = Math.max(width, minW);
    depth = Math.max(depth, minD);
  }
  const room = { width, depth };
  let changed = false;
  const has = (t: ZoneType) => zones.some((z) => zoneTypeOfId(z.id) === t);
  if (!has("entrance")) {
    zones = [...zones, entranceZone({ room, zones }, zones, LABELS[kind].entrance)];
    changed = true;
  }
  for (const t of PLAUSIBLE[kind]) {
    if (zones.length >= minZones) break;
    if (has(t) && t !== "display" && t !== "seating") continue; // prefer a type that is missing; display/seating may repeat as a last resort
    zones = [...zones, { id: uniqueId(t, zones), label: LABELS[kind][t], x: width / 2, z: depth / 2, w: 2, d: 1.5 }];
    changed = true;
  }
  for (const t of ZONE_TYPES) { // still short (all plausible types present): fall back to any missing type
    if (zones.length >= minZones) break;
    if (!has(t) && !zones.some((z) => zoneTypeOfId(z.id) === t)) {
      zones = [...zones, { id: uniqueId(t, zones), label: LABELS[kind][t], x: width / 2, z: depth / 2, w: 2, d: 1.5 }];
      changed = true;
    }
  }
  if (changed || hasOverlap(zones) || isCollinear(zones)) zones = gridLayout(room, zones);
  // keep labels unique after additions
  return relabelZones({ room, zones }, kind);
}
