import { k1Profile } from "@/lib/ai/k1Profile";
import type { Fit } from "@/types/contracts";

// All ROI assumptions live here. None of these are measured data.

/** assumption: the business is open 6 days a week. */
export const DAYS_OPEN_PER_WEEK = 6;

/** assumption: share of a task's hours the K1 can really take over, by fit. */
export const COVERAGE: Record<Fit, number> = {
  good: 0.8, // assumption
  partial: 0.4, // assumption
  no: 0,
};

/** assumption: robot price in EUR (Booster publishes none; see k1-profile.json price_eur). */
export const ROBOT_PRICE_EUR = k1Profile.price_eur.value;

/** assumption: maintenance + electricity per month, EUR. */
export const RUNNING_COST_EUR_MONTH = 60;

/** assumption: average weeks per month. */
export const WEEKS_PER_MONTH = 4.33;
