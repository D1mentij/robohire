import {
  filterValidSteps,
  type Fit,
  type Job,
  type RobotType,
  type Scenario,
  type ScenarioStep,
  type Scene,
} from "@/types/contracts";
import { detectBusiness, type BusinessKind } from "@/lib/ai/businessTemplates";
import { finalizeSteps, shortLabel } from "@/lib/ai/labels";
import { COVERAGE, WEEKS_PER_MONTH } from "@/lib/roi/config";

export type HelperRobotType = Exclude<RobotType, "k1">;

export interface RobotMeta {
  type: RobotType;
  isPrimary: boolean;
  name: string;
  shortName: string;
  filterLabel: string;
  roleBadge: string;
  priceEur: number;
  accentHex: string;
  badgeClass: string;
  tagline: string;
}

export const ROBOT_CATALOG: Record<RobotType, RobotMeta> = {
  k1: {
    type: "k1",
    isPrimary: true,
    name: "Booster K1",
    shortName: "Booster K1",
    filterLabel: "Booster K1 (Primary)",
    roleBadge: "Primary Robot • Booster K1",
    priceEur: 8000,
    accentHex: "#38bdf8",
    badgeClass:
      "border-sky-500/50 bg-sky-500/15 text-sky-700 dark:text-sky-300",
    tagline: "Smart humanoid assistant for greeting, wayfinding, and guest guidance",
  },
  vacuum: {
    type: "vacuum",
    isPrimary: false,
    name: "Robot Vacuum & Mop",
    shortName: "Vacuum & Mop",
    filterLabel: "Vacuum",
    roleBadge: "Optional Helper • Vacuum & Mop",
    priceEur: 1400,
    accentHex: "#14b8a6",
    badgeClass:
      "border-teal-500/50 bg-teal-500/15 text-teal-700 dark:text-teal-300",
    tagline: "Scheduled sweeping & mopping of open floor areas with auto-empty dock",
  },
  window_cleaner: {
    type: "window_cleaner",
    isPrimary: false,
    name: "Window Cleaning Robot",
    shortName: "Window Cleaner",
    filterLabel: "Window Cleaner",
    roleBadge: "Optional Helper • Window Cleaner",
    priceEur: 550,
    accentHex: "#06b6d4",
    badgeClass:
      "border-cyan-500/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
    tagline: "Storefront & panoramic glass cleaning with power cord & safety tether",
  },
  tray_delivery: {
    type: "tray_delivery",
    isPrimary: false,
    name: "Tray Delivery & Busser Bot",
    shortName: "Tray Delivery",
    filterLabel: "Tray Delivery",
    roleBadge: "Optional Helper • Tray Delivery",
    priceEur: 6500,
    accentHex: "#f97316",
    badgeClass:
      "border-orange-500/50 bg-orange-500/15 text-orange-700 dark:text-orange-300",
    tagline: "Multi-tier autonomous transport between counters, tables, and rooms",
  },
  uvc_disinfection: {
    type: "uvc_disinfection",
    isPrimary: false,
    name: "UV-C Disinfection Bot",
    shortName: "UV-C Disinfection",
    filterLabel: "UV-C Disinfection",
    roleBadge: "Optional Helper • UV-C Bot",
    priceEur: 9500,
    accentHex: "#a855f7",
    badgeClass:
      "border-purple-500/50 bg-purple-500/15 text-purple-700 dark:text-purple-300",
    tagline: "After-hours UV-C sterilization for clinics, gyms, hotels, and shared halls",
  },
  shelf_scanner: {
    type: "shelf_scanner",
    isPrimary: false,
    name: "Shelf-Scanning Inventory Bot",
    shortName: "Shelf Scanner",
    filterLabel: "Shelf Scanner",
    roleBadge: "Optional Helper • Shelf Scanner",
    priceEur: 7500,
    accentHex: "#6366f1",
    badgeClass:
      "border-indigo-500/50 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
    tagline: "Autonomous aisle scanning for out-of-stock gaps and price-tag checks",
  },
  air_purifier: {
    type: "air_purifier",
    isPrimary: false,
    name: "Mobile Air Purifier Bot",
    shortName: "Air Purifier",
    filterLabel: "Air Purifier",
    roleBadge: "Optional Helper • Air Purifier",
    priceEur: 2200,
    accentHex: "#10b981",
    badgeClass:
      "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    tagline: "Autonomous air quality, odor, and CO2 management across busy zones",
  },
  security_rover: {
    type: "security_rover",
    isPrimary: false,
    name: "Indoor Security & Patrol Rover",
    shortName: "Security Rover",
    filterLabel: "Security Rover",
    roleBadge: "Optional Helper • Security Rover",
    priceEur: 4200,
    accentHex: "#f43f5e",
    badgeClass:
      "border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-300",
    tagline: "Night-time perimeter patrol, door/window checks, and anomaly alerts",
  },
};

