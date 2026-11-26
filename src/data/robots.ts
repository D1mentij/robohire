import type {
  LaborRole,
  RobotArchetype,
  RobotCategory,
  RobotType,
} from "@/types/contracts";

/**
 * Single Source of Truth for RoboHire's 15-Robot Commercial Catalog,
 * B2B RaaS Brokerage Unit Economics, and Verified 2026 Latvia Labor Costs.
 *
 * Currency & Brokerage Formulas:
 * - Exchange rate: 1 EUR = 1.09644 USD
 * - Client Monthly RaaS = Base Supplier RaaS × 1.15 (+15% RoboHire recurring brokerage margin)
 * - Monthly Commission = Client RaaS − Base Supplier RaaS
 * - Direct Sale Commission = Purchase Price (EUR) × 0.07 (7% broker fee)
 */
export const USD_PER_EUR = 1.09644;
export const BROKER_RAAS_MARKUP = 0.15;
export const BROKER_SALE_COMMISSION_RATE = 0.07;
export const LATVIA_EMPLOYER_VSAOI_RATE = 0.2359; // 23.59% employer social tax

export interface LatviaLaborBenchmark {
  role: LaborRole;
  title: string;
  grossMonthlyEur: number;
  /** Full monthly employer cost per 1 shift (Gross + 23.59% VSAOI) */
  employerMonthlyEur: number;
  /** Effective employer hourly cost (€/h) */
  hourlyEmployerEur: number;
  sourceNote: string;
}

/**
 * Official Latvia 2026 full employer labor benchmarks
 * (CSB Latvia Q2 2026, CV.lv, Algas.lv, and VisiDarbi.lv).
 */
export const LATVIA_2026_LABOR_BENCHMARKS: Record<
  LaborRole,
  LatviaLaborBenchmark
> = {
  waiter: {
    role: "waiter",
    title: "Waiter / Runner",
    grossMonthlyEur: 1256,
    employerMonthlyEur: 1552,
    hourlyEmployerEur: 9.24,
    sourceNote:
      "Latvia 2026 HoReCa employer cost: €9.24/h (€1,256 gross + 23.59% VSAOI = €1,552/mo per shift)",
  },
  reception: {
    role: "reception",
    title: "Hostess / Receptionist",
    grossMonthlyEur: 1350,
    employerMonthlyEur: 1668,
    hourlyEmployerEur: 9.93,
    sourceNote:
      "Latvia 2026 Reception / Hostess employer cost: €9.93/h (€1,350 gross + 23.59% VSAOI = €1,668/mo per shift)",
  },
  hotel_courier: {
    role: "hotel_courier",
    title: "Hotel / Office Porter & Courier",
    grossMonthlyEur: 1350,
    employerMonthlyEur: 1668,
    hourlyEmployerEur: 9.93,
    sourceNote:
      "Latvia 2026 Hotel Porter & Courier employer cost: €9.93/h (€1,350 gross + 23.59% VSAOI = €1,668/mo per shift)",
  },
  cleaner: {
    role: "cleaner",
    title: "Commercial Cleaner",
    grossMonthlyEur: 1050,
    employerMonthlyEur: 1298,
    hourlyEmployerEur: 7.72,
    sourceNote:
      "Latvia 2026 Commercial Cleaner employer cost: €7.72/h (€1,050 gross + 23.59% VSAOI = €1,298/mo per shift)",
  },
  scrubber_op: {
    role: "scrubber_op",
    title: "Mall / Industrial Scrubber Operator",
    grossMonthlyEur: 1200,
    employerMonthlyEur: 1483,
    hourlyEmployerEur: 8.83,
    sourceNote:
      "Latvia 2026 Scrubber Operator employer cost: €8.83/h (€1,200 gross + 23.59% VSAOI = €1,483/mo per shift)",
  },
  warehouse: {
    role: "warehouse",
    title: "Warehouse / Factory Worker",
    grossMonthlyEur: 1500,
    employerMonthlyEur: 1854,
    hourlyEmployerEur: 11.04,
    sourceNote:
      "Latvia 2026 Warehouse / Factory employer cost: €11.04/h (€1,500 gross + 23.59% VSAOI = €1,854/mo per shift)",
  },
};

