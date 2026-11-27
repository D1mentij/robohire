import {
  filterValidSteps,
  isRobotType,
  type Fit,
  type Job,
  type RobotCategory,
  type RobotType,
  type Scenario,
  type ScenarioStep,
  type Scene,
} from "@/types/contracts";
import {
  LATVIA_2026_LABOR_BENCHMARKS,
  ROBOTS_BY_ID,
  shiftsFromHours,
  ROBOTS_CATALOG_LIST,
  type CommercialRobotSpec,
} from "@/src/data/robots";
import { detectBusiness, type BusinessKind } from "@/lib/ai/businessTemplates";
import { finalizeSteps, shortLabel } from "@/lib/ai/labels";
import {
  combineFit,
  computeRobotEconomics,
  daysOpenFromHours,
  economicFit,
  operatingHoursPerDay,
} from "@/lib/roi/economics";

export * from "@/src/data/robots";

export type CategoryFilterId = "all" | RobotCategory;

export interface CategoryFilterOption {
  id: CategoryFilterId;
  label: string;
}

export const ROBOT_CATEGORY_FILTERS: readonly CategoryFilterOption[] = [
  { id: "all", label: "All (15)" },
  { id: "HoReCa Delivery", label: "HoReCa Delivery" },
  { id: "Greeting & Retail", label: "Greeting & Retail" },
  { id: "Hotel & Office Delivery", label: "Hotel & Office" },
  { id: "Commercial Cleaning", label: "Commercial Cleaning" },
  { id: "Industrial Cleaning", label: "Industrial Cleaning" },
  { id: "Warehouse & Factory AMR", label: "Warehouse & Factory" },
  { id: "General Service & Reception", label: "General Service" },
] as const;

export function getRobotSpec(type?: string | null): CommercialRobotSpec {
  if (type && isRobotType(type)) {
    return ROBOTS_BY_ID[type];
  }
  return ROBOTS_BY_ID.keenon_t8;
}

export function inferRobotType(
  job: Pick<Job, "id" | "robot_type" | "title">,
): RobotType {
  if (job.robot_type && isRobotType(job.robot_type)) {
    return job.robot_type;
  }
  const text = `${job.id} ${job.title}`.toLowerCase();
  for (const r of ROBOTS_CATALOG_LIST) {
    if (
      text.includes(r.id) ||
      text.includes(r.shortName.toLowerCase().replace(/\s+/g, "_")) ||
      text.includes(r.name.toLowerCase())
    ) {
      return r.id;
    }
  }
  if (/warehouse|pallet|amr|dock/i.test(text)) return "pudu_t300";
  if (/hotel|elevator|room|courier/i.test(text)) return "pudu_flashbot";
  if (/scrub|concourse|mall/i.test(text)) return "pudu_cc1_pro";
  if (/clean|vacuum|mop|sweep/i.test(text)) return "lionsbot_r3_vac";
  if (/greet|welcom|menu|wayfind|reception|guide/i.test(text)) {
    return "pudu_kettybot_pro";
  }
  return "keenon_t8";
}

export interface SpatialProfile {
  areaSqm: number;
  estimatedAisleCm: number;
  hasNarrowAislesUnder65Cm: boolean;
  hasElevatorOrMultiFloor: boolean;
  hasWarehouseCorridors: boolean;
  isLargeVenue: boolean;
}

/**
 * Estimates spatial clearances, corridor widths, and multi-floor/elevator traits
 * from the 3D Scene geometry and business type description.
 */
export function analyzeSpaceProfile(
  scene: Scene,
  businessType: string,
): SpatialProfile {
  const bt = businessType.toLowerCase();
  const zoneText = scene.zones.map((z) => `${z.id} ${z.label}`).join(" ").toLowerCase();
  const areaSqm = Math.max(12, Math.round(scene.room.width * scene.room.depth));
  const occupied = scene.zones.reduce((sum, z) => sum + z.w * z.d, 0);
  const freeRatio = Math.max(0.1, 1 - occupied / areaSqm);

  const explicitNarrow =
    /narrow|tight|55\s*cm|small\s*caf[eé]|bistro/i.test(bt) ||
    /narrow/i.test(zoneText);
  const explicitWarehouse =
    /warehouse|distribution|logistics|factory|manufactur|plant|pallet/i.test(bt) ||
    /pallet|loading|dock|rack|assembly|inbound|outbound/i.test(zoneText);
  const explicitLarge =
    /mall|airport|terminal|hypermarket|24\/7|distribution|logistics|factory|supermarket|expo/i.test(
      bt,
    ) || areaSqm >= 180;
  const explicitMultiFloor =
    /multi-floor|hotel|resort|tower|hospital|clinic|office/i.test(bt) ||
    /elevator|lift/i.test(zoneText);

  let estimatedAisleCm = 90;
  if (explicitNarrow) {
    estimatedAisleCm = 58;
  } else if (explicitWarehouse) {
    estimatedAisleCm = areaSqm >= 140 ? 165 : 125;
  } else if (explicitLarge) {
    estimatedAisleCm = 180;
  } else if (areaSqm <= 56 || freeRatio < 0.36) {
    estimatedAisleCm = 62;
  } else if (areaSqm <= 90) {
    estimatedAisleCm = 78;
  } else {
    estimatedAisleCm = 105;
  }

  return {
    areaSqm,
    estimatedAisleCm,
    hasNarrowAislesUnder65Cm: estimatedAisleCm < 65,
    hasElevatorOrMultiFloor: explicitMultiFloor,
    hasWarehouseCorridors: explicitWarehouse,
    isLargeVenue: explicitLarge,
  };
}

