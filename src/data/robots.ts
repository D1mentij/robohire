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
 * Prices (verified 2026-11-26, reference data, not a quote):
 * - Keenon T8: distributor quote (purchase + rent); Keenon W3/T10: Riga retail listing.
 * - All others: US list price converted at 1 EUR = 1.096 USD.
 * - Rent: distributor quote where we have one, else estimate = 2.8% of price / month.
 * Client economics use rentEurMonth with NO markup. Broker/Partner view only:
 * monthly commission = 15% of rent, sale commission = 7% of price
 * (assumption: referral fee paid by distributor).
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
  /** Where the purchase price comes from (shown on /report). */
  priceSource: string;
  /** Client-facing monthly rent from the distributor (NO RoboHire markup). */
  rentEurMonth: number;
  /** "quote" = real distributor quote; "estimate" = 2.8%-of-price/month model. */
  rentSource: "quote" | "estimate";
  /** Date the price/rent reference data was checked (ISO). */
  verifiedOn: string;
  /** Broker view only: rent the distributor charges (= client rent). */
  baseRaaSEur: number;
  /** Client monthly price = rentEurMonth (no markup since 2026-11-27). */
  clientRaaSEur: number;
  /** Broker view only — assumption: referral fee paid by distributor (15% of rent). */
  monthlyCommissionEur: number;
  /** Broker view only — assumption: referral fee paid by distributor (7% of price). */
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

const RAW_ROBOTS: readonly RawRobotRow[] = [
  {
    id: "pudu_bellabot",
    order: 1,
    name: "Pudu BellaBot / Pro",
    shortName: "BellaBot Pro",
    category: "HoReCa Delivery",
    role: "waiter",
    archetype: "tray_waiter",
    purchasePriceEur: 14501,
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
    purchasePriceEur: 8900,
    rentQuoteEurMonth: 370,
    priceSource:
      "Distributor quote, ex VAT (aparaturafiscala.ro): €8,900 purchase / €370 per month rent",
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
    purchasePriceEur: 12000,
    priceSource: "babystore.lv (Riga) listing — VAT status unconfirmed",
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
    purchasePriceEur: 16000,
    priceSource: "babystore.lv (Riga) listing — VAT status unconfirmed",
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
    minAisleCm: 120,
    minViableShifts: 2,
    minViableHoursWeek: 110,
    specsSummary:
      "Fully autonomous industrial floor scrubber (no route training required) for large distribution centers, airports, and malls. Needs very large floor areas and 2–3 shifts to have any chance of paying back in Latvia.",
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
    minAisleCm: 130,
    minViableShifts: 2,
    minViableHoursWeek: 110,
    specsSummary:
      "Heavy-duty industrial scrubber for hypermarkets, airports, and massive logistics hubs. Needs very large floor areas and 2–3 shifts to have any chance of paying back in Latvia.",
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
    minAisleCm: 55,
    specsSummary:
      "Personal video-call assistant robot for guest greeting, telepresence, and wayfinding. Most affordable unit in catalog.",
    defaultJobTitle: "Lobby Greeting, Telepresence & Wayfinding",
    accentHex: "#ec4899",
    badgeClass:
      "border-pink-500/50 bg-pink-500/15 text-pink-700 dark:text-pink-300",
  },
];

/** Monthly rent model when no distributor quote exists: 2.8% of purchase price. */
export const RENT_ESTIMATE_RATE = 0.028;
export const PRICE_VERIFIED_ON = "2026-11-26";
export const US_LIST_PRICE_SOURCE = "US list price converted at 1 EUR = 1.096 USD";

type RawRobotRow = Omit<
  CommercialRobotSpec,
  | "priceSource"
  | "rentEurMonth"
  | "rentSource"
  | "verifiedOn"
  | "baseRaaSEur"
  | "clientRaaSEur"
  | "monthlyCommissionEur"
  | "saleCommissionEur"
> & { priceSource?: string; rentQuoteEurMonth?: number };

export const ROBOTS_CATALOG_LIST: readonly CommercialRobotSpec[] = RAW_ROBOTS.map(
  ({ rentQuoteEurMonth, priceSource, ...r }) => {
    const rent =
      rentQuoteEurMonth ?? Math.round(r.purchasePriceEur * RENT_ESTIMATE_RATE);
    return {
      ...r,
      priceSource: priceSource ?? US_LIST_PRICE_SOURCE,
      rentEurMonth: rent,
      rentSource: rentQuoteEurMonth !== undefined ? "quote" : "estimate",
      verifiedOn: PRICE_VERIFIED_ON,
      baseRaaSEur: rent,
      clientRaaSEur: rent,
      monthlyCommissionEur: Math.round(rent * BROKER_RAAS_MARKUP),
      saleCommissionEur: Math.round(r.purchasePriceEur * BROKER_SALE_COMMISSION_RATE),
    };
  },
);

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
