import { ROBOTS_BY_ID } from "@/src/data/robots";
import type { Fit } from "@/types/contracts";

// Core ROI & RaaS Brokerage configuration constants.

/** Business days open per week for task-hour estimation. */
export const DAYS_OPEN_PER_WEEK = 6;

/** Share of task hours automated by fit rating when scoring task templates. */
export const COVERAGE: Record<Fit, number> = {
  good: 0.85,
  partial: 0.45,
  no: 0,
};

/** Default benchmark commercial robot price in EUR (Keenon T8 compact entry unit: €6,384). */
export const ROBOT_PRICE_EUR = ROBOTS_BY_ID.keenon_t8.purchasePriceEur;

/** Default monthly RaaS fee in EUR for Keenon T8 (€206/mo client RaaS). */
export const RUNNING_COST_EUR_MONTH = ROBOTS_BY_ID.keenon_t8.clientRaaSEur;

/** Average weeks per month. */
export const WEEKS_PER_MONTH = 4.33;

/** Active autonomous operating hours per shift. */
export const ROBOT_ACTIVE_HOURS_PER_DAY = 8;

/** Default weekly capacity for a single-shift deployment (48 h/week). */
export const ROBOT_CAPACITY_HOURS_PER_WEEK =
  ROBOT_ACTIVE_HOURS_PER_DAY * DAYS_OPEN_PER_WEEK;

/** Minimum gross monthly value to include a task in a bundle. */
export const MIN_JOB_GROSS_EUR_MONTH = 20;
