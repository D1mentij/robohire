/**
 * ONE table of smart defaults for the /upload business-type selector (opening hours per week, staff €/h incl. employer tax).
 * EVERY value is an ASSUMPTION, not measured data: hospitality ≈ €8.5/h is the figure this project uses for Latvian hospitality
 * (see lib/roi/config.ts); all other rows are rough sector estimates for Latvia that the owner should adjust.
 * Selecting a preset fills the form fields, but never overwrites a value the user already edited.
 */
export type BusinessDefault = { hoursPerWeek: number; hourlyCost: number; assumption: true; basis: string };

const HOSP = "Latvian hospitality ≈ €8.5/h incl. employer tax is the project-wide assumption; other values are estimates scaled from it";
const EST = "Rough sector estimate for Latvia (no measured source) — adjust to your payroll";

export const BUSINESS_DEFAULTS: Record<string, BusinessDefault> = {
  cafe: { hoursPerWeek: 60, hourlyCost: 8.5, assumption: true, basis: HOSP },
  restaurant: { hoursPerWeek: 72, hourlyCost: 9.0, assumption: true, basis: HOSP },
  hotel: { hoursPerWeek: 112, hourlyCost: 9.5, assumption: true, basis: HOSP },
  bar: { hoursPerWeek: 56, hourlyCost: 9.0, assumption: true, basis: HOSP },
  retail_clothing: { hoursPerWeek: 66, hourlyCost: 8.0, assumption: true, basis: EST },
  supermarket: { hoursPerWeek: 91, hourlyCost: 8.0, assumption: true, basis: EST },
  electronics: { hoursPerWeek: 66, hourlyCost: 9.5, assumption: true, basis: EST },
  mall: { hoursPerWeek: 77, hourlyCost: 8.5, assumption: true, basis: EST },
  university: { hoursPerWeek: 55, hourlyCost: 10.0, assumption: true, basis: EST },
  conference: { hoursPerWeek: 50, hourlyCost: 11.0, assumption: true, basis: EST },
  museum: { hoursPerWeek: 48, hourlyCost: 9.0, assumption: true, basis: EST },
  coworking: { hoursPerWeek: 50, hourlyCost: 10.5, assumption: true, basis: EST },
  gym: { hoursPerWeek: 98, hourlyCost: 9.0, assumption: true, basis: EST },
  clinic: { hoursPerWeek: 50, hourlyCost: 11.5, assumption: true, basis: EST },
  car_dealership: { hoursPerWeek: 56, hourlyCost: 11.5, assumption: true, basis: EST },
  terminal: { hoursPerWeek: 126, hourlyCost: 10.5, assumption: true, basis: EST },
  "auto-detect": { hoursPerWeek: 60, hourlyCost: 8.5, assumption: true, basis: HOSP },
  custom: { hoursPerWeek: 60, hourlyCost: 8.5, assumption: true, basis: HOSP },
};

export const defaultsFor = (id: string): BusinessDefault => BUSINESS_DEFAULTS[id] ?? BUSINESS_DEFAULTS.custom;

/** Caption under the staff-cost field. */
export const costCaption = (typeLabel: string, hourlyCost: number): string =>
  `Typical estimate for ${typeLabel} in Latvia ≈ €${hourlyCost.toFixed(1)}/h incl. employer tax (assumption)`;
