import type { Scene } from "@/types/contracts";
import { BUSINESS_DEFAULTS, defaultsFor } from "@/lib/roi/businessDefaults";
import type { BusinessKind } from "./businessTemplates";

export const AUTO_DETECT_ID = "auto-detect";
export const AUTO_DETECT_LABEL = "Auto-detect from video";
export const CUSTOM_PRESET_ID = "custom";
export const CUSTOM_PRESET_LABEL = "Custom business type...";

export type BusinessCategory =
  | "HoReCa (Small & Mid)"
  | "Hotels & Corporate"
  | "Retail & Public Venues"
  | "Logistics & Industry"
  | "Fitness & Leisure";

export type BusinessPreset = {
  id: string;
  label: string;
  shortLabel: string;
  category: BusinessCategory;
  family: BusinessKind;
  defaultHoursPerWeek: number;
  defaultHourlyCost: number;
  defaultShifts: 1 | 2 | 3;
  costHelper: string;
  expectedZones: string;
  spatialNotes: string;
  quickPick?: boolean;
  demoScene: Scene;
};

export const BUSINESS_CATEGORIES: BusinessCategory[] = [
  "HoReCa (Small & Mid)",
  "Hotels & Corporate",
  "Retail & Public Venues",
  "Logistics & Industry",
  "Fitness & Leisure",
];

type RawPreset = Omit<
  BusinessPreset,
  "defaultHoursPerWeek" | "defaultHourlyCost" | "defaultShifts" | "costHelper"
>;