interface FitEvaluation {
  title: string;
  fit: Fit;
  score: number;
  why: string;
  limits: string;
}

function evaluateSpatialFit(
  robot: CommercialRobotSpec,
  family: BusinessKind,
  space: SpatialProfile,
  businessType: string,
): FitEvaluation {
  const isHoReCa =
    family === "cafe" || family === "restaurant" || family === "bar";
  const isHotel = family === "hotel";
  const isOfficeOrClinic = family === "office" || family === "clinic";
  const isRetailOrShowroom =
    family === "retail" || family === "showroom" || family === "supermarket";
  const isMallOrTerminal =
    family === "mall" ||
    family === "terminal" ||
    family === "event" ||
    family === "university" ||
    family === "museum";
  const isWarehouseOrFactory =
    family === "warehouse" ||
    family === "factory" ||
    space.hasWarehouseCorridors;
  const isGym = family === "gym";

  switch (robot.id) {
    case "keenon_t8": {
      if (isHoReCa && space.hasNarrowAislesUnder65Cm) {
        return {
          title: "Narrow-Aisle Table Delivery & Bussing (55 cm)",
          fit: "good",
          score: 96,
          why: `Key narrow-aisle benchmark: compact ~34 kg chassis clears 55 cm passages (your space est. ~${space.estimatedAisleCm} cm), shuttling 3 trays (20 kg) between counter and tight café tables.`,
          limits:
            "20 kg max total payload across 3 open trays; staff or guests still place and lift cups/plates manually, and floor steps >15 mm block travel.",
        };
      }
      if (isHoReCa) {
        return {
          title: "Agile Drink & Pastry Runner",
          fit: "good",
          score: 86,
          why: "Ultra-agile 55 cm width weaves effortlessly around busy dining chairs and servers while carrying 3 trays up to 20 kg.",
          limits:
            "Smaller 20 kg payload and tray area than BellaBot or Keenon T10 for heavy multi-course banquet platters.",
        };
      }
      if (isHotel || isOfficeOrClinic) {
        return {
          title: "Compact Lounge Refreshment Runner",
          fit: "partial",
          score: 58,
          why: "Can shuttle coffee and light refreshments across single-floor lounge or waiting areas with tight 55 cm clearances.",
          limits:
            "Open trays lack privacy locks and autonomous elevator calling for multi-floor room or office parcel delivery.",
        };
      }
      return {
        title: robot.defaultJobTitle,
        fit: "no",
        score: 18,
        why: `Built specifically for HoReCa table food/drink running rather than ${businessType} operations.`,
        limits:
          "Open 20 kg hospitality trays are not designed for retail aisles, industrial scrubbing, or pallet logistics.",
      };
    }

    case "bear_servi": {
      if (isHoReCa && space.hasNarrowAislesUnder65Cm) {
        return {
          title: "Main-Lane Order Runner & Dish Busser",
          fit: "partial",
          score: 60,
          why: "44.5 × 43 cm footprint with 2 trays + dedicated dirty-dish bussing tub handles counter-to-pass runs up to 30 kg.",
          limits: `Downgraded to Partial: requires ~65 cm minimum aisle clearance, restricting access between tightly spaced ~${space.estimatedAisleCm} cm café tables (Keenon T8 clears 55 cm).`,
        };
      }
      if (isHoReCa || isHotel) {
        return {
          title: "Food Runner & Dirty-Dish Bussing Return",
          fit: "good",
          score: isHoReCa ? 92 : 76,
          why: "Purpose-built 2 trays + deep bussing tub (30 kg payload) automates both outbound food delivery and inbound dish clearing.",
          limits:
            "Requires ≥65 cm clear aisle width and flat indoor flooring; staff load and unload dishes at the table and dish-pit.",
        };
      }
      return {
        title: robot.defaultJobTitle,
        fit: "no",
        score: 16,
        why: `Hospitality tray-and-bussing robot does not match core workflows in ${businessType}.`,
        limits:
          "Open restaurant trays and 30 kg capacity cannot perform cleaning, reception telepresence, or heavy logistics.",
      };
    }

    case "pudu_bellabot": {
      if (isHoReCa && space.hasNarrowAislesUnder65Cm) {
        return {
          title: "4-Tray Restaurant Delivery Runner",
          fit: "no",
          score: 24,
          why: "High-capacity 4-tray (40 kg) waiter bot is an industry leader for spacious dining rooms, but its chassis is too wide here.",
          limits: `Marked Not Suitable: requires ~70 cm minimum aisle width, exceeding this café's narrow ~${space.estimatedAisleCm} cm table clearances (use Keenon T8 at 55 cm).`,
        };
      }
      if (isHoReCa) {
        return {
          title: "4-Tray High-Capacity Table Delivery",
          fit: "good",
          score: 95,
          why: "4 ergonomic trays with up to 40 kg payload serve multiple tables per trip in ≥70 cm aisles, cutting waiter walking by 60–75%.",
          limits:
            "Needs ≥70 cm unobstructed dining aisles and flat thresholds; human servers still greet tables and plate dishes.",
        };
      }
      if (isHotel || isRetailOrShowroom) {
        return {
          title: "Hospitality Dining & Promo Tray Runner",
          fit: "partial",
          score: 64,
          why: "Supports hotel breakfast dining or showroom hospitality sampling with 40 kg capacity and optional elevator integration.",
          limits:
            "Open trays are unsealed (unlike FlashBot/Keenon W3 for guest rooms); requires ≥70 cm clear pathways.",
        };
      }
      return {
        title: robot.defaultJobTitle,
        fit: "no",
        score: 17,
        why: `Open 4-tray restaurant runner is mismatched for ${businessType}.`,
        limits:
          "Requires ≥70 cm smooth indoor hospitality aisles; unsuitable for floor scrubbing or heavy warehouse pallets.",
      };
    }

    case "keenon_t10": {
      if (isHoReCa && space.hasNarrowAislesUnder65Cm) {
        return {
          title: "Large-Format Multi-Tray Delivery",
          fit: "no",
          score: 18,
          why: "Built for large banquet halls and wide food courts, not compact narrow-aisle bistros.",
          limits: `Marked Not Suitable: requires ~75 cm minimum aisle clearance vs ~${space.estimatedAisleCm} cm available between tables.`,
        };
      }
      if (isHoReCa) {
        return {
          title: "High-Capacity Food Hall & Banquet Runner",
          fit: space.estimatedAisleCm >= 75 ? "good" : "partial",
          score: space.estimatedAisleCm >= 75 ? 89 : 63,
          why: "High-capacity multi-tray chassis moves heavy banquet orders and bussing loads across mid-to-large dining floors.",
          limits:
            "Requires ≥75 cm wide main aisles and generous turning radius around dining booths.",
        };
      }
      return {
        title: robot.defaultJobTitle,
        fit: "no",
        score: 15,
        why: `Large restaurant tray bot is not needed in ${businessType}.`,
        limits:
          "Requires ≥75 cm dining aisles and serves open food trays only.",
      };
    }

    case "pudu_kettybot_pro": {
      if (isWarehouseOrFactory) {
        return {
          title: "Visitor Reception & Ad-Screen Greeter",
          fit: "no",
          score: 20,
          why: "Front-of-house retail/hospitality greeter is not engineered for industrial forklift and pallet zones.",
          limits:
            "Not rated for industrial warehouse traffic, dock plates, or heavy dust environments.",
        };
      }
      const topVenue =
        isHoReCa || isRetailOrShowroom || isHotel || isMallOrTerminal;
      return {
        title: "Entrance Greeter, Ad-Screen & Guest Escort",
        fit: topVenue ? "good" : "partial",
        score: isRetailOrShowroom
          ? 93
          : isHoReCa
            ? 88
            : isHotel || isMallOrTerminal
              ? 87
              : 70,
        why: "Welcomes visitors at the entrance, displays live promotions on its front ad screen, and escorts guests through 55 cm aisles.",
        limits:
          "Compact 55 cm frame handles greeting, escorting, and light sampling only — cannot process payments, open doors, or lift luggage.",
      };
    }

    case "temi": {
      if (isWarehouseOrFactory) {
        return {
          title: "Remote Supervisor Telepresence Unit",
          fit: "partial",
          score: 52,
          why: "Enables remote engineers or managers to inspect clean office/QA corridors via live video-call telepresence.",
          limits:
            "Light indoor wheels (55 cm width) cannot cross >10 mm dock thresholds or operate in active pallet-jack lanes.",
        };
      }
      return {
        title: "Guest Reception, Wayfinding & Video Telepresence",
        fit:
          isOfficeOrClinic || isHotel || isRetailOrShowroom || isMallOrTerminal
            ? "good"
            : "partial",
        score: isOfficeOrClinic
          ? 93
          : isHotel || isRetailOrShowroom
            ? 88
            : isMallOrTerminal || isGym
              ? 83
              : 74,
        why: `Most affordable unit in catalog (€${robot.rentEurMonth}/mo rent, estimate): greets visitors, answers FAQs on its tilt tablet, guides guests, and connects live remote receptionists.`,
        limits:
          "Zero physical payload capacity — strictly communication, wayfinding, and telepresence in ≥55 cm smooth indoor corridors.",
      };
    }

    case "pudu_flashbot": {
      if (isHotel || isOfficeOrClinic) {
        const hasLiftCue = space.hasElevatorOrMultiFloor;
        return {
          title: "Autonomous Multi-Floor Room & Parcel Delivery",
          fit: hasLiftCue ? "good" : "partial",
          score: hasLiftCue ? 94 : 68,
          why: "Hygienic enclosed compartments deliver room-service amenities, confidential documents, or clinic samples across floors autonomously.",
          limits:
            "Requires elevator IoT controller integration, ≥75–80 cm automatic/accessible corridor doors, and flat floor thresholds (≤15 mm).",
        };
      }
      return {
        title: robot.defaultJobTitle,
        fit: "no",
        score: 19,
        why: `Enclosed multi-floor elevator courier is engineered for hotels, hospitals, and office towers rather than ${businessType}.`,
        limits:
          "Requires multi-floor elevator integration, badge/door automation, and ≥70 cm corridors.",
      };
    }

    case "keenon_w3": {
      if (isHotel || isOfficeOrClinic) {
        return {
          title: "4-Compartment Multi-Floor Butler Courier",
          fit: isHotel ? "good" : "partial",
          score: isHotel ? 90 : 66,
          why: "4 ventilated enclosed compartments batch multiple guest-room orders or inter-floor office deliveries in a single elevator trip.",
          limits:
            "Requires elevator integration module, ≥80 cm door widths (75 cm min corridor), and low floor thresholds (≤15 mm).",
        };
      }
      return {
        title: robot.defaultJobTitle,
        fit: "no",
        score: 16,
        why: `High-capacity multi-floor hotel ButlerBot exceeds single-floor needs in ${businessType}.`,
        limits:
          "Requires elevator integration, automatic fire/corridor doors, and low thresholds.",
      };
    }

    case "lionsbot_r3_vac": {
      if (space.hasNarrowAislesUnder65Cm) {
        return {
          title: "After-Hours Compact Floor Vacuuming",
          fit: "partial",
          score: 65,
          why: "Compact 60 cm commercial vacuum automates dry floor sweeping along the main counter and entrance lanes after closing.",
          limits: `Tightly packed ~${space.estimatedAisleCm} cm café chairs must be stacked or pulled out so the 60 cm chassis can reach under tables; max 15 mm thresholds.`,
        };
      }
      return {
        title: "Scheduled Commercial Floor Vacuuming",
        fit: space.isLargeVenue ? "partial" : "good",
        score:
          isGym || isHotel || isRetailOrShowroom || isOfficeOrClinic
            ? 87
            : isHoReCa
              ? 83
              : isWarehouseOrFactory
                ? 74
                : 68,
        why: "Accessible commercial dry vacuum keeps lobbies, carpets, gym floors, dining halls, and packing zones dust-free automatically.",
        limits:
          "Dry vacuuming only (no wet scrubbing for greasy spills); limited by >15 mm floor thresholds, loose cords, and massive >5,000 m² concourses.",
      };
    }

    case "pudu_cc1": {
      if (space.hasNarrowAislesUnder65Cm) {
        return {
          title: "4-in-1 Commercial Floor Scrubber",
          fit: "no",
          score: 23,
          why: "4-in-1 wet scrubber & vacuum (~743 m²/hr) is oversized for cramped ~55 cm bistro seating layouts.",
          limits: `Marked Not Suitable: needs ≥70 cm clear lanes and open turning space; narrow ~${space.estimatedAisleCm} cm café aisles block autonomous scrubbing passes.`,
        };
      }
      return {
        title: "4-in-1 Sweeping, Scrubbing, Vacuuming & Mopping",
        fit: "good",
        score:
          isHotel || isRetailOrShowroom || isGym || isHoReCa
            ? 86
            : isMallOrTerminal || isOfficeOrClinic
              ? 80
              : 72,
        why: "Combines sweeping, wet scrubbing, vacuuming, and mopping at ~743 m²/hr across both hard tile/concrete floors and low-pile carpet.",
        limits:
          "Requires ≥70 cm aisle clearance, ≤15 mm floor thresholds, and water refill/drain station access (or manual tank service).",
      };
    }

    case "pudu_cc1_pro": {
      if (space.isLargeVenue || isMallOrTerminal || isWarehouseOrFactory) {
        return {
          title: "AI-Camera Large Venue Scrubbing (5,000–8,000 m²)",
          fit: "good",
          score: isMallOrTerminal ? 95 : 85,
          why: "Dual front & rear AI perception cameras safely scrub 5,000–8,000 m² shopping malls, airport terminals, lobbies, and clean warehouse aisles.",
          limits:
            "Requires ≥75 cm pathways, flat ≤15 mm transitions, and scheduled clean/dirty water docking.",
        };
      }
      if (space.hasNarrowAislesUnder65Cm) {
        return {
          title: "Large-Venue AI Floor Scrubber",
          fit: "no",
          score: 17,
          why: "Engineered for 5,000–8,000 m² malls and terminals, not small narrow-aisle venues.",
          limits:
            "Oversized footprint (≥75 cm aisle min) and excess capacity for compact venues.",
        };
      }
      return {
        title: "Extended-Area AI Floor Scrubbing",
        fit: "partial",
        score: 60,
        why: "Front & rear AI obstacle avoidance handles busy lobbies and showrooms reliably, even if total floor area is below its 5,000 m² peak capacity.",
        limits:
          `Built for 5,000–8,000 m² facilities — smaller venues get faster ROI from LionsBot R3 Vac (€${ROBOTS_BY_ID.lionsbot_r3_vac.rentEurMonth}/mo) or standard Pudu CC1 (€${ROBOTS_BY_ID.pudu_cc1.rentEurMonth}/mo).`,
      };
    }

    case "avidbots_neo_2": {
      if (space.isLargeVenue || isMallOrTerminal || isWarehouseOrFactory) {
        return {
          title: "No-Route-Training Autonomous Industrial Scrubbing",
          fit: "good",
          score: 92,
          why: "Fully autonomous industrial scrubber cleans vast airport concourses, shopping malls, and distribution centers dynamically without manual route teaching.",
          limits:
            "Requires ≥120 cm wide corridors, industrial water/drain bay, and very large floor areas on 2–3 shifts to pay back.",
        };
      }
      return {
        title: robot.defaultJobTitle,
        fit: "no",
        score: 14,
        why: `Heavy industrial scrubber (€${robot.rentEurMonth.toLocaleString("en-US")}/mo rent) is physically and economically oversized for ${businessType} (~${space.areaSqm} m²).`,
        limits:
          "Requires ≥120 cm industrial aisles, large open floor plates, and 2–3 shifts on very large floors.",
      };
    }

    case "gausium_scrubber_75p": {
      if (space.isLargeVenue || isMallOrTerminal || isWarehouseOrFactory) {
        return {
          title: "Heavy-Duty 24/7 Concourse & Logistics Scrubbing",
          fit: "good",
          score: 89,
          why: "Heavy-duty 75 cm scrub deck tackles tire marks, grease, and high-traffic grime across hypermarkets, airports, and massive logistics hubs.",
          limits:
            "Requires ≥130 cm wide aisles, heavy-duty water dump station, and very large floor areas on 2–3 shifts to pay back.",
        };
      }
      return {
        title: robot.defaultJobTitle,
        fit: "no",
        score: 12,
        why: `Flagship heavy industrial scrubber (€${robot.rentEurMonth.toLocaleString("en-US")}/mo rent) is far too large for ${businessType}.`,
        limits:
          "Built strictly for airports, hypermarkets, and massive warehouses running 2–3 shifts.",
      };
    }

    case "pudu_t300": {
      if (isWarehouseOrFactory) {
        return {
          title: "300 kg Trackless Pallet, Cage & Material Transport",
          fit: space.estimatedAisleCm >= 90 ? "good" : "partial",
          score: space.estimatedAisleCm >= 90 ? 95 : 64,
          why: "Visual-SLAM + LiDAR industrial AMR hauls up to 300 kg cages, carts, and sub-assemblies across warehouse and factory lanes with zero magnetic tape.",
          limits:
            "Requires ≥90 cm clear logistics aisles, ≤20 mm floor threshold/gap tolerance, and manual/forklift loading onto deck or towing hitch.",
        };
      }
      if (isRetailOrShowroom || isMallOrTerminal) {
        return {
          title: "Back-of-House Heavy Stock & Cart Shuttle",
          fit: space.estimatedAisleCm >= 90 ? "partial" : "no",
          score: space.estimatedAisleCm >= 90 ? 56 : 19,
          why: "Can shuttle heavy restock cages (up to 300 kg) along wide backroom corridors between receiving docks and sales floors.",
          limits:
            "Industrial AMR chassis requires ≥90 cm separated service corridors and ≤20 mm thresholds; cannot place items onto retail shelves.",
        };
      }
      return {
        title: robot.defaultJobTitle,
        fit: "no",
        score: 15,
        why: `300 kg industrial material-handling AMR is not suited for guest-facing ${businessType} interiors.`,
        limits:
          "Requires ≥90 cm industrial corridors, flat ≤20 mm concrete/tile transitions, and pallet/cage workflows.",
      };
    }

    case "mir250": {
      if (isWarehouseOrFactory) {
        const stdOk = space.estimatedAisleCm >= 145;
        const minOk = space.estimatedAisleCm >= 85;
        if (!minOk) {
          return {
            title: "Autonomous Intralogistics AMR (250 kg)",
            fit: "no",
            score: 21,
            why: "250 kg industrial AMR automates line-side kitting and warehouse dock-to-rack transport, but corridors here are below minimum spec.",
            limits: `Marked Not Suitable: corridor (~${space.estimatedAisleCm * 10} mm) is narrower than MiR250's 850 mm minimum (1,450 mm standard corridor width) and 20 mm max threshold tolerance.`,
          };
        }
        return {
          title: "250 kg Line-Side & Warehouse Corridor AMR",
          fit: stdOk ? "good" : "partial",
          score: stdOk ? 93 : 68,
          why: stdOk
            ? `Low-profile 800 × 580 × 300 mm AMR carries 250 kg payloads smoothly through ≥1,450 mm standard warehouse corridors (est. ~${space.estimatedAisleCm * 10} mm).`
            : `Clears MiR250's 850 mm minimum single-lane passage (est. ~${space.estimatedAisleCm * 10} mm) for 250 kg autonomous material runs.`,
          limits: stdOk
            ? "Strict simulation & safety specs: 1,450 mm standard corridor width (850 mm minimum), ≤20 mm max floor threshold/expansion-joint gap tolerance."
            : "Corridor is between 850 mm minimum and 1,450 mm standard width — restrict to one-way AMR traffic and enforce ≤20 mm max threshold/gap tolerance.",
        };
      }
      return {
        title: robot.defaultJobTitle,
        fit: "no",
        score: 14,
        why: `Enterprise intralogistics AMR (€${robot.rentEurMonth.toLocaleString("en-US")}/mo rent) is built for factories and distribution centers, not ${businessType}.`,
        limits:
          "Requires 1,450 mm standard industrial corridors (850 mm min), ≤20 mm max threshold/gap tolerance, and top-module/cart integration.",
      };
    }
  }
}

