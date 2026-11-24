import { BUSINESS_PRESETS, isAutoDetect } from "./businessPresets";
import { detectBusiness, type BusinessKind } from "./businessTemplates";

/** The template families the owner can pick/correct, with display names. `business_guess` of the model must be one of the ids. */
export const FAMILY_OPTIONS: { family: BusinessKind; label: string }[] = [
  { family: "cafe", label: "Café / Coffee shop" },
  { family: "restaurant", label: "Restaurant / Bistro" },
  { family: "bar", label: "Bar / Lounge" },
  { family: "hotel", label: "Hotel lobby / Reception" },
  { family: "retail", label: "Retail store" },
  { family: "supermarket", label: "Supermarket / Grocery" },
  { family: "mall", label: "Shopping mall atrium" },
  { family: "showroom", label: "Car dealership / Showroom" },
  { family: "university", label: "University / Campus hall" },
  { family: "event", label: "Conference / Expo venue" },
  { family: "museum", label: "Museum / Gallery" },
  { family: "office", label: "Office / Coworking reception" },
  { family: "library", label: "Library" },
  { family: "gym", label: "Gym / Fitness club" },
  { family: "clinic", label: "Clinic / Dental reception" },
  { family: "terminal", label: "Airport / Train terminal" },
  { family: "generic", label: "Other / General space" },
];
export const FAMILIES: BusinessKind[] = FAMILY_OPTIONS.map((f) => f.family);
export const familyLabel = (kind: string | null | undefined): string => FAMILY_OPTIONS.find((f) => f.family === kind)?.label ?? "Other / General space";
export const isFamily = (v: unknown): v is BusinessKind => typeof v === "string" && (FAMILIES as string[]).includes(v);

/** Maps the model's `business_guess` (a family id, or free text) to a family; null when unusable. */
export function parseFamily(guess: unknown): BusinessKind | null {
  if (typeof guess !== "string" || !guess.trim()) return null;
  const g = guess.trim().toLowerCase();
  if (isFamily(g)) return g === "generic" ? null : g;
  const byLabel = FAMILY_OPTIONS.find((f) => f.label.toLowerCase() === g);
  if (byLabel) return byLabel.family === "generic" ? null : byLabel.family;
  const k = detectBusiness(guess);
  return k === "generic" ? null : k;
}

const LIBRARY_ZONES = "entrance, service desk, book shelves, reading area, self-service return station";
/** Short hint for the zones prompt: which zone types this business family usually has (null = no hint). */
export function familyZonesHint(kind: BusinessKind): string | null {
  if (kind === "generic") return null;
  if (kind === "library") return LIBRARY_ZONES;
  return BUSINESS_PRESETS.find((p) => p.family === kind)?.expectedZones ?? null;
}

/** Hint for ANY business text (preset label, custom EN/LV/RU text); null for auto-detect / unknown. */
export function zonesHintFor(businessType: string | null | undefined): string | null {
  if (!businessType || isAutoDetect(businessType)) return null;
  return familyZonesHint(detectBusiness(businessType));
}