export const ROBOT_FILTER_ORDER: readonly ("all" | RobotType)[] = [
  "all",
  "k1",
  "vacuum",
  "window_cleaner",
  "tray_delivery",
  "uvc_disinfection",
  "shelf_scanner",
  "air_purifier",
  "security_rover",
] as const;

export function getRobotMeta(type: RobotType): RobotMeta {
  return ROBOT_CATALOG[type] ?? ROBOT_CATALOG.k1;
}

export function isHelperRobot(type: RobotType): type is HelperRobotType {
  return type !== "k1";
}

export function inferRobotType(job: Pick<Job, "id" | "robot_type">): RobotType {
  if (job.robot_type && job.robot_type in ROBOT_CATALOG) {
    return job.robot_type;
  }
  const id = job.id.toLowerCase();
  if (id.startsWith("helper_vacuum")) return "vacuum";
  if (id.startsWith("helper_window")) return "window_cleaner";
  if (id.startsWith("helper_tray")) return "tray_delivery";
  if (id.startsWith("helper_uvc")) return "uvc_disinfection";
  if (id.startsWith("helper_shelf")) return "shelf_scanner";
  if (id.startsWith("helper_air")) return "air_purifier";
  if (id.startsWith("helper_security")) return "security_rover";
  return "k1";
}

function estimateMonthlySavings(
  hoursPerWeek: number,
  fit: Fit,
  hourlyCost: number,
): number {
  if (fit === "no") return 0;
  return Math.max(
    0,
    Math.round(hoursPerWeek * COVERAGE[fit] * WEEKS_PER_MONTH * hourlyCost),
  );
}

function estimatePayback(
  savingsPerMonth: number,
  robotType: RobotType,
  fit: Fit,
): number | null {
  if (fit === "no" || savingsPerMonth <= 0) return null;
  const price = ROBOT_CATALOG[robotType].priceEur;
  return Math.max(1, Math.round(price / savingsPerMonth));
}

function measureSpace(scene: Scene) {
  const area = Math.max(1, scene.room.width * scene.room.depth);
  const occupied = scene.zones.reduce((sum, z) => sum + z.w * z.d, 0);
  const freeRatio = Math.max(0, 1 - occupied / area);
  const minDim = Math.min(scene.room.width, scene.room.depth);
  const hasNarrowAisles = minDim < 6.5 || freeRatio < 0.34;
  const hasShelves = scene.zones.some((z) =>
    /shelf|shelves|aisle|rack|display|product|merch/i.test(`${z.id} ${z.label}`),
  );
  const hasSeating = scene.zones.some((z) =>
    /table|seat|lounge|sofa|dining|waiting/i.test(`${z.id} ${z.label}`),
  );
  const hasCounter = scene.zones.some((z) =>
    /counter|bar|desk|reception|checkout/i.test(`${z.id} ${z.label}`),
  );
  return { area, freeRatio, hasNarrowAisles, hasShelves, hasSeating, hasCounter };
}

function makeHelperJob(opts: {
  id: string;
  robotType: HelperRobotType;
  title: string;
  fit: Fit;
  score: number;
  why: string;
  limits: string;
  hoursPerWeek: number;
  hourlyCost: number;
}): Job {
  const savings = estimateMonthlySavings(
    opts.hoursPerWeek,
    opts.fit,
    opts.hourlyCost,
  );
  return {
    id: opts.id,
    title: opts.title,
    fit: opts.fit,
    score: opts.score,
    why: opts.why,
    limits: opts.limits,
    hours_per_week: opts.hoursPerWeek,
    savings_eur_month: savings,
    payback_months: estimatePayback(savings, opts.robotType, opts.fit),
    robot_type: opts.robotType,
  };
}