const RAW_PRESETS: RawPreset[] = [
  // ---- HoReCa (Small & Mid) ----
  {
    id: "narrow_cafe",
    label: "Tight Café / Bistro (Narrow Aisles ~55 cm)",
    shortLabel: "Tight Café (55 cm)",
    category: "HoReCa (Small & Mid)",
    family: "cafe",
    expectedZones:
      "entrance, coffee counter, tightly spaced café tables (~55 cm aisles), menu board, pickup/waiting nook",
    spatialNotes: "Compact 7 × 5.5 m floor with ~55–58 cm narrow table aisles",
    quickPick: true,
    demoScene: {
      room: { width: 7.5, depth: 5.5 },
      zones: [
        { id: "entrance", label: "Café Entrance", x: 1.1, z: 2.75, w: 1.3, d: 1.8 },
        { id: "counter", label: "Coffee & Pastry Pass", x: 5.8, z: 1.2, w: 2.6, d: 1.3 },
        { id: "display", label: "Menu Board", x: 3.3, z: 0.9, w: 1.6, d: 0.9 },
        { id: "seating", label: "Tight Bistro Tables (55 cm)", x: 3.9, z: 3.8, w: 3.2, d: 2.2 },
        { id: "waiting", label: "Order Pickup Nook", x: 6.4, z: 3.9, w: 1.4, d: 1.8 },
      ],
    },
  },
  {
    id: "restaurant",
    label: "Restaurant / Food Hall",
    shortLabel: "Restaurant / Food Hall",
    category: "HoReCa (Small & Mid)",
    family: "restaurant",
    expectedZones:
      "main entrance, host reception desk, wide dining tables (≥75 cm aisles), kitchen service pass, dish-bussing station",
    spatialNotes: "12 × 9 m dining hall with ≥80 cm server & multi-tray lanes",
    quickPick: true,
    demoScene: {
      room: { width: 12, depth: 9 },
      zones: [
        { id: "entrance", label: "Main Entrance", x: 1.4, z: 4.5, w: 1.6, d: 2.2 },
        { id: "desk", label: "Host & Promo Stand", x: 3.8, z: 1.5, w: 2.0, d: 1.4 },
        { id: "counter", label: "Kitchen Pass Counter", x: 9.8, z: 2.4, w: 2.2, d: 2.8 },
        { id: "seating", label: "Main Dining Tables", x: 5.8, z: 5.6, w: 4.6, d: 3.2 },
        { id: "shelves", label: "Dish-Bussing Return", x: 10.2, z: 6.8, w: 2.0, d: 2.0 },
      ],
    },
  },

  // ---- Hotels & Corporate ----
  {
    id: "hotel",
    label: "Hotel / Resort (Multi-Floor)",
    shortLabel: "Hotel (Multi-Floor)",
    category: "Hotels & Corporate",
    family: "hotel",
    expectedZones:
      "lobby entrance, reception desk, smart elevator bank/corridor, lobby sofa lounge, breakfast & concierge board",
    spatialNotes: "Multi-floor hotel requiring elevator IoT, ≥80 cm doors & ≤15 mm thresholds",
    quickPick: true,
    demoScene: {
      room: { width: 12, depth: 9 },
      zones: [
        { id: "entrance", label: "Lobby Entrance", x: 1.4, z: 4.5, w: 1.6, d: 2.4 },
        { id: "counter", label: "Reception Desk", x: 6.0, z: 1.6, w: 3.4, d: 1.5 },
        { id: "corridor", label: "Smart Elevator Bank", x: 10.5, z: 4.5, w: 1.8, d: 3.4 },
        { id: "seating", label: "Guest Lobby Lounge", x: 5.4, z: 6.6, w: 3.8, d: 2.4 },
        { id: "display", label: "Concierge & Spa Board", x: 2.4, z: 1.5, w: 1.8, d: 1.2 },
      ],
    },
  },
  {
    id: "office",
    label: "Office Tower / Clinic / Coworking",
    shortLabel: "Office Tower / Clinic",
    category: "Hotels & Corporate",
    family: "office",
    expectedZones:
      "tower entrance, security/reception desk, elevator & suite corridor, visitor waiting lounge, digital directory screen",
    spatialNotes: "Corporate/medical lobby with inter-floor elevator courier access",
    demoScene: {
      room: { width: 11, depth: 8 },
      zones: [
        { id: "entrance", label: "Tower Entrance", x: 1.3, z: 4.0, w: 1.5, d: 2.2 },
        { id: "desk", label: "Front Reception Desk", x: 5.4, z: 1.5, w: 2.8, d: 1.4 },
        { id: "corridor", label: "Elevator & Suite Hall", x: 9.6, z: 4.2, w: 1.8, d: 3.2 },
        { id: "waiting", label: "Visitor Waiting Lounge", x: 5.0, z: 5.8, w: 3.4, d: 2.2 },
        { id: "display", label: "Directory Info Screen", x: 8.8, z: 1.3, w: 1.8, d: 1.0 },
      ],
    },
  },

  // ---- Retail & Public Venues ----
  {
    id: "retail",
    label: "Retail Store / Showroom",
    shortLabel: "Retail / Showroom",
    category: "Retail & Public Venues",
    family: "retail",
    expectedZones:
      "storefront entrance, promo display stand, main product shelves/aisles, checkout counter, consultation/fitting lounge",
    spatialNotes: "Hard-floor showroom & retail aisles for greeting screens & floor cleaning",
    demoScene: {
      room: { width: 12, depth: 9 },
      zones: [
        { id: "entrance", label: "Storefront Entrance", x: 1.4, z: 4.5, w: 1.6, d: 2.2 },
        { id: "display", label: "Promo Campaign Display", x: 4.4, z: 1.6, w: 2.4, d: 1.4 },
        { id: "shelves", label: "Main Product Aisles", x: 6.0, z: 5.0, w: 3.8, d: 2.4 },
        { id: "counter", label: "Checkout Counter", x: 10.2, z: 2.6, w: 2.0, d: 2.8 },
        { id: "waiting", label: "Customer Lounge", x: 10.0, z: 6.8, w: 2.2, d: 2.0 },
      ],
    },
  },
  {
    id: "mall_airport",
    label: "Shopping Mall / Airport (Large 24/7)",
    shortLabel: "Mall / Airport (24/7)",
    category: "Retail & Public Venues",
    family: "mall",
    expectedZones:
      "terminal/atrium entrance, information desk, wide central concourse (≥180 cm), directory/departures board, concourse seating",
    spatialNotes: "5,000+ m² 24/7 concourse — compare 1 shift vs 3 shifts on industrial scrubbers",
    quickPick: true,
    demoScene: {
      room: { width: 16, depth: 11 },
      zones: [
        { id: "entrance", label: "Main Terminal Entrance", x: 1.6, z: 5.5, w: 2.0, d: 3.0 },
        { id: "desk", label: "Info & Concierge Desk", x: 6.8, z: 2.0, w: 3.2, d: 1.8 },
        { id: "corridor", label: "Wide Central Concourse", x: 8.4, z: 5.6, w: 5.0, d: 2.4 },
        { id: "display", label: "Directory & Flight Board", x: 4.2, z: 9.2, w: 2.8, d: 1.4 },
        { id: "seating", label: "Atrium Waiting Lounge", x: 13.2, z: 8.4, w: 3.2, d: 2.4 },
      ],
    },
  },

  // ---- Logistics & Industry ----
  {
    id: "warehouse",
    label: "Warehouse / Distribution Center",
    shortLabel: "Warehouse / DC",
    category: "Logistics & Industry",
    family: "warehouse",
    expectedZones:
      "inbound receiving dock, pallet storage racks, wide AMR logistics corridor (≥1,450 mm, ≤20 mm threshold), packing station, outbound staging bay",
    spatialNotes: "1,650 mm corridors & ≤20 mm thresholds for MiR250 & Pudu T300 AMRs",
    quickPick: true,
    demoScene: {
      room: { width: 16, depth: 11 },
      zones: [
        { id: "entrance", label: "Inbound Receiving Dock", x: 1.8, z: 5.5, w: 2.2, d: 3.2 },
        { id: "shelves", label: "Pallet Storage Racks", x: 6.8, z: 2.2, w: 4.4, d: 2.2 },
        { id: "corridor", label: "AMR Corridor (1.65 m)", x: 8.0, z: 5.6, w: 4.8, d: 2.0 },
        { id: "desk", label: "Order Packing Station", x: 6.8, z: 9.0, w: 3.8, d: 2.0 },
        { id: "waiting", label: "Outbound Dispatch Bay", x: 13.8, z: 5.5, w: 2.4, d: 3.4 },
      ],
    },
  },
  {
    id: "factory",
    label: "Factory / Manufacturing Floor",
    shortLabel: "Factory Floor",
    category: "Logistics & Industry",
    family: "factory",
    expectedZones:
      "component receiving bay, assembly workcells, material AMR lane (≥1,450 mm), QA inspection desk, finished-goods staging",
    spatialNotes: "Multi-shift intralogistics AMR kitting & heavy industrial floor scrubbing",
    quickPick: true,
    demoScene: {
      room: { width: 16, depth: 11 },
      zones: [
        { id: "entrance", label: "Component Receiving Bay", x: 1.8, z: 5.5, w: 2.2, d: 3.0 },
        { id: "shelves", label: "Assembly Workcells", x: 6.8, z: 2.3, w: 4.4, d: 2.2 },
        { id: "corridor", label: "Line-Side AMR Lane", x: 8.2, z: 5.6, w: 4.8, d: 2.0 },
        { id: "desk", label: "QA Inspection Station", x: 6.8, z: 8.9, w: 3.6, d: 2.0 },
        { id: "waiting", label: "Finished Goods Staging", x: 13.8, z: 5.5, w: 2.4, d: 3.2 },
      ],
    },
  },

  // ---- Fitness & Leisure ----
  {
    id: "gym",
    label: "Gym / Fitness Club",
    shortLabel: "Gym / Fitness",
    category: "Fitness & Leisure",
    family: "gym",
    expectedZones:
      "club entrance, membership check-in desk, workout floor lane, group studio hall, recovery lounge",
    spatialNotes: "Rubber & hard-floor gym lanes for commercial scrubbers, vacuums & greeter screens",
    demoScene: {
      room: { width: 12, depth: 8 },
      zones: [
        { id: "entrance", label: "Club Entrance", x: 1.3, z: 4.0, w: 1.6, d: 2.2 },
        { id: "counter", label: "Check-In Desk", x: 5.0, z: 1.5, w: 2.8, d: 1.4 },
        { id: "display", label: "Class Schedule Screen", x: 9.0, z: 1.4, w: 2.2, d: 1.2 },
        { id: "corridor", label: "Workout & Studio Hall", x: 10.2, z: 5.2, w: 2.2, d: 2.8 },
        { id: "seating", label: "Recovery Lounge", x: 5.2, z: 6.0, w: 3.4, d: 2.0 },
      ],
    },
  },
];

