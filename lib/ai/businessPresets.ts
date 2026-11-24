import type { Scene } from "@/types/contracts";
import { BUSINESS_DEFAULTS, costCaption, defaultsFor } from "@/lib/roi/businessDefaults";
import type { BusinessKind } from "./businessTemplates";

export const AUTO_DETECT_ID = "auto-detect";
export const AUTO_DETECT_LABEL = "Auto-detect from video";
export const CUSTOM_PRESET_ID = "custom";
export const CUSTOM_PRESET_LABEL = "Custom business type...";

export type BusinessCategory = "Hospitality & Food" | "Retail" | "Public & Education" | "Services & Transport";

export type BusinessPreset = {
  id: string;
  label: string;
  category: BusinessCategory;
  /** Template family (lib/ai/businessTemplates.ts) this preset uses for tasks, labels and layout. */
  family: BusinessKind;
  /** Defaults come from lib/roi/businessDefaults.ts (all assumptions). */
  defaultHoursPerWeek: number;
  defaultHourlyCost: number;
  /** Caption under Staff hourly cost (€). */
  costHelper: string;
  /** Concise industry-specific spatial zones hint for the Vision AI prompt. */
  expectedZones: string;
  /** Whether to show as a one-click quick-pick chip on /upload. */
  quickPick?: boolean;
  /** Industry-appropriate fallback/demo floor plan (non-overlapping, meters). */
  demoScene: Scene;
};

export const BUSINESS_CATEGORIES: BusinessCategory[] = ["Hospitality & Food", "Retail", "Public & Education", "Services & Transport"];

type RawPreset = Omit<BusinessPreset, "defaultHoursPerWeek" | "defaultHourlyCost" | "costHelper">;