export interface CommercialRobotSpec {
  id: RobotType;
  order: number;
  name: string;
  shortName: string;
  category: RobotCategory;
  role: LaborRole;
  archetype: RobotArchetype;
  purchasePriceEur: number;
  baseRaaSEur: number;
  clientRaaSEur: number;
  monthlyCommissionEur: number;
  saleCommissionEur: number;
  minAisleCm: number;
  payloadKg?: number;
  traysOrCompartments?: number;
  requiresElevatorIntegration?: boolean;
  maxThresholdMm?: number;
  standardCorridorMm?: number;
  minCorridorMm?: number;
  minViableShifts?: 1 | 2 | 3;
  minViableHoursWeek?: number;
  specsSummary: string;
  defaultJobTitle: string;
  accentHex: string;
  badgeClass: string;
}

export const ROBOTS_CATALOG_LIST: readonly CommercialRobotSpec[] = [
  {
    id: "pudu_bellabot",
    order: 1,
    name: "Pudu BellaBot / Pro",
    shortName: "BellaBot Pro",
    category: "HoReCa Delivery",
    role: "waiter",
    archetype: "tray_waiter",
    purchasePriceEur: 14501,
    baseRaaSEur: 306,
    clientRaaSEur: 351,
    monthlyCommissionEur: 46,
    saleCommissionEur: 1015,
    minAisleCm: 70,
    payloadKg: 40,
    traysOrCompartments: 4,
    specsSummary:
      "4 trays, up to 40 kg payload, elevator integration available. Min aisle ~70 cm.",
    defaultJobTitle: "Multi-Table Food & Drink Runner",
    accentHex: "#f97316",
    badgeClass:
      "border-orange-500/50 bg-orange-500/15 text-orange-700 dark:text-orange-300",
  },
  {
    id: "keenon_t8",
    order: 2,
    name: "Keenon T8",
    shortName: "Keenon T8",
    category: "HoReCa Delivery",
    role: "waiter",
    archetype: "tray_waiter",
    purchasePriceEur: 6384,
    baseRaaSEur: 179,
    clientRaaSEur: 206,
    monthlyCommissionEur: 27,
    saleCommissionEur: 447,
    minAisleCm: 55,
    payloadKg: 20,
    traysOrCompartments: 3,
    specsSummary:
      "Compact (~34 kg), passes narrow 55 cm aisles, 3 trays, 20 kg payload. Ideal for tight cafés; key narrow-aisle benchmark.",
    defaultJobTitle: "Narrow-Aisle Café Table Delivery (55 cm)",
    accentHex: "#fb923c",
    badgeClass:
      "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  {
    id: "keenon_t10",
    order: 3,
    name: "Keenon T10",
    shortName: "Keenon T10",
    category: "HoReCa Delivery",
    role: "waiter",
    archetype: "tray_waiter",
    purchasePriceEur: 16782,
    baseRaaSEur: 473,
    clientRaaSEur: 544,
    monthlyCommissionEur: 71,
    saleCommissionEur: 1175,
    minAisleCm: 75,
    payloadKg: 40,
    traysOrCompartments: 4,
    specsSummary:
      "High-capacity multi-tray delivery bot for mid-to-large restaurants. Min aisle ~75 cm.",
    defaultJobTitle: "High-Volume Banquet & Dining Delivery",
    accentHex: "#ea580c",
    badgeClass:
      "border-orange-500/50 bg-orange-500/15 text-orange-700 dark:text-orange-300",
  },
  {
    id: "bear_servi",
    order: 4,
    name: "Bear Robotics Servi",
    shortName: "Bear Servi",
    category: "HoReCa Delivery",
    role: "waiter",
    archetype: "tray_waiter",
    purchasePriceEur: 9111,
    baseRaaSEur: 254,
    clientRaaSEur: 293,
    monthlyCommissionEur: 38,
    saleCommissionEur: 638,
    minAisleCm: 65,
    payloadKg: 30,
    traysOrCompartments: 3,
    specsSummary:
      "2 trays + dirty-dish bussing tub, 30 kg total payload, dimensions 44.5 × 43 × 104.6 cm. Min aisle ~65 cm.",
    defaultJobTitle: "Order Runner & Dish-Bussing Return",
    accentHex: "#f59e0b",
    badgeClass:
      "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  {
    id: "pudu_kettybot_pro",
    order: 5,
    name: "Pudu KettyBot Pro",
    shortName: "KettyBot Pro",
    category: "Greeting & Retail",
    role: "reception",
    archetype: "greeter_screen",
    purchasePriceEur: 12769,
    baseRaaSEur: 358,
    clientRaaSEur: 411,
    monthlyCommissionEur: 54,
    saleCommissionEur: 894,
    minAisleCm: 55,
    specsSummary:
      "Greeter & escort robot with front advertising screen, compact 55 cm passage.",
    defaultJobTitle: "Guest Greeter, Promo Ad-Screen & Escort",
    accentHex: "#38bdf8",
    badgeClass:
      "border-sky-500/50 bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  {
    id: "pudu_flashbot",
    order: 6,
    name: "Pudu FlashBot",
    shortName: "Pudu FlashBot",
    category: "Hotel & Office Delivery",
    role: "hotel_courier",
    archetype: "enclosed_cabinet",
    purchasePriceEur: 18241,
    baseRaaSEur: 510,
    clientRaaSEur: 586,
    monthlyCommissionEur: 76,
    saleCommissionEur: 1277,
    minAisleCm: 70,
    traysOrCompartments: 2,
    requiresElevatorIntegration: true,
    maxThresholdMm: 15,
    specsSummary:
      "Enclosed compartments, autonomous elevator calling for multi-floor hotels, hospitals, and office towers. Requires elevator integration, adequate door widths, and flat thresholds.",
    defaultJobTitle: "Multi-Floor Enclosed Room & Parcel Courier",
    accentHex: "#8b5cf6",
    badgeClass:
      "border-violet-500/50 bg-violet-500/15 text-violet-700 dark:text-violet-300",
  },
  {
    id: "keenon_w3",
    order: 7,
    name: "Keenon W3 (ButlerBot)",
    shortName: "Keenon W3",
    category: "Hotel & Office Delivery",
    role: "hotel_courier",
    archetype: "enclosed_cabinet",
    purchasePriceEur: 26996,
    baseRaaSEur: 756,
    clientRaaSEur: 869,
    monthlyCommissionEur: 113,
    saleCommissionEur: 1890,
    minAisleCm: 75,
    traysOrCompartments: 4,
    requiresElevatorIntegration: true,
    maxThresholdMm: 15,
    specsSummary:
      "High-capacity enclosed hotel/office delivery robot (4 compartments), autonomous elevator calling. Requires elevator integration and low thresholds.",
    defaultJobTitle: "4-Compartment Hotel Butler & Tower Courier",
    accentHex: "#a855f7",
    badgeClass:
      "border-purple-500/50 bg-purple-500/15 text-purple-700 dark:text-purple-300",
  },
  {
    id: "lionsbot_r3_vac",
    order: 8,
    name: "LionsBot R3 Vac",
    shortName: "LionsBot R3 Vac",
    category: "Commercial Cleaning",
    role: "cleaner",
    archetype: "floor_scrubber",
    purchasePriceEur: 11857,
    baseRaaSEur: 337,
    clientRaaSEur: 387,
    monthlyCommissionEur: 50,
    saleCommissionEur: 830,
    minAisleCm: 60,
    maxThresholdMm: 15,
    specsSummary:
      "Accessible commercial vacuum robot for restaurants, hotels, gyms, and small/mid warehouses.",
    defaultJobTitle: "Autonomous Commercial Dry Vacuuming",
    accentHex: "#14b8a6",
    badgeClass:
      "border-teal-500/50 bg-teal-500/15 text-teal-700 dark:text-teal-300",
  },
  {
    id: "pudu_cc1",
    order: 9,
    name: "Pudu CC1",
    shortName: "Pudu CC1",
    category: "Commercial Cleaning",
    role: "cleaner",
    archetype: "floor_scrubber",
    purchasePriceEur: 20065,
    baseRaaSEur: 562,
    clientRaaSEur: 646,
    monthlyCommissionEur: 84,
    saleCommissionEur: 1405,
    minAisleCm: 70,
    maxThresholdMm: 15,
    specsSummary:
      "4-in-1 cleaning (sweeping, scrubbing, vacuuming, wet mopping), 8,000 sq ft/hr (~743 m²/hr), works on both hard floors and carpet.",
    defaultJobTitle: "4-in-1 Hard-Floor Scrubbing & Carpet Vacuuming",
    accentHex: "#0d9488",
    badgeClass:
      "border-teal-500/50 bg-teal-500/15 text-teal-700 dark:text-teal-300",
  },
  {
    id: "pudu_cc1_pro",
    order: 10,
    name: "Pudu CC1 Pro",
    shortName: "Pudu CC1 Pro",
    category: "Commercial Cleaning",
    role: "scrubber_op",
    archetype: "floor_scrubber",
    purchasePriceEur: 21889,
    baseRaaSEur: 610,
    clientRaaSEur: 702,
    monthlyCommissionEur: 92,
    saleCommissionEur: 1532,
    minAisleCm: 75,
    maxThresholdMm: 15,
    specsSummary:
      "Front & rear AI cameras, built for 5,000–8,000 m² spaces (shopping malls, airports, large lobbies).",
    defaultJobTitle: "AI-Vision Large Atrium & Concourse Scrubbing",
    accentHex: "#06b6d4",
    badgeClass:
      "border-cyan-500/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  },
  {
    id: "avidbots_neo_2",
    order: 11,
    name: "Avidbots Neo 2",
    shortName: "Avidbots Neo 2",
    category: "Industrial Cleaning",
    role: "scrubber_op",
    archetype: "floor_scrubber",
    purchasePriceEur: 72808,
    baseRaaSEur: 2039,
    clientRaaSEur: 2344,
    monthlyCommissionEur: 306,
    saleCommissionEur: 5097,
    minAisleCm: 120,
    minViableShifts: 2,
    minViableHoursWeek: 110,
    specsSummary:
      "Fully autonomous industrial floor scrubber (no route training required) for large distribution centers, airports, and malls. Economically viable in Latvia ONLY on 2+ shifts (≥110 operating hrs/week).",
    defaultJobTitle: "Heavy Autonomous Industrial Floor Scrubbing",
    accentHex: "#0284c7",
    badgeClass:
      "border-blue-500/50 bg-blue-500/15 text-blue-700 dark:text-blue-300",
  },
  {
    id: "gausium_scrubber_75p",
    order: 12,
    name: "Gausium Scrubber 75P",
    shortName: "Gausium 75P",
    category: "Industrial Cleaning",
    role: "scrubber_op",
    archetype: "floor_scrubber",
    purchasePriceEur: 87447,
    baseRaaSEur: 2434,
    clientRaaSEur: 2799,
    monthlyCommissionEur: 365,
    saleCommissionEur: 6121,
    minAisleCm: 130,
    minViableShifts: 2,
    minViableHoursWeek: 110,
    specsSummary:
      "Heavy-duty industrial scrubber for hypermarkets, airports, and massive logistics hubs. Economically viable in Latvia ONLY on 2–3 shifts (≥110 operating hrs/week).",
    defaultJobTitle: "24/7 Concourse & Logistics Hub Heavy Scrubbing",
    accentHex: "#2563eb",
    badgeClass:
      "border-indigo-500/50 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  },
  {
    id: "pudu_t300",
    order: 13,
    name: "Pudu T300",
    shortName: "Pudu T300",
    category: "Warehouse & Factory AMR",
    role: "warehouse",
    archetype: "warehouse_amr",
    purchasePriceEur: 19153,
    baseRaaSEur: 537,
    clientRaaSEur: 618,
    monthlyCommissionEur: 81,
    saleCommissionEur: 1341,
    minAisleCm: 90,
    payloadKg: 300,
    maxThresholdMm: 20,
    specsSummary:
      "Industrial AMR with 300 kg payload, transports pallets and materials without tracks or driver.",
    defaultJobTitle: "300 kg Trackless Pallet & Material Shuttle",
    accentHex: "#10b981",
    badgeClass:
      "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  {
    id: "mir250",
    order: 14,
    name: "MiR250",
    shortName: "MiR250",
    category: "Warehouse & Factory AMR",
    role: "warehouse",
    archetype: "warehouse_amr",
    purchasePriceEur: 44284,
    baseRaaSEur: 1240,
    clientRaaSEur: 1426,
    monthlyCommissionEur: 186,
    saleCommissionEur: 3100,
    minAisleCm: 85,
    payloadKg: 250,
    standardCorridorMm: 1450,
    minCorridorMm: 850,
    maxThresholdMm: 20,
    specsSummary:
      "Industrial AMR (800 × 580 × 300 mm, 250 kg payload). Key simulation constraints: 1,450 mm standard corridor width (850 mm minimum), 20 mm max threshold/gap tolerance.",
    defaultJobTitle: "Intralogistics Corridor & Line-Side AMR Transport",
    accentHex: "#059669",
    badgeClass:
      "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  {
    id: "temi",
    order: 15,
    name: "Temi",
    shortName: "Temi",
    category: "General Service & Reception",
    role: "reception",
    archetype: "greeter_screen",
    purchasePriceEur: 4103,
    baseRaaSEur: 115,
    clientRaaSEur: 132,
    monthlyCommissionEur: 17,
    saleCommissionEur: 287,
    minAisleCm: 55,
    specsSummary:
      "Personal video-call assistant robot for guest greeting, telepresence, and wayfinding. Most affordable unit in catalog.",
    defaultJobTitle: "Lobby Greeting, Telepresence & Wayfinding",
    accentHex: "#ec4899",
    badgeClass:
      "border-pink-500/50 bg-pink-500/15 text-pink-700 dark:text-pink-300",
  },
] as const;

export const ROBOTS_BY_ID: Record<RobotType, CommercialRobotSpec> =
  Object.fromEntries(ROBOTS_CATALOG_LIST.map((r) => [r.id, r])) as Record<
    RobotType,
    CommercialRobotSpec
  >;

/**
 * Automatic shift tier derived from weekly opening/operating hours:
 * - <= 60 h/wk -> 1 shift
 * - 61..119 h/wk -> 2 shifts
 * - >= 120 h/wk -> 3 shifts (24/7)
 */
export function shiftsFromHours(hoursPerWeek: number): 1 | 2 | 3 {
  if (!Number.isFinite(hoursPerWeek) || hoursPerWeek <= 60) return 1;
  if (hoursPerWeek < 120) return 2;
  return 3;
}

export interface RobotRoiMetrics {
  shiftsCount: 1 | 2 | 3;
  roleBenchmark: LatviaLaborBenchmark;
  roleCostPerShiftEur: number;
  humanMonthlyCostEur: number;
  clientRaaSEur: number;
  baseRaaSEur: number;
  monthlyCommissionEur: number;
  purchasePriceEur: number;
  saleCommissionEur: number;
  monthlySavingsEur: number;
  savingsPct: number;
  paybackMonths: number | null;
}

/**
 * Computes full monthly client RaaS vs Latvia 2026 employer cost (incl. 23.59% VSAOI)
 * across 1, 2, or 3 shifts, optionally scaling if the user manually overrides the hourly rate.
 */
export function computeRobotRoiMetrics(
  robot: CommercialRobotSpec,
  opts: {
    hoursPerWeek?: number;
    shiftsOverride?: 1 | 2 | 3 | null;
    hourlyCostOverrideRatio?: number | null;
  } = {},
): RobotRoiMetrics {
  const shiftsCount =
    opts.shiftsOverride ?? shiftsFromHours(opts.hoursPerWeek ?? 60);
  const roleBenchmark = LATVIA_2026_LABOR_BENCHMARKS[robot.role];
  const ratio =
    opts.hourlyCostOverrideRatio &&
    Number.isFinite(opts.hourlyCostOverrideRatio) &&
    opts.hourlyCostOverrideRatio > 0 &&
    Math.abs(opts.hourlyCostOverrideRatio - 1) > 0.015
      ? opts.hourlyCostOverrideRatio
      : 1;

  const roleCostPerShiftEur = Math.round(
    roleBenchmark.employerMonthlyEur * ratio,
  );
  const humanMonthlyCostEur = roleCostPerShiftEur * shiftsCount;
  const monthlySavingsEur = humanMonthlyCostEur - robot.clientRaaSEur;
  const rawPct =
    humanMonthlyCostEur > 0
      ? ((humanMonthlyCostEur - robot.clientRaaSEur) / humanMonthlyCostEur) *
        100
      : -100;
  const savingsPct = Math.round(rawPct * 10) / 10;
  const paybackMonths =
    monthlySavingsEur > 0
      ? Math.max(1, Math.round(robot.purchasePriceEur / monthlySavingsEur))
      : null;

  return {
    shiftsCount,
    roleBenchmark,
    roleCostPerShiftEur,
    humanMonthlyCostEur,
    clientRaaSEur: robot.clientRaaSEur,
    baseRaaSEur: robot.baseRaaSEur,
    monthlyCommissionEur: robot.monthlyCommissionEur,
    purchasePriceEur: robot.purchasePriceEur,
    saleCommissionEur: robot.saleCommissionEur,
    monthlySavingsEur,
    savingsPct,
    paybackMonths,
  };
}