export const BUSINESS_PRESETS: BusinessPreset[] = RAW_PRESETS.map((p) => {
  const d = defaultsFor(p.id);
  return {
    ...p,
    defaultHoursPerWeek: d.hoursPerWeek,
    defaultHourlyCost: d.hourlyCost,
    defaultShifts: d.defaultShifts,
    costHelper: d.basis,
  };
});

export const AUTO_DETECT_DEFAULTS = {
  defaultHoursPerWeek: BUSINESS_DEFAULTS["auto-detect"].hoursPerWeek,
  defaultHourlyCost: BUSINESS_DEFAULTS["auto-detect"].hourlyCost,
  defaultShifts: BUSINESS_DEFAULTS["auto-detect"].defaultShifts,
  costHelper: `${BUSINESS_DEFAULTS["auto-detect"].basis} — Vision AI detects venue class automatically`,
};

export const CUSTOM_DEFAULTS = {
  defaultHoursPerWeek: BUSINESS_DEFAULTS.custom.hoursPerWeek,
  defaultHourlyCost: BUSINESS_DEFAULTS.custom.hourlyCost,
  defaultShifts: BUSINESS_DEFAULTS.custom.defaultShifts,
  costHelper: `${BUSINESS_DEFAULTS.custom.basis} — edit hours, rate, or shifts to match your payroll`,
};