const RAW_PRESETS: RawPreset[] = [
  // ---- Hospitality & Food ----
  {
    id: "cafe",
    label: "Café / Coffee shop",
    category: "Hospitality & Food",
    family: "cafe",
    expectedZones: "entrance, service counter, seating tables, menu board, queue/waiting area",
    quickPick: true,
    demoScene: {
      room: { width: 8, depth: 6 },
      zones: [
        { id: "entrance", label: "Entrance", x: 1.1, z: 3.0, w: 1.4, d: 2.0 },
        { id: "counter", label: "Coffee counter", x: 6.2, z: 1.3, w: 2.8, d: 1.4 },
        { id: "display", label: "Menu board", x: 3.5, z: 1.0, w: 1.8, d: 1.0 },
        { id: "seating", label: "Café tables", x: 4.0, z: 4.3, w: 3.4, d: 2.2 },
        { id: "waiting", label: "Waiting area", x: 6.9, z: 4.5, w: 1.6, d: 2.0 },
      ],
    },
  },
  {
    id: "restaurant",
    label: "Restaurant / Bistro",
    category: "Hospitality & Food",
    family: "restaurant",
    expectedZones: "entrance, host desk, dining tables, bar/service counter, waiting lounge",
    quickPick: true,
    demoScene: {
      room: { width: 10, depth: 8 },
      zones: [
        { id: "entrance", label: "Main entrance", x: 1.3, z: 4.0, w: 1.6, d: 2.0 },
        { id: "desk", label: "Host desk", x: 3.4, z: 1.5, w: 1.8, d: 1.4 },
        { id: "display", label: "Daily specials board", x: 6.4, z: 1.2, w: 2.0, d: 1.0 },
        { id: "seating", label: "Dining tables", x: 5.5, z: 5.0, w: 4.4, d: 3.0 },
        { id: "counter", label: "Service bar", x: 8.6, z: 2.6, w: 1.8, d: 2.8 },
      ],
    },
  },
  {
    id: "hotel",
    label: "Hotel lobby / Reception",
    category: "Hospitality & Food",
    family: "hotel",
    expectedZones: "entrance, reception desk, lobby lounge, elevator corridor, amenities info board",
    quickPick: true,
    demoScene: {
      room: { width: 12, depth: 9 },
      zones: [
        { id: "entrance", label: "Main entrance", x: 1.4, z: 4.5, w: 1.6, d: 2.4 },
        { id: "counter", label: "Reception desk", x: 6.2, z: 1.6, w: 3.6, d: 1.6 },
        { id: "corridor", label: "Elevator corridor", x: 10.6, z: 4.5, w: 1.8, d: 3.2 },
        { id: "seating", label: "Lobby lounge", x: 5.4, z: 6.6, w: 4.0, d: 2.4 },
        { id: "display", label: "Amenities info board", x: 2.2, z: 1.6, w: 2.0, d: 1.2 },
      ],
    },
  },
  {
    id: "bar",
    label: "Bar / Lounge",
    category: "Hospitality & Food",
    family: "bar",
    expectedZones: "entrance, bar counter, lounge seating, drinks menu display, waiting area",
    demoScene: {
      room: { width: 9, depth: 7 },
      zones: [
        { id: "entrance", label: "Lounge entrance", x: 1.2, z: 3.5, w: 1.4, d: 2.0 },
        { id: "counter", label: "Bar counter", x: 6.5, z: 1.5, w: 3.6, d: 1.6 },
        { id: "display", label: "Drinks menu board", x: 3.4, z: 1.2, w: 1.8, d: 1.0 },
        { id: "seating", label: "Lounge booths", x: 5.2, z: 5.0, w: 4.2, d: 2.4 },
        { id: "waiting", label: "Waiting nook", x: 1.8, z: 5.8, w: 1.8, d: 1.6 },
      ],
    },
  },

  // ---- Retail & Commerce ----
  {
    id: "retail_clothing",
    label: "Clothing / Concept store",
    category: "Retail",
    family: "retail",
    expectedZones: "entrance, fitting rooms, promo display, product shelves/racks, checkout counter",
    quickPick: true,
    demoScene: {
      room: { width: 11, depth: 8 },
      zones: [
        { id: "entrance", label: "Store entrance", x: 1.3, z: 4.0, w: 1.6, d: 2.2 },
        { id: "display", label: "Seasonal promo display", x: 4.2, z: 1.6, w: 2.4, d: 1.4 },
        { id: "shelves", label: "Apparel racks", x: 5.5, z: 4.8, w: 3.6, d: 2.2 },
        { id: "counter", label: "Checkout counter", x: 9.4, z: 2.2, w: 2.0, d: 2.6 },
        { id: "waiting", label: "Fitting rooms lounge", x: 9.2, z: 6.4, w: 2.4, d: 2.0 },
      ],
    },
  },
  {
    id: "supermarket",
    label: "Supermarket / Grocery",
    category: "Retail",
    family: "supermarket",
    expectedZones: "entrance, promo display, grocery aisles/shelves, checkout counters, queue area",
    demoScene: {
      room: { width: 14, depth: 10 },
      zones: [
        { id: "entrance", label: "Store entrance", x: 1.4, z: 5.0, w: 1.8, d: 2.6 },
        { id: "display", label: "Weekly offers display", x: 4.4, z: 1.8, w: 2.6, d: 1.6 },
        { id: "shelves", label: "Main grocery aisles", x: 7.4, z: 5.2, w: 4.4, d: 3.0 },
        { id: "counter", label: "Checkout lanes", x: 12.2, z: 3.2, w: 2.2, d: 3.6 },
        { id: "waiting", label: "Self-checkout queue", x: 11.8, z: 8.0, w: 2.6, d: 2.0 },
      ],
    },
  },
  {
    id: "electronics",
    label: "Electronics showroom",
    category: "Retail",
    family: "retail",
    expectedZones: "entrance, demo product displays, consultation desk, product shelves, checkout counter",
    demoScene: {
      room: { width: 12, depth: 9 },
      zones: [
        { id: "entrance", label: "Showroom entrance", x: 1.3, z: 4.5, w: 1.6, d: 2.2 },
        { id: "display", label: "Tech demo display", x: 5.0, z: 2.2, w: 3.2, d: 1.8 },
        { id: "shelves", label: "Accessories shelves", x: 5.2, z: 6.4, w: 3.4, d: 2.0 },
        { id: "desk", label: "Consultation desk", x: 9.8, z: 2.4, w: 2.2, d: 2.0 },
        { id: "counter", label: "Pickup & checkout", x: 9.8, z: 6.6, w: 2.2, d: 2.2 },
      ],
    },
  },
  {
    id: "mall",
    label: "Shopping mall atrium",
    category: "Retail",
    family: "mall",
    expectedZones: "main entrance, information desk, store directory display, central corridor, rest seating",
    demoScene: {
      room: { width: 14, depth: 10 },
      zones: [
        { id: "entrance", label: "Atrium entrance", x: 1.5, z: 5.0, w: 2.0, d: 2.8 },
        { id: "desk", label: "Mall info desk", x: 6.8, z: 2.0, w: 3.0, d: 1.8 },
        { id: "display", label: "Store directory board", x: 3.8, z: 8.2, w: 2.6, d: 1.4 },
        { id: "corridor", label: "Central promenade", x: 7.4, z: 5.4, w: 4.2, d: 2.2 },
        { id: "seating", label: "Atrium seating", x: 11.8, z: 7.4, w: 2.8, d: 2.4 },
      ],
    },
  },

  // ---- Events, Education & Public Spaces ----
  {
    id: "university",
    label: "University / Campus hall",
    category: "Public & Education",
    family: "university",
    expectedZones: "entrance, student info desk, lecture hall corridor, event schedule board, student seating",
    demoScene: {
      room: { width: 12, depth: 8 },
      zones: [
        { id: "entrance", label: "Campus hall entrance", x: 1.4, z: 4.0, w: 1.8, d: 2.4 },
        { id: "desk", label: "Student info desk", x: 5.2, z: 1.6, w: 2.8, d: 1.6 },
        { id: "display", label: "Campus events board", x: 9.2, z: 1.5, w: 2.2, d: 1.2 },
        { id: "corridor", label: "Lecture hall corridor", x: 10.4, z: 5.2, w: 2.0, d: 3.0 },
        { id: "seating", label: "Student lounge", x: 5.4, z: 6.0, w: 3.8, d: 2.2 },
      ],
    },
  },
  {
    id: "conference",
    label: "Conference / Expo venue",
    category: "Public & Education",
    family: "event",
    expectedZones: "entrance, registration desk, auditorium entrance/corridor, schedule display, networking lounge",
    demoScene: {
      room: { width: 14, depth: 9 },
      zones: [
        { id: "entrance", label: "Venue entrance", x: 1.4, z: 4.5, w: 1.8, d: 2.6 },
        { id: "desk", label: "Registration desk", x: 5.6, z: 1.6, w: 3.4, d: 1.6 },
        { id: "display", label: "Agenda & stage board", x: 10.2, z: 1.5, w: 2.4, d: 1.2 },
        { id: "corridor", label: "Auditorium entrance", x: 12.2, z: 5.4, w: 2.2, d: 3.0 },
        { id: "seating", label: "Networking lounge", x: 6.0, z: 6.6, w: 4.2, d: 2.4 },
      ],
    },
  },
  {
    id: "museum",
    label: "Museum / Gallery",
    category: "Public & Education",
    family: "museum",
    expectedZones: "entrance, ticket desk, exhibition highlights display, gallery corridor, rest seating",
    demoScene: {
      room: { width: 12, depth: 9 },
      zones: [
        { id: "entrance", label: "Gallery entrance", x: 1.4, z: 4.5, w: 1.6, d: 2.4 },
        { id: "counter", label: "Ticket & audio desk", x: 5.2, z: 1.6, w: 2.8, d: 1.6 },
        { id: "display", label: "Exhibition highlights", x: 9.4, z: 1.8, w: 2.6, d: 1.6 },
        { id: "corridor", label: "Main gallery wing", x: 10.4, z: 6.0, w: 2.0, d: 3.0 },
        { id: "seating", label: "Atrium benches", x: 5.2, z: 6.6, w: 3.4, d: 2.0 },
      ],
    },
  },
  {
    id: "coworking",
    label: "Coworking / Office reception",
    category: "Public & Education",
    family: "office",
    expectedZones: "entrance, reception desk, visitor waiting area, meeting room corridor, info screen",
    demoScene: {
      room: { width: 10, depth: 7 },
      zones: [
        { id: "entrance", label: "Main entrance", x: 1.2, z: 3.5, w: 1.4, d: 2.0 },
        { id: "desk", label: "Reception desk", x: 5.0, z: 1.4, w: 2.6, d: 1.4 },
        { id: "waiting", label: "Visitor waiting lounge", x: 4.6, z: 5.2, w: 3.0, d: 2.0 },
        { id: "corridor", label: "Meeting room corridor", x: 8.6, z: 3.6, w: 1.8, d: 3.0 },
        { id: "display", label: "Company info screen", x: 8.2, z: 1.2, w: 1.8, d: 1.0 },
      ],
    },
  },

  // ---- Health, Fitness & Services ----
  {
    id: "gym",
    label: "Gym / Fitness club",
    category: "Services & Transport",
    family: "gym",
    expectedZones: "entrance, check-in desk, class schedule display, workout floor corridor, recovery lounge",
    quickPick: true,
    demoScene: {
      room: { width: 12, depth: 8 },
      zones: [
        { id: "entrance", label: "Club entrance", x: 1.3, z: 4.0, w: 1.6, d: 2.2 },
        { id: "counter", label: "Check-in desk", x: 5.0, z: 1.5, w: 2.8, d: 1.4 },
        { id: "display", label: "Class schedule board", x: 9.0, z: 1.4, w: 2.2, d: 1.2 },
        { id: "corridor", label: "Studio & locker hall", x: 10.4, z: 5.2, w: 2.0, d: 2.8 },
        { id: "seating", label: "Recovery lounge", x: 5.2, z: 6.0, w: 3.4, d: 2.0 },
      ],
    },
  },
  {
    id: "clinic",
    label: "Clinic / Dental reception",
    category: "Services & Transport",
    family: "clinic",
    expectedZones: "entrance, reception desk, patient waiting area, consultation corridor, patient info display",
    demoScene: {
      room: { width: 10, depth: 7 },
      zones: [
        { id: "entrance", label: "Clinic entrance", x: 1.2, z: 3.5, w: 1.4, d: 2.0 },
        { id: "desk", label: "Reception desk", x: 5.0, z: 1.4, w: 2.6, d: 1.4 },
        { id: "waiting", label: "Patient waiting area", x: 4.6, z: 5.2, w: 3.4, d: 2.0 },
        { id: "corridor", label: "Treatment room hallway", x: 8.6, z: 3.8, w: 1.8, d: 2.8 },
        { id: "display", label: "Patient info screen", x: 8.2, z: 1.2, w: 1.8, d: 1.0 },
      ],
    },
  },
  {
    id: "car_dealership",
    label: "Car dealership",
    category: "Services & Transport",
    family: "showroom",
    expectedZones: "entrance, car display, customer lounge, sales desk, test-drive waiting area",
    quickPick: true,
    demoScene: {
      room: { width: 14, depth: 9 },
      zones: [
        { id: "entrance", label: "Showroom entrance", x: 1.4, z: 4.5, w: 1.8, d: 2.4 },
        { id: "display", label: "Featured car display", x: 5.4, z: 2.4, w: 3.6, d: 2.2 },
        { id: "seating", label: "Customer lounge", x: 5.4, z: 6.8, w: 3.6, d: 2.2 },
        { id: "desk", label: "Sales & test-drive desk", x: 11.2, z: 2.4, w: 2.6, d: 2.0 },
        { id: "waiting", label: "Service waiting area", x: 11.2, z: 6.8, w: 2.6, d: 2.0 },
      ],
    },
  },
  {
    id: "terminal",
    label: "Airport / Train terminal",
    category: "Services & Transport",
    family: "terminal",
    expectedZones: "entrance, information desk, departure board display, gate/platform corridor, waiting seats",
    demoScene: {
      room: { width: 14, depth: 10 },
      zones: [
        { id: "entrance", label: "Terminal entrance", x: 1.5, z: 5.0, w: 2.0, d: 2.8 },
        { id: "desk", label: "Passenger info desk", x: 5.8, z: 1.8, w: 3.0, d: 1.6 },
        { id: "display", label: "Departures board", x: 10.4, z: 1.6, w: 2.6, d: 1.4 },
        { id: "corridor", label: "Gates & platforms hall", x: 12.2, z: 5.8, w: 2.2, d: 3.2 },
        { id: "waiting", label: "Passenger waiting seats", x: 6.4, z: 7.4, w: 4.4, d: 2.4 },
      ],
    },
  },
];