/**
 * Generates tailored Optional Helper Robot job recommendations for a given space
 * and business type, enforcing honest hardware limitations (e.g. narrow aisles,
 * after-hours UV-C restrictions, safety tether for glass, thresholds for vacuums).
 */
export function generateHelperRobotJobs(
  scene: Scene,
  businessType: string,
  hourlyCost = 8.5,
  hoursPerWeek = 60,
): Job[] {
  const family: BusinessKind = detectBusiness(
    businessType,
    scene.zones.map((z) => z.label),
  );
  const space = measureSpace(scene);
  const scale = Math.min(1.6, Math.max(0.6, hoursPerWeek / 60));
  const scaledHours = (base: number) => Math.max(2, Math.round(base * scale * 2) / 2);

  const jobs: Job[] = [];

  // 1. Hospitality & Food: Café, Restaurant, Bar
  if (family === "cafe" || family === "restaurant" || family === "bar") {
    jobs.push(
      makeHelperJob({
        id: "helper_vacuum_floor",
        robotType: "vacuum",
        title: "Scheduled Floor Sweeping & Mopping",
        fit: "good",
        score: 86,
        why: "Open dining and entry floors accumulate crumbs and footprints daily. A docked robot vacuum and mop handles scheduled sweeping and light mopping before opening and after closing.",
        limits:
          "Limited by floor thresholds over 2 cm, tightly packed chair legs, and wet spills. Auto-empty dock requires a dedicated wall outlet and clear floor clearance.",
        hoursPerWeek: scaledHours(7),
        hourlyCost,
      }),
    );

    jobs.push(
      makeHelperJob({
        id: "helper_window_storefront",
        robotType: "window_cleaner",
        title: "Storefront & Glass Partition Cleaning",
        fit: "good",
        score: 79,
        why: "Front glass panes gather fingerprints and street dust. A suction-mounted window cleaning robot automates vertical glass passes while staff focus on guests.",
        limits:
          "Requires flat vertical glass panes, continuous power cord connection, and an anchored safety tether. Cannot cross raised mullions or clean curved glass automatically.",
        hoursPerWeek: scaledHours(4),
        hourlyCost,
      }),
    );

    const tightForTray = space.hasNarrowAisles;
    jobs.push(
      makeHelperJob({
        id: "helper_tray_delivery",
        robotType: "tray_delivery",
        title: "Autonomous Tray Delivery & Bussing",
        fit: tightForTray ? "no" : "partial",
        score: tightForTray ? 22 : 64,
        why: tightForTray
          ? "Moving trays between the service counter and seating area is repetitive, but this floor plan has tight clearances between tables."
          : "A multi-tier tray delivery bot can shuttle orders and cleared dishes between the counter and seating zones during peak hours.",
        limits: tightForTray
          ? "Marked Not Suitable: aisles and seating clearances are too narrow (needs ≥ 1.0 m unobstructed pathways) for safe wheeled tray navigation."
          : "Requires wide, flat aisles without steps or loose bags. Staff or guests must still load and unload trays manually.",
        hoursPerWeek: scaledHours(9),
        hourlyCost,
      }),
    );

    jobs.push(
      makeHelperJob({
        id: "helper_air_purifier",
        robotType: "air_purifier",
        title: "Autonomous Air & Odor Management",
        fit: "partial",
        score: 62,
        why: "Patrols busy seating and counter areas to filter cooking odors, steam, and elevated CO2 levels automatically during peak service.",
        limits:
          "Supplements rather than replaces building HVAC ventilation; requires periodic HEPA/carbon filter replacements and clear floor routes.",
        hoursPerWeek: scaledHours(5),
        hourlyCost,
      }),
    );
    return jobs;
  }

  // 2. Health, Wellness & Hospitality Stays: Clinic, Gym, Hotel
  if (family === "clinic" || family === "gym" || family === "hotel") {
    const spaceNoun =
      family === "clinic"
        ? "treatment and waiting areas"
        : family === "gym"
          ? "workout zones and studio floors"
          : "lobby and shared guest spaces";

    jobs.push(
      makeHelperJob({
        id: "helper_uvc_sterilization",
        robotType: "uvc_disinfection",
        title: "After-Hours UV-C Space Disinfection",
        fit: "good",
        score: 88,
        why: `High-touch ${spaceNoun} benefit from consistent overnight UV-C surface sterilization without chemical residue.`,
        limits:
          "Strictly restricted to after-hours completely empty rooms (UV-C light is unsafe for people and pets). Shadowed areas behind furniture still require manual wiping.",
        hoursPerWeek: scaledHours(8),
        hourlyCost,
      }),
    );

    jobs.push(
      makeHelperJob({
        id: "helper_air_purifier",
        robotType: "air_purifier",
        title: "Autonomous Air Quality & CO2 Purifier",
        fit: "good",
        score: 84,
        why: `Moves autonomously between busy ${spaceNoun} to reduce airborne particulates, odors, and CO2 buildup throughout the day.`,
        limits:
          "Cannot replace central HVAC exchange; requires clear floor paths and scheduled HEPA filter maintenance.",
        hoursPerWeek: scaledHours(6),
        hourlyCost,
      }),
    );

    jobs.push(
      makeHelperJob({
        id: "helper_vacuum_floor",
        robotType: "vacuum",
        title: "Scheduled Floor Sweeping & Mopping",
        fit: "good",
        score: 81,
        why: `Keeps open ${spaceNoun} clean between peak hours with automated sweeping, light mopping, and auto-empty docking.`,
        limits:
          "Limited by floor thresholds over 2 cm, loose equipment or cords, and heavy debris. Requires a dedicated docking outlet.",
        hoursPerWeek: scaledHours(7),
        hourlyCost,
      }),
    );

    if (family === "hotel") {
      jobs.push(
        makeHelperJob({
          id: "helper_security_patrol",
          robotType: "security_rover",
          title: "Night-Time Lobby & Corridor Patrol",
          fit: "partial",
          score: 66,
          why: "Runs scheduled overnight rounds across lobby entrances and corridors to check doors and flag unexpected motion alerts to night staff.",
          limits:
            "Single-floor monitoring and alerts only; cannot operate elevators, lock doors, or physically intervene.",
          hoursPerWeek: scaledHours(8),
          hourlyCost,
        }),
      );
      jobs.push(
        makeHelperJob({
          id: "helper_window_lobby",
          robotType: "window_cleaner",
          title: "Lobby Glass & Partition Cleaning",
          fit: "partial",
          score: 61,
          why: "Maintains streak-free entrance glass panels and interior lobby partitions on a set weekly schedule.",
          limits:
            "Needs flat glass panels, continuous power cord, and anchored safety tether; staff must relocate it between separate framed panes.",
          hoursPerWeek: scaledHours(3.5),
          hourlyCost,
        }),
      );
    } else if (family === "clinic") {
      jobs.push(
        makeHelperJob({
          id: "helper_tray_clinic",
          robotType: "tray_delivery",
          title: "Supply & Document Shuttle Delivery",
          fit: space.hasNarrowAisles ? "no" : "partial",
          score: space.hasNarrowAisles ? 20 : 60,
          why: space.hasNarrowAisles
            ? "Transporting sealed supplies between reception and rooms is repetitive, but narrow corridor clearances restrict wheeled bots."
            : "Transports sealed clinic supplies and lab folders between reception and waiting zones on enclosed trays.",
          limits: space.hasNarrowAisles
            ? "Marked Not Suitable: corridors are too narrow (needs ≥ 1.0 m clear aisles) and automatic door openers are required."
            : "Cannot open closed doors, climb thresholds, or handle sterile unsealed items; staff must load and unload.",
          hoursPerWeek: scaledHours(6),
          hourlyCost,
        }),
      );
    }
    return jobs;
  }

  // 3. Retail, Supermarket, Mall, Showroom
  if (
    family === "retail" ||
    family === "supermarket" ||
    family === "mall" ||
    family === "showroom"
  ) {
    if (family !== "showroom" || space.hasShelves) {
      jobs.push(
        makeHelperJob({
          id: "helper_shelf_scanner",
          robotType: "shelf_scanner",
          title: "Automated Shelf & Price-Tag Scanning",
          fit: "good",
          score: 89,
          why: "Patrols store aisles with a tall optical sensor mast to detect out-of-stock gaps, misplaced products, and mismatched price labels.",
          limits:
            "Optical scanning only — cannot restock shelves, straighten items, or see products hidden behind front-row packaging.",
          hoursPerWeek: scaledHours(10),
          hourlyCost,
        }),
      );
    }

    jobs.push(
      makeHelperJob({
        id: "helper_security_patrol",
        robotType: "security_rover",
        title: "After-Hours Facility Security Patrol",
        fit: "good",
        score: 82,
        why: "Performs overnight autonomous patrols along main aisles, entrances, and glass fronts to verify closed doors and send instant anomaly alerts.",
        limits:
          "Monitoring and alert rover only; cannot climb stairs, unlock/lock doors, or physically stop intruders.",
        hoursPerWeek: scaledHours(10),
        hourlyCost,
      }),
    );

    jobs.push(
      makeHelperJob({
        id: "helper_vacuum_floor",
        robotType: "vacuum",
        title: "After-Hours Aisle Floor Vacuum & Mop",
        fit: "good",
        score: 80,
        why: "Sweeps and mops wide retail aisles and entry areas overnight, returning automatically to its auto-empty dock.",
        limits:
          "Cannot navigate display pallets, floor cable covers over 2 cm, or spilled glass/packaging debris.",
        hoursPerWeek: scaledHours(8),
        hourlyCost,
      }),
    );

    jobs.push(
      makeHelperJob({
        id: "helper_window_storefront",
        robotType: "window_cleaner",
        title: "Storefront Window Cleaning",
        fit: "partial",
        score: 68,
        why: "Cleans large exterior-facing display windows to keep product showcases clear and smudge-free.",
        limits:
          "Requires flat glass, power cord reach, and safety tether attachment; must be moved manually across divided window frames.",
        hoursPerWeek: scaledHours(4),
        hourlyCost,
      }),
    );

    return jobs;
  }

  // 4. Event / University Hall, Office, Library, Museum, Terminal, Generic
  jobs.push(
    makeHelperJob({
      id: "helper_vacuum_floor",
      robotType: "vacuum",
      title: "Scheduled Hall & Floor Sweeping",
      fit: "good",
      score: 83,
      why: "Automates daily sweeping and light mopping across open hall walkways and lobby floors with an auto-empty dock.",
      limits:
        "Limited by raised thresholds (> 2 cm), loose cables, and cluttered seating rows; requires a docked charging corner.",
      hoursPerWeek: scaledHours(7),
      hourlyCost,
    }),
  );

  jobs.push(
    makeHelperJob({
      id: "helper_air_purifier",
      robotType: "air_purifier",
      title: "Mobile Air Quality & CO2 Purifier",
      fit: "good",
      score: 78,
      why: "Circulates between busy seating, waiting, and registration areas to keep air fresh and CO2 levels comfortable during high foot traffic.",
      limits:
        "Supplements HVAC systems only; needs unobstructed aisles and periodic HEPA filter replacement.",
      hoursPerWeek: scaledHours(5),
      hourlyCost,
    }),
  );

  jobs.push(
    makeHelperJob({
      id: "helper_security_patrol",
      robotType: "security_rover",
      title: "Night-Time Perimeter & Door Patrol",
      fit: "good",
      score: 76,
      why: "Patrols entrances, corridors, and shared zones after closing to check doors/windows and alert security to anomalies.",
      limits:
        "Single-floor autonomous patrol only; cannot open doors, climb stairs, or intervene physically.",
      hoursPerWeek: scaledHours(9),
      hourlyCost,
    }),
  );

  jobs.push(
    makeHelperJob({
      id: "helper_uvc_sterilization",
      robotType: "uvc_disinfection",
      title: "After-Hours UV-C Shared Space Sterilization",
      fit: "partial",
      score: 65,
      why: "Runs overnight UV-C disinfection cycles across shared tables, lounges, and waiting areas between busy days.",
      limits:
        "Strictly limited to empty rooms after closing hours (UV-C is hazardous to people); shaded surfaces still need manual wiping.",
      hoursPerWeek: scaledHours(6),
      hourlyCost,
    }),
  );

  jobs.push(
    makeHelperJob({
      id: "helper_window_glass",
      robotType: "window_cleaner",
      title: "Panoramic Window & Glass Cleaning",
      fit: "partial",
      score: 60,
      why: "Automates routine cleaning of tall entrance glass and interior glass partitions.",
      limits:
        "Requires flat glass panes, continuous power cord, and safety tether; staff must reposition the unit across separate window frames.",
      hoursPerWeek: scaledHours(3.5),
      hourlyCost,
    }),
  );

  return jobs;
}