export function isAutoDetect(businessType: string | null | undefined): boolean {
  const t = (businessType ?? "").trim().toLowerCase();
  return (
    t === AUTO_DETECT_ID ||
    t === AUTO_DETECT_LABEL.toLowerCase() ||
    /^auto[- ]?detect\b/.test(t)
  );
}

const PRESET_ALIASES: Record<string, string> = {
  cafe: "narrow_cafe",
  "café / coffee shop": "narrow_cafe",
  "small café (riga)": "narrow_cafe",
  "tight café": "narrow_cafe",
  "restaurant / bistro": "restaurant",
  "hotel lobby / reception": "hotel",
  "hotel lobby": "hotel",
  "clothing / concept store": "retail",
  "retail shop": "retail",
  "shopping mall atrium": "mall_airport",
  "airport / train terminal": "mall_airport",
  "gym / fitness club": "gym",
  "coworking / office reception": "office",
  "clinic / dental reception": "office",
};

export function findPreset(
  value: string | null | undefined,
): BusinessPreset | undefined {
  const t = (value ?? "").trim().toLowerCase();
  if (!t) return undefined;
  const direct = BUSINESS_PRESETS.find(
    (p) =>
      p.id === t ||
      p.label.toLowerCase() === t ||
      p.shortLabel.toLowerCase() === t,
  );
  if (direct) return direct;
  const aliasId = PRESET_ALIASES[t];
  if (aliasId) return BUSINESS_PRESETS.find((p) => p.id === aliasId);
  return undefined;
}

export function expectedZonesHint(
  businessType: string | null | undefined,
): string | null {
  if (!businessType || isAutoDetect(businessType)) return null;
  const exact = findPreset(businessType);
  if (exact) return exact.expectedZones;
  return null;
}
