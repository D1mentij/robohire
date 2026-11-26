import { BUSINESS_PRESETS, isAutoDetect } from "./businessPresets";
import { detectBusiness, type BusinessKind } from "./businessTemplates";

/** Template families the owner can pick or correct after Vision AI Auto-detect. */
export const FAMILY_OPTIONS: { family: BusinessKind; label: string }[] = [
  { family: "cafe", label: "Tight Café / Bistro (~55 cm Aisles)" },
  { family: "restaurant", label: "Restaurant / Food Hall" },
  { family: "hotel", label: "Hotel / Resort (Multi-Floor)" },
  { family: "office", label: "Office Tower / Coworking" },
  { family: "clinic", label: "Clinic / Medical Center" },
  { family: "retail", label: "Retail Store / Boutique" },
  { family: "showroom", label: "Showroom / Car Dealership" },
  { family: "mall", label: "Shopping Mall / Airport (Large 24/7)" },
  { family: "terminal", label: "Airport / Transit Concourse" },
  { family: "warehouse", label: "Warehouse / Distribution Center" },
  { family: "factory", label: "Factory / Manufacturing Floor" },
  { family: "gym", label: "Gym / Fitness Club" },
  { family: "supermarket", label: "Supermarket / Hypermarket" },
  { family: "bar", label: "Bar / Lounge" },
  { family: "university", label: "University / Campus Hall" },
  { family: "event", label: "Conference / Expo Venue" },
  { family: "museum", label: "Museum / Gallery" },
  { family: "library", label: "Library" },
  { family: "generic", label: "Other / General Commercial Space" },
];

export const FAMILIES: BusinessKind[] = FAMILY_OPTIONS.map((f) => f.family);
export const familyLabel = (kind: string | null | undefined): string =>
  FAMILY_OPTIONS.find((f) => f.family === kind)?.label ??
  "Other / General Commercial Space";
export const isFamily = (v: unknown): v is BusinessKind =>
  typeof v === "string" && (FAMILIES as string[]).includes(v);

export function parseFamily(guess: unknown): BusinessKind | null {
  if (typeof guess !== "string" || !guess.trim()) return null;
  const g = guess.trim().toLowerCase();
  if (isFamily(g)) return g === "generic" ? null : g;
  const byLabel = FAMILY_OPTIONS.find((f) => f.label.toLowerCase() === g);
  if (byLabel) return byLabel.family === "generic" ? null : byLabel.family;
  const k = detectBusiness(guess);
  return k === "generic" ? null : k;
}

const EXTRA_ZONES: Partial<Record<BusinessKind, string>> = {
  library: "entrance, service desk, book shelves, reading area, return station",
  showroom: "entrance, vehicle/product display, customer lounge, sales desk, walkway",
  supermarket: "entrance, weekly promo display, grocery aisles, checkout lanes, wide scrubbing corridor",
  bar: "lounge entrance, bar counter, lounge booths, drinks board",
  clinic: "clinic entrance, reception desk, patient waiting area, elevator/treatment corridor",
  terminal: "terminal entrance, passenger info desk, departures board, wide concourse corridor, gate seating",
  university: "entrance, info desk, lecture hall corridor, schedule board, student seating",
  event: "venue entrance, registration desk, expo concourse, agenda board, networking lounge",
  museum: "gallery entrance, ticket desk, exhibition highlights, gallery wing corridor, benches",
};

export function familyZonesHint(kind: BusinessKind): string | null {
  if (kind === "generic") return null;
  return (
    BUSINESS_PRESETS.find((p) => p.family === kind)?.expectedZones ??
    EXTRA_ZONES[kind] ??
    null
  );
}

export function zonesHintFor(businessType: string | null | undefined): string | null {
  if (!businessType || isAutoDetect(businessType)) return null;
  const exact = BUSINESS_PRESETS.find(
    (p) => p.id === businessType || p.label.toLowerCase() === businessType.trim().toLowerCase(),
  );
  if (exact) return exact.expectedZones;
  return familyZonesHint(detectBusiness(businessType));
}