/**
 * Ensures a JobsResult includes relevant optional helper robot jobs alongside
 * its primary Booster K1 jobs (idempotent: if helper jobs already exist, returns as-is).
 */
export function ensureHelperJobs(
  jobs: Job[],
  scene: Scene,
  businessType: string,
  hourlyCost = 8.5,
  hoursPerWeek = 60,
): Job[] {
  const hasHelpers = jobs.some((j) => isHelperRobot(inferRobotType(j)));
  if (hasHelpers) return jobs;
  const helpers = generateHelperRobotJobs(
    scene,
    businessType,
    hourlyCost,
    hoursPerWeek,
  );
  return [...jobs, ...helpers];
}

/**
 * Builds a smooth, scene-aware sequential Scenario for any of the 7 optional helper
 * robots using ONLY the 6 allowed actions (`walk_to`, `turn_to`, `wave`, `point_to`, `say`, `wait`).
 */
export function buildHelperRobotScenario(
  robotType: HelperRobotType,
  job: Job,
  scene: Scene,
): Scenario {
  const zones = scene.zones;
  const zoneIds = zones.map((z) => z.id);
  const label = shortLabel(job.title);

  if (zones.length === 0) {
    return {
      job_id: job.id,
      steps: finalizeSteps([{ action: "wait", seconds: 2 }], label),
    };
  }

  const pickZone = (re: RegExp, fallbackIdx = 0) =>
    zones.find((z) => re.test(`${z.id} ${z.label}`)) ??
    zones[fallbackIdx % zones.length];

  const z0 = zones[0];
  const z1 = zones[1] ?? z0;
  const z2 = zones[2] ?? z1;
  const z3 = zones[3] ?? z0;

  let rawSteps: ScenarioStep[];

  switch (robotType) {
    case "vacuum": {
      const openA = pickZone(/table|seat|lounge|aisle|floor|waiting/i, 0);
      const openB = pickZone(/entrance|corridor|walkway|hall/i, 1);
      const openC = pickZone(/counter|desk|reception|checkout/i, 2);
      rawSteps = [
        { action: "walk_to", target: openA.id, label: "Sweep floor zone" },
        { action: "wait", seconds: 1.8, label: "Sweep floor zone" },
        { action: "walk_to", target: openB.id, label: "Mop main walkway" },
        { action: "wait", seconds: 1.8, label: "Mop main walkway" },
        { action: "walk_to", target: openC.id, label: "Edge pass & dock" },
        { action: "turn_to", target: openA.id, label: "Edge pass & dock" },
        { action: "wait", seconds: 1.5, label: "Edge pass & dock" },
      ];
      break;
    }

    case "window_cleaner": {
      const glassA = pickZone(/entrance|window|display|promo|board/i, 0);
      const glassB = pickZone(/seating|table|lounge|waiting/i, 1);
      rawSteps = [
        { action: "walk_to", target: glassA.id, label: "Clean front glass" },
        { action: "wait", seconds: 2.2, label: "Clean front glass" },
        { action: "walk_to", target: glassB.id, label: "Clean side pane" },
        { action: "wait", seconds: 2.2, label: "Clean side pane" },
        { action: "walk_to", target: glassA.id, label: "Complete glass pass" },
        { action: "wait", seconds: 1.4, label: "Complete glass pass" },
      ];
      break;
    }

    case "tray_delivery": {
      const counter = pickZone(/counter|bar|desk|reception|checkout/i, 0);
      const tables = pickZone(/table|seat|lounge|waiting|room/i, 1);
      rawSteps = [
        { action: "walk_to", target: counter.id, label: "Load tray at counter" },
        { action: "wait", seconds: 1.6, label: "Load tray at counter" },
        { action: "walk_to", target: tables.id, label: "Deliver to seating" },
        { action: "turn_to", target: counter.id, label: "Deliver to seating" },
        { action: "wait", seconds: 2.0, label: "Deliver to seating" },
        { action: "walk_to", target: counter.id, label: "Return cleared trays" },
        { action: "wait", seconds: 1.2, label: "Return cleared trays" },
      ];
      break;
    }

    case "uvc_disinfection": {
      const zoneA = pickZone(/waiting|lounge|seat|table/i, 0);
      const zoneB = pickZone(/counter|desk|reception/i, 1);
      const zoneC = pickZone(/entrance|corridor/i, 2);
      rawSteps = [
        { action: "walk_to", target: zoneA.id, label: "UV-C cycle zone 1" },
        { action: "wait", seconds: 2.2, label: "UV-C cycle zone 1" },
        { action: "walk_to", target: zoneB.id, label: "UV-C cycle zone 2" },
        { action: "wait", seconds: 2.2, label: "UV-C cycle zone 2" },
        { action: "walk_to", target: zoneC.id, label: "UV-C exit sweep" },
        { action: "wait", seconds: 1.8, label: "UV-C exit sweep" },
      ];
      break;
    }

    case "shelf_scanner": {
      const shelfA = pickZone(/shelf|shelves|aisle|rack|display/i, 0);
      const shelfB = pickZone(/promo|board|display|product/i, 1);
      const checkout = pickZone(/checkout|counter|entrance/i, 2);
      rawSteps = [
        { action: "walk_to", target: shelfA.id, label: "Scan main shelves" },
        { action: "turn_to", target: shelfB.id, label: "Scan main shelves" },
        { action: "wait", seconds: 2.0, label: "Scan main shelves" },
        { action: "walk_to", target: shelfB.id, label: "Verify price tags" },
        { action: "wait", seconds: 2.0, label: "Verify price tags" },
        { action: "walk_to", target: checkout.id, label: "Sync stock report" },
        { action: "wait", seconds: 1.4, label: "Sync stock report" },
      ];
      break;
    }

    case "air_purifier": {
      const busyA = pickZone(/table|seat|lounge|waiting/i, 0);
      const busyB = pickZone(/counter|desk|reception|bar/i, 1);
      const busyC = pickZone(/entrance|hall|corridor/i, 2);
      rawSteps = [
        { action: "walk_to", target: busyA.id, label: "Purify seating air" },
        { action: "wait", seconds: 2.0, label: "Purify seating air" },
        { action: "walk_to", target: busyB.id, label: "Filter counter zone" },
        { action: "wait", seconds: 2.0, label: "Filter counter zone" },
        { action: "walk_to", target: busyC.id, label: "Balance entry airflow" },
        { action: "wait", seconds: 1.5, label: "Balance entry airflow" },
      ];
      break;
    }

    case "security_rover": {
      const entry = pickZone(/entrance|door|lobby/i, 0);
      const mid = z1.id === entry.id ? z2 : z1;
      const far = z3.id === mid.id ? z0 : z3;
      rawSteps = [
        { action: "walk_to", target: entry.id, label: "Inspect main entry" },
        { action: "turn_to", target: mid.id, label: "Inspect main entry" },
        { action: "wait", seconds: 1.8, label: "Inspect main entry" },
        { action: "walk_to", target: mid.id, label: "Patrol interior zone" },
        { action: "turn_to", target: far.id, label: "Patrol interior zone" },
        { action: "wait", seconds: 1.8, label: "Patrol interior zone" },
        { action: "walk_to", target: far.id, label: "Verify perimeter" },
        { action: "wait", seconds: 1.5, label: "Verify perimeter" },
      ];
      break;
    }
  }

  return {
    job_id: job.id,
    steps: finalizeSteps(filterValidSteps(rawSteps, zoneIds), label),
  };
}