/** Presets with defaults from the one table in lib/roi/businessDefaults.ts. */
export const BUSINESS_PRESETS: BusinessPreset[] = RAW_PRESETS.map((p) => {
  const d = defaultsFor(p.id);
  return { ...p, defaultHoursPerWeek: d.hoursPerWeek, defaultHourlyCost: d.hourlyCost, costHelper: costCaption(p.label, d.hourlyCost) };
});

export const AUTO_DETECT_DEFAULTS = {
  defaultHoursPerWeek: BUSINESS_DEFAULTS["auto-detect"].hoursPerWeek,
  defaultHourlyCost: BUSINESS_DEFAULTS["auto-detect"].hourlyCost,
  costHelper: "Typical estimate for services in Latvia ≈ €8.5/h incl. employer tax (assumption) — adjust once the space type is detected",
};

export const CUSTOM_DEFAULTS = {
  defaultHoursPerWeek: BUSINESS_DEFAULTS.custom.hoursPerWeek,
  defaultHourlyCost: BUSINESS_DEFAULTS.custom.hourlyCost,
  costHelper: "Typical estimate ≈ €8.5/h incl. employer tax (assumption) — adjust opening hours and staff cost to your business",
};

export function isAutoDetect(businessType: string | null | undefined): boolean {
  const t = (businessType ?? "").trim().toLowerCase();
  return t === AUTO_DETECT_ID || t === AUTO_DETECT_LABEL.toLowerCase() || /^auto[- ]?detect\b/.test(t);
}

export function findPreset(value: string | null | undefined): BusinessPreset | undefined {
  const t = (value ?? "").trim().toLowerCase();
  if (!t) return undefined;
  return BUSINESS_PRESETS.find((p) => p.id === t || p.label.toLowerCase() === t);
}

export function expectedZonesHint(businessType: string | null | undefined): string | null {
  if (!businessType || isAutoDetect(businessType)) return null;
  const exact = findPreset(businessType);
  if (exact) return exact.expectedZones;
  return null;
}