/**
 * Evaluates ALL 15 commercial robots against the target space, business preset/type,
 * operating hours, and Latvia 2026 multi-shift employer labor costs.
 * Economics = hours freed per day (lib/roi/economics.ts), rent vs buy.
 * Fit = worse of spatial fit and economic fit.
 */
export function evaluateCatalogForSpace(opts: {
  scene: Scene;
  businessType: string;
  hoursPerWeek?: number;
  hourlyCost?: number;
  shiftsOverride?: 1 | 2 | 3 | null;
  baselineHourlyCost?: number | null;
}): Job[] {
  const hoursPerWeek =
    opts.hoursPerWeek && opts.hoursPerWeek > 0 ? opts.hoursPerWeek : 60;
  const family = detectBusiness(
    opts.businessType,
    opts.scene.zones.map((z) => z.label),
  );
  const space = analyzeSpaceProfile(opts.scene, opts.businessType);

  const baselineHourly =
    opts.baselineHourlyCost && opts.baselineHourlyCost > 0
      ? opts.baselineHourlyCost
      : null;
  const hourlyCostOverrideRatio =
    opts.hourlyCost &&
    opts.hourlyCost > 0 &&
    baselineHourly &&
    Math.abs(opts.hourlyCost - baselineHourly) > 0.05
      ? opts.hourlyCost / baselineHourly
      : 1;

  const shiftsCount = opts.shiftsOverride ?? shiftsFromHours(hoursPerWeek);
  const daysOpenPerWeek = daysOpenFromHours(hoursPerWeek);
  const openingHoursPerDay = operatingHoursPerDay(hoursPerWeek, shiftsCount);
  const ratio =
    Number.isFinite(hourlyCostOverrideRatio) &&
    hourlyCostOverrideRatio > 0 &&
    Math.abs(hourlyCostOverrideRatio - 1) > 0.015
      ? hourlyCostOverrideRatio
      : 1;
  const eur = (n: number) => `€${Math.round(n).toLocaleString("en-US")}`;
  const h1 = (n: number) => (Math.round(n * 10) / 10).toString();

  const evaluated: Job[] = ROBOTS_CATALOG_LIST.map((robot) => {
    const econ = computeRobotEconomics(robot, opts.scene, {
      shifts: shiftsCount,
      daysOpenPerWeek,
      openingHoursPerDay,
      roleHourlyEur:
        LATVIA_2026_LABOR_BENCHMARKS[robot.role].hourlyEmployerEur * ratio,
    });

    const spatial = evaluateSpatialFit(
      robot,
      family,
      space,
      opts.businessType || "this venue",
    );

    const econFit = economicFit(econ);
    const fit: Fit = combineFit(spatial.fit, econFit);
    let score = spatial.score;
    let limits = spatial.limits;
    const pbExp = econ.payback_months.expected;
    const shiftWord = shiftsCount === 1 ? "1 shift" : `${shiftsCount} shifts`;

    if (econFit === "no") {
      score = Math.min(score, 22);
      const econReason = `Doesn't pay off on ${shiftWord}: frees ~${h1(econ.hours_freed_per_day.expected)} h/day of staff time (${eur(econ.savings_eur_month.expected)}/mo) vs ${eur(econ.rent_eur_month)}/mo rent; buying (${eur(econ.purchase_price_eur)}) ${pbExp === null ? "never pays back" : `pays back in ~${Math.round(pbExp)} months`}.`;
      limits = spatial.fit === "no" ? `${econReason} ${spatial.limits}` : econReason;
    } else if (econFit === "partial" && pbExp !== null) {
      score = Math.min(score, 70);
      limits = `${spatial.limits} Slow buy payback (~${Math.round(pbExp)} months).`;
    }

    const savingsExp = econ.savings_eur_month.expected;
    const netRentExp = econ.net_rent_eur_month.expected;

    return {
      id: `job_${robot.id}`,
      title: `${robot.name} — ${spatial.title}`,
      fit,
      score,
      why: spatial.why,
      limits,
      hours_per_week:
        Math.round(econ.hours_freed_per_day.expected * daysOpenPerWeek * 10) / 10,
      savings_eur_month: Math.round(savingsExp),
      payback_months:
        fit === "no" || pbExp === null ? null : Math.round(pbExp * 10) / 10,
      robot_type: robot.id,
      robot_name: robot.name,
      category: robot.category,
      role: robot.role,
      purchase_price_eur: robot.purchasePriceEur,
      base_raas_eur: robot.baseRaaSEur,
      client_raas_eur: robot.rentEurMonth,
      monthly_commission_eur: robot.monthlyCommissionEur,
      sale_commission_eur: robot.saleCommissionEur,
      // Value of the staff hours the robot frees (NOT a whole shift).
      human_monthly_cost_eur: Math.round(savingsExp),
      savings_pct:
        savingsExp > 0
          ? Math.round((netRentExp / savingsExp) * 1000) / 10
          : -100,
      shifts_count: shiftsCount,
      economics: econ,
    };
  });

  return evaluated.sort((a, b) => {
    const rankFit = (f: Fit) => (f === "good" ? 2 : f === "partial" ? 1 : 0);
    if (rankFit(b.fit) !== rankFit(a.fit)) {
      return rankFit(b.fit) - rankFit(a.fit);
    }
    return b.score - a.score || b.savings_eur_month - a.savings_eur_month;
  });
}

