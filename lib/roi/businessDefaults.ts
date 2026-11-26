import type { LaborRole } from "@/types/contracts";
import {
  LATVIA_2026_LABOR_BENCHMARKS,
  shiftsFromHours,
} from "@/src/data/robots";

/**
 * Verified Latvia 2026 defaults per business preset on /upload
 * (Gross salary + 23.59% employer VSAOI social tax = full employer labor cost,
 * sourced from CSB Latvia Q2 2026, CV.lv, Algas.lv, and VisiDarbi.lv).
 */
export type BusinessDefault = {
  hoursPerWeek: number;
  hourlyCost: number;
  defaultShifts: 1 | 2 | 3;
  primaryRole: LaborRole;
  basis: string;
};

function makeDefault(
  hoursPerWeek: number,
  role: LaborRole,
  sectorLabel: string,
): BusinessDefault {
  const b = LATVIA_2026_LABOR_BENCHMARKS[role];
  const shifts = shiftsFromHours(hoursPerWeek);
  return {
    hoursPerWeek,
    hourlyCost: b.hourlyEmployerEur,
    defaultShifts: shifts,
    primaryRole: role,
    basis: `Latvia 2026 ${sectorLabel} employer cost: €${b.hourlyEmployerEur.toFixed(2)}/h (€${b.grossMonthlyEur.toLocaleString("en-US")} gross + 23.59% VSAOI = €${b.employerMonthlyEur.toLocaleString("en-US")}/mo per shift)`,
  };
}

export const BUSINESS_DEFAULTS: Record<string, BusinessDefault> = {
  narrow_cafe: makeDefault(56, "waiter", "HoReCa"),
  restaurant: makeDefault(84, "waiter", "HoReCa"),
  hotel: makeDefault(168, "hotel_courier", "Hotel Porter & Reception"),
  office: makeDefault(60, "reception", "Office / Clinic Reception"),
  retail: makeDefault(70, "reception", "Retail & Showroom"),
  mall_airport: makeDefault(168, "scrubber_op", "Mall / Industrial Scrubber"),
  warehouse: makeDefault(112, "warehouse", "Warehouse & Logistics"),
  factory: makeDefault(120, "warehouse", "Manufacturing & AMR"),
  gym: makeDefault(98, "cleaner", "Commercial Cleaning"),
  "auto-detect": makeDefault(60, "waiter", "HoReCa / Service"),
  custom: makeDefault(60, "reception", "General Service"),
};

export const defaultsFor = (id: string): BusinessDefault =>
  BUSINESS_DEFAULTS[id] ?? BUSINESS_DEFAULTS.custom;

/** Exact Latvia 2026 VSAOI caption under the Staff hourly cost (€) field. */
export const costCaption = (idOrLabel: string, hourlyCost: number): string => {
  const known = BUSINESS_DEFAULTS[idOrLabel];
  if (known && Math.abs(known.hourlyCost - hourlyCost) < 0.02) {
    return known.basis;
  }
  return `Latvia 2026 employer cost: €${hourlyCost.toFixed(2)}/h (incl. 23.59% employer VSAOI social tax)`;
};
