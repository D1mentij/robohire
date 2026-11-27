/**
 * Booster K1 EDU — the PRIMARY robot (FINAL_SPEC.md decision 4).
 * Kept separate from the 15-robot catalog: it is a humanoid without hands,
 * so it gets its own honest archetype (greeter / guide) and no rent offer.
 * Prices verified 2026-11-26 — reference data, not a quote.
 */
export const K1_ID = "booster_k1";
export const K1_JOB_ID = "job_booster_k1";

export const K1_SPEC = {
  id: K1_ID,
  name: "Booster K1 EDU",
  shortName: "K1",
  category: "General Service & Reception",
  role: "reception",
  /** €7,500 ex VAT ≈ from €9,000 incl. VAT (generationrobots). */
  purchasePriceEur: 7500,
  purchasePriceInclVatEur: 9000,
  priceSource: "generationrobots.com: from €9,000 incl. VAT (€7,500 ex VAT)",
  verifiedOn: "2026-11-26",
  /** No distributor rent offer for K1 — buy only. */
  rentAvailable: false,
  batteryMinutes: 80,
  specsSummary:
    "Humanoid, ~95 cm, walks and gestures, battery up to 80 min, Booster SDK (Python/ROS2). No hands.",
  /** Honest limits — always shown. */
  limits:
    "No hands → cannot carry plates, clean or take payments. Battery up to 80 min per charge. A human still answers real questions.",
  jobTitle: "Greeter & guide — welcomes visitors, points the way, shows information",
} as const;

/** Latvian sellers / showrooms to contact (FINAL_SPEC.md decision 8). */
export const LATVIAN_SELLERS = [
  "Keen Robotic (Riga showroom)",
  "LAP Robotics",
  "ProRobotics",
  "aio.lv",
] as const;
