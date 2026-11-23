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

/** assumption: robot works 6 active hours/day (battery + charging; K1 runtime for service work is not published). */
export const ROBOT_ACTIVE_HOURS_PER_DAY = 6;

/** robot-hours available per week. */
export const ROBOT_CAPACITY_HOURS_PER_WEEK = ROBOT_ACTIVE_HOURS_PER_DAY * DAYS_OPEN_PER_WEEK;

/** jobs earning less than this gross EUR/month are not worth a robot slot. */
export const MIN_JOB_GROSS_EUR_MONTH = 20;