/**
 * Recomputes Latvia 2026 labor & RaaS brokerage numbers on an existing job list
 * when shift count or hourly rate changes, or upgrades raw task-level jobs into the
 * 15-robot commercial catalog evaluation.
 */
export function ensureCommercialCatalogJobs(opts: {
  jobs: Job[];
  scene: Scene;
  businessType: string;
  hoursPerWeek?: number;
  hourlyCost?: number;
  shiftsOverride?: 1 | 2 | 3 | null;
  baselineHourlyCost?: number | null;
}): Job[] {
  return evaluateCatalogForSpace({
    scene: opts.scene,
    businessType: opts.businessType,
    hoursPerWeek: opts.hoursPerWeek,
    hourlyCost: opts.hourlyCost,
    shiftsOverride: opts.shiftsOverride,
    baselineHourlyCost: opts.baselineHourlyCost,
  });
}

/**
 * Builds a realistic sequential 3D simulation scenario for any of the 15 commercial
 * robots using ONLY the 6 allowed actions (`walk_to`, `turn_to`, `wave`, `point_to`, `say`, `wait`).
 */
export function buildRobotScenario(
  robotType: RobotType,
  job: Job,
  scene: Scene,
): Scenario {
  const spec = getRobotSpec(robotType);
  const zones = scene.zones;
  const zoneIds = zones.map((z) => z.id);
  const fallbackLabel = shortLabel(spec.shortName);

  if (zones.length === 0) {
    return {
      job_id: job.id,
      steps: finalizeSteps([{ action: "wait", seconds: 2 }], fallbackLabel),
    };
  }

  const pickZone = (re: RegExp, fallbackIdx = 0) =>
    zones.find((z) => re.test(`${z.id} ${z.label}`)) ??
    zones[fallbackIdx % zones.length];

  let rawSteps: ScenarioStep[];

  switch (spec.archetype) {
    case "tray_waiter": {
      const passZone = pickZone(/counter|bar|kitchen|pass|desk/i, 0);
      const tableA = pickZone(/table|seat|dining|booth|lounge/i, 1);
      const tableB =
        zones.find(
          (z) =>
            z.id !== passZone.id &&
            z.id !== tableA.id &&
            /table|seat|waiting|lounge|display/i.test(`${z.id} ${z.label}`),
        ) ?? zones[2 % zones.length];

      rawSteps = [
        { action: "walk_to", target: passZone.id, label: "Load order trays" },
        {
          action: "say",
          text: `${spec.shortName} trays loaded at service pass.`,
          label: "Load order trays",
        },
        { action: "wait", seconds: 1.2, label: "Load order trays" },
        { action: "walk_to", target: tableA.id, label: "Deliver table order" },
        { action: "turn_to", target: tableA.id, label: "Deliver table order" },
        {
          action: "say",
          text: "Your order has arrived. Enjoy your meal!",
          label: "Deliver table order",
        },
        { action: "wait", seconds: 1.5, label: "Deliver table order" },
        { action: "walk_to", target: tableB.id, label: "Collect bussing dishes" },
        {
          action: "say",
          text: "Collecting cleared dishes for kitchen return.",
          label: "Collect bussing dishes",
        },
        { action: "walk_to", target: passZone.id, label: "Return to counter" },
        {
          action: "say",
          text: "Delivery cycle complete. Ready at pass.",
          label: "Return to counter",
        },
      ];
      break;
    }

    case "greeter_screen": {
      const entry = pickZone(/entrance|door|foyer|lobby/i, 0);
      const promo = pickZone(/display|menu|board|promo|desk|counter/i, 1);
      const dest = pickZone(/seat|table|lounge|shelves|corridor|waiting/i, 2);

      rawSteps = [
        { action: "walk_to", target: entry.id, label: "Greet at entrance" },
        { action: "wave", label: "Greet at entrance" },
        {
          action: "say",
          text: "Welcome! Let me show today's highlights.",
          label: "Greet at entrance",
        },
        { action: "walk_to", target: promo.id, label: "Display promotions" },
        { action: "point_to", target: promo.id, label: "Display promotions" },
        {
          action: "say",
          text: "Check my front screen for special offers.",
          label: "Display promotions",
        },
        { action: "walk_to", target: dest.id, label: "Escort visitors" },
        { action: "point_to", target: dest.id, label: "Escort visitors" },
        {
          action: "say",
          text: "Right this way. Enjoy your visit!",
          label: "Escort visitors",
        },
      ];
      break;
    }

    case "enclosed_cabinet": {
      const desk = pickZone(/reception|desk|counter|concierge/i, 0);
      const lift = pickZone(/elevator|lift|corridor|hall/i, 1);
      const roomZone = pickZone(/waiting|lounge|seat|room|office|shelves/i, 2);

      rawSteps = [
        { action: "walk_to", target: desk.id, label: "Load locked cabinet" },
        {
          action: "say",
          text: "Loading sealed parcel into secure compartment.",
          label: "Load locked cabinet",
        },
        { action: "wait", seconds: 1.4, label: "Load locked cabinet" },
        { action: "walk_to", target: lift.id, label: "Call elevator" },
        { action: "point_to", target: lift.id, label: "Call elevator" },
        {
          action: "say",
          text: "Calling smart elevator for multi-floor transit.",
          label: "Call elevator",
        },
        { action: "wait", seconds: 1.5, label: "Call elevator" },
        { action: "walk_to", target: roomZone.id, label: "Deliver to suite" },
        {
          action: "say",
          text: "Delivery arrived. Enter PIN to unlock.",
          label: "Deliver to suite",
        },
        { action: "walk_to", target: desk.id, label: "Return to lobby" },
      ];
      break;
    }

    case "floor_scrubber": {
      const laneA = pickZone(/entrance|corridor|concourse|aisle|promenade/i, 0);
      const laneB = pickZone(/seat|table|lounge|shelves|waiting|floor/i, 1);
      const laneC = pickZone(/counter|desk|checkout|display/i, 2);

      rawSteps = [
        { action: "walk_to", target: laneA.id, label: "Scrub main lane" },
        {
          action: "say",
          text: `Starting ${spec.shortName} autonomous floor scrub.`,
          label: "Scrub main lane",
        },
        { action: "wait", seconds: 1.6, label: "Scrub main lane" },
        { action: "walk_to", target: laneB.id, label: "Clean central floor" },
        { action: "turn_to", target: laneC.id, label: "Clean central floor" },
        { action: "wait", seconds: 1.6, label: "Clean central floor" },
        { action: "walk_to", target: laneC.id, label: "Perimeter edge pass" },
        {
          action: "say",
          text: "Floor lane clean and dry. Docking.",
          label: "Perimeter edge pass",
        },
        { action: "wait", seconds: 1.2, label: "Perimeter edge pass" },
      ];
      break;
    }

    case "warehouse_amr": {
      const dock = pickZone(/inbound|dock|entrance|counter|receiving/i, 0);
      const rack = pickZone(/shelves|rack|aisle|pallet|storage|corridor/i, 1);
      const outbound = pickZone(/outbound|packing|desk|waiting|display/i, 2);

      rawSteps = [
        { action: "walk_to", target: dock.id, label: "Pick up pallet load" },
        {
          action: "say",
          text: `${spec.shortName} locking pallet at inbound bay.`,
          label: "Pick up pallet load",
        },
        { action: "wait", seconds: 1.5, label: "Pick up pallet load" },
        { action: "walk_to", target: rack.id, label: "Transit AMR corridor" },
        { action: "point_to", target: rack.id, label: "Transit AMR corridor" },
        {
          action: "say",
          text: "Navigating wide corridor with LiDAR safety.",
          label: "Transit AMR corridor",
        },
        { action: "walk_to", target: outbound.id, label: "Drop at staging bay" },
        {
          action: "say",
          text: "Payload delivered to outbound staging.",
          label: "Drop at staging bay",
        },
        { action: "wait", seconds: 1.2, label: "Drop at staging bay" },
      ];
      break;
    }
  }

  return {
    job_id: job.id,
    steps: finalizeSteps(filterValidSteps(rawSteps, zoneIds), fallbackLabel),
  };
}
