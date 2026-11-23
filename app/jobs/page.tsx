"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { mockJobs, mockScenario, mockScene } from "@/mocks";
import {
  filterValidSteps,
  isJob,
  isJobsResult,
  isRobotPlan,
  isScene,
  type Fit,
  type Job,
  type JobsResult,
  type RobotPlan,
  type Scenario,
  type ScenarioStep,
  type Scene,
} from "@/types/contracts";
import { buildPlan } from "@/lib/roi/roi";
import {
  ANALYSIS_STORAGE_KEY,
  JOBS_STORAGE_KEY,
  PLAN_STORAGE_KEY,
  type Task,
} from "@/lib/ai/types";
import { demoTasks } from "@/lib/ai/demoData";
import { finalizeSteps, shortLabel } from "@/lib/ai/labels";
import { getOrCreateScenario, getOrCreateShift } from "@/lib/ai/scenarioCache";
import { clearHandoffStorage } from "@/lib/executor";

const SCENARIO_TIMEOUT_MS = 25_000;
const SHIFT_TIMEOUT_MS = 65_000;
const DEFAULT_HOURLY_COST = 8.5;
const ROBOT_PRICE_EUR = 8000;
const SAVED_CUSTOM_ANALYSIS_KEY = "robohire:savedCustomAnalysis";

export type SpacePresetId = "cafe" | "retail" | "hotel" | "hall";

export interface SpacePreset {
  id: SpacePresetId;
  label: string;
  tagline: string;
  scene: Scene;
  jobsData: JobsResult;
  plan: RobotPlan;
}

const RETAIL_SCENE: Scene = {
  room: { width: 12, depth: 9 },
  zones: [
    {
      id: "entrance",
      label: "Store Entrance",
      x: 6.0,
      z: 0.8,
      w: 2.2,
      d: 1.2,
    },
    {
      id: "promo_display",
      label: "Promo Display Board",
      x: 2.0,
      z: 2.0,
      w: 2.2,
      d: 1.0,
    },
    {
      id: "main_aisle_shelves",
      label: "Main Aisle Shelves",
      x: 5.8,
      z: 4.8,
      w: 4.0,
      d: 2.4,
    },
    {
      id: "checkout_counter",
      label: "Checkout Counter",
      x: 10.2,
      z: 4.5,
      w: 2.0,
      d: 3.8,
    },
    {
      id: "waiting_bench",
      label: "Fitting Lounge Sofa",
      x: 2.2,
      z: 7.4,
      w: 2.8,
      d: 1.8,
    },
  ],
};

const RETAIL_JOBS: JobsResult = {
  business_type: "Retail Shop",
  jobs: [
    {
      id: "retail_greeter",
      title: "Aisle Guide & Store Greeter",
      fit: "good",
      score: 90,
      why: "Shoppers frequently ask where product categories are located. K1 greets customers at the entrance, waves, and points or walks them toward the main aisle shelves.",
      limits:
        "Cannot retrieve items from high shelves or scan barcodes. Handles common wayfinding questions only.",
      hours_per_week: 14,
      savings_eur_month: 412,
      payback_months: 19,
    },
    {
      id: "promo_announcer",
      title: "Seasonal Promo Announcer",
      fit: "good",
      score: 84,
      why: "Staff rarely have time to pitch in-store deals. K1 stands near the promo display board, gestures to featured discounts, and announces offers clearly.",
      limits:
        "Cannot apply custom discounts at checkout or check live inventory counts without POS integration.",
      hours_per_week: 10,
      savings_eur_month: 295,
      payback_months: 27,
    },
    {
      id: "checkout_helper",
      title: "Fitting & Checkout Queue Helper",
      fit: "partial",
      score: 58,
      why: "During busy hours K1 guides shoppers from the fitting lounge sofa toward open checkout counters and explains self-checkout instructions.",
      limits:
        "Cannot fold garments, remove security tags, or bag purchased items at the register.",
      hours_per_week: 8,
      savings_eur_month: 118,
      payback_months: 68,
    },
    {
      id: "pallet_lifter",
      title: "Heavy Stock & Pallet Lifter",
      fit: "no",
      score: 10,
      why: "Restocking heavy boxes and moving warehouse pallets takes significant staff effort every morning.",
      limits:
        "K1 is a compact 95 cm communication humanoid without heavy payload lifting capacity or industrial grippers. Not suitable for stockroom lifting.",
      hours_per_week: 15,
      savings_eur_month: 0,
      payback_months: null,
    },
  ],
};

const HOTEL_SCENE: Scene = {
  room: { width: 12, depth: 9 },
  zones: [
    {
      id: "entrance",
      label: "Lobby Entrance",
      x: 6.0,
      z: 0.8,
      w: 2.4,
      d: 1.2,
    },
    {
      id: "reception_desk",
      label: "Reception Desk",
      x: 10.2,
      z: 4.4,
      w: 2.0,
      d: 4.2,
    },
    {
      id: "waiting_lounge",
      label: "Lobby Sofa Lounge",
      x: 2.2,
      z: 3.6,
      w: 2.8,
      d: 2.4,
    },
    {
      id: "seating_tables",
      label: "Café Seating Tables",
      x: 2.4,
      z: 7.2,
      w: 2.8,
      d: 2.0,
    },
    {
      id: "info_board",
      label: "Event & Concierge Board",
      x: 6.5,
      z: 7.8,
      w: 2.4,
      d: 1.0,
    },
  ],
};

const HOTEL_JOBS: JobsResult = {
  business_type: "Hotel Lobby",
  jobs: [
    {
      id: "hotel_greeter",
      title: "Guest Greeter & Concierge Guide",
      fit: "good",
      score: 91,
      why: "Arriving guests often wait in line just to ask where check-in, breakfast, or elevators are. K1 welcomes guests at the lobby entrance and directs them to the reception desk.",
      limits:
        "Cannot encode room keycards, verify passports, or process credit card deposits.",
      hours_per_week: 16,
      savings_eur_month: 471,
      payback_months: 17,
    },
    {
      id: "event_info_host",
      title: "Event & Breakfast Info Host",
      fit: "good",
      score: 83,
      why: "Front-desk staff repeat breakfast hours, Wi-Fi details, and conference schedules all morning. K1 presents schedules at the concierge board on demand.",
      limits:
        "Cannot book taxi transfers or modify room reservations directly.",
      hours_per_week: 11,
      savings_eur_month: 324,
      payback_months: 25,
    },
    {
      id: "lobby_patrol",
      title: "Lobby Lounge & FAQ Assistant",
      fit: "partial",
      score: 56,
      why: "K1 circulates between the lobby sofa lounge and reception desk to inform waiting guests about check-in queue status and local attractions.",
      limits:
        "Cannot serve welcome drinks or navigate crowded luggage piles without clear floor paths.",
      hours_per_week: 9,
      savings_eur_month: 132,
      payback_months: 61,
    },
    {
      id: "luggage_porter",
      title: "Heavy Luggage Bellhop Porter",
      fit: "no",
      score: 7,
      why: "Carrying guest suitcases to rooms and loading bell carts is a frequent physical task for lobby staff.",
      limits:
        "K1 cannot lift heavy suitcases, push loaded luggage carts, or operate guest elevator buttons autonomously.",
      hours_per_week: 18,
      savings_eur_month: 0,
      payback_months: null,
    },
  ],
};

const HALL_SCENE: Scene = {
  room: { width: 12, depth: 9 },
  zones: [
    {
      id: "entrance",
      label: "Main Hall Entrance",
      x: 6.0,
      z: 0.8,
      w: 2.4,
      d: 1.2,
    },
    {
      id: "registration_desk",
      label: "Registration Desk",
      x: 10.2,
      z: 3.8,
      w: 2.0,
      d: 3.6,
    },
    {
      id: "agenda_board",
      label: "Session Agenda Board",
      x: 2.0,
      z: 2.2,
      w: 2.2,
      d: 1.0,
    },
    {
      id: "study_tables",
      label: "Networking Tables",
      x: 6.0,
      z: 5.2,
      w: 4.0,
      d: 2.8,
    },
    {
      id: "waiting_sofa",
      label: "Speaker Waiting Sofa",
      x: 2.2,
      z: 7.2,
      w: 2.8,
      d: 1.8,
    },
  ],
};

const HALL_JOBS: JobsResult = {
  business_type: "Event / University Hall",
  jobs: [
    {
      id: "hall_wayfinder",
      title: "Visitor Greeter & Room Wayfinder",
      fit: "good",
      score: 89,
      why: "Students and conference attendees constantly ask for auditorium directions and badge check-in. K1 greets visitors at the main entrance and points them to registration.",
      limits:
        "Cannot print badges, check ID cards, or escort visitors up staircases.",
      hours_per_week: 12,
      savings_eur_month: 353,
      payback_months: 23,
    },
    {
      id: "agenda_announcer",
      title: "Session & Agenda Announcer",
      fit: "good",
      score: 85,
      why: "Organizers need timely reminders before keynote talks start. K1 stands by the session agenda board, highlights upcoming tracks, and invites attendees inside.",
      limits:
        "Cannot answer spontaneous academic questions or adjust live room schedules automatically.",
      hours_per_week: 10,
      savings_eur_month: 295,
      payback_months: 27,
    },
    {
      id: "crowd_flow_helper",
      title: "Breakout & Crowd Flow Helper",
      fit: "partial",
      score: 54,
      why: "Between lectures K1 guides attendees toward the networking tables and speaker waiting area to reduce bottlenecking near the entrance.",
      limits:
        "Voice announcements can be harder to hear in very loud halls without an external PA speaker.",
      hours_per_week: 8,
      savings_eur_month: 118,
      payback_months: 68,
    },
    {
      id: "av_mover",
      title: "Heavy AV & Stage Furniture Mover",
      fit: "no",
      score: 6,
      why: "Reconfiguring folding tables, podiums, and PA speakers between events requires significant manual labor.",
      limits:
        "K1 cannot lift furniture, rig audio-visual cables, or carry stage equipment. Not feasible for physical setup crews.",
      hours_per_week: 10,
      savings_eur_month: 0,
      payback_months: null,
    },
  ],
};

export const SPACE_PRESETS: Record<SpacePresetId, SpacePreset> = {
  cafe: {
    id: "cafe",
    label: "Café",
    tagline: "Table seating, counter & menu board",
    scene: mockScene,
    jobsData: mockJobs,
    plan: buildPlan(mockJobs.jobs, DEFAULT_HOURLY_COST),
  },
  retail: {
    id: "retail",
    label: "Retail Shop",
    tagline: "Aisle shelves, promo display & checkout",
    scene: RETAIL_SCENE,
    jobsData: RETAIL_JOBS,
    plan: buildPlan(RETAIL_JOBS.jobs, DEFAULT_HOURLY_COST),
  },
  hotel: {
    id: "hotel",
    label: "Hotel Lobby",
    tagline: "Reception desk, lounge sofa & concierge board",
    scene: HOTEL_SCENE,
    jobsData: HOTEL_JOBS,
    plan: buildPlan(HOTEL_JOBS.jobs, DEFAULT_HOURLY_COST),
  },
  hall: {
    id: "hall",
    label: "Event / University Hall",
    tagline: "Registration desk, agenda board & networking tables",
    scene: HALL_SCENE,
    jobsData: HALL_JOBS,
    plan: buildPlan(HALL_JOBS.jobs, DEFAULT_HOURLY_COST),
  },
};

export const SPACE_PRESET_LIST: SpacePreset[] = [
  SPACE_PRESETS.cafe,
  SPACE_PRESETS.retail,
  SPACE_PRESETS.hotel,
  SPACE_PRESETS.hall,
];

/**
 * Matches a SpacePreset strictly by its data (exact job IDs + zone IDs if scene
 * is present), NEVER by business_type name — so a real upload or showcase named
 * "Small café" or "Hotel lobby" is never mistaken for a hardcoded preset.
 */
function matchExactPreset(
  jobsData: JobsResult,
  scene?: Scene | null,
): SpacePreset | null {
  for (const preset of SPACE_PRESET_LIST) {
    if (jobsData.business_type !== preset.jobsData.business_type) continue;
    if (jobsData.jobs.length !== preset.jobsData.jobs.length) continue;
    const sameJobIds = preset.jobsData.jobs.every(
      (pj, idx) => jobsData.jobs[idx]?.id === pj.id,
    );
    if (!sameJobIds) continue;
    if (scene) {
      const sameZoneIds =
        scene.zones.length === preset.scene.zones.length &&
        preset.scene.zones.every((pz, idx) => scene.zones[idx]?.id === pz.id);
      if (!sameZoneIds) continue;
    }
    return preset;
  }
  return null;
}

function buildPresetTasks(preset: SpacePreset): Task[] {
  if (preset.id === "cafe") return demoTasks;
  const fallbackZoneId = preset.scene.zones[0]?.id ?? "entrance";
  return preset.jobsData.jobs.map((job, idx) => ({
    id: job.id,
    title: job.title,
    zone_id: preset.scene.zones[idx % preset.scene.zones.length]?.id ?? fallbackZoneId,
    description: job.why,
    frequency_per_day: Math.max(1, Math.round((job.hours_per_week * 60) / 6 / 3)),
    minutes_each: 3,
  }));
}

interface SavedCustomAnalysis {
  businessType: string;
  rawAnalysis: string | null;
  rawJobs: string;
  rawPlan: string | null;
  rawScene: string | null;
}

function parseSavedCustomAnalysis(raw: string | null): SavedCustomAnalysis | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SavedCustomAnalysis> | null;
    if (
      parsed &&
      typeof parsed.businessType === "string" &&
      typeof parsed.rawJobs === "string" &&
      parsed.rawJobs.length > 0
    ) {
      return {
        businessType: parsed.businessType,
        rawAnalysis: typeof parsed.rawAnalysis === "string" ? parsed.rawAnalysis : null,
        rawJobs: parsed.rawJobs,
        rawPlan: typeof parsed.rawPlan === "string" ? parsed.rawPlan : null,
        rawScene: typeof parsed.rawScene === "string" ? parsed.rawScene : null,
      };
    }
  } catch {
    // Ignore malformed saved backup
  }
  return null;
}

interface FitStyle {
  label: "Suitable" | "Partial" | "Not Suitable";
  badgeClass: string;
  scoreBarClass: string;
  cardClass: string;
}

const FIT_STYLES: Record<Fit, FitStyle> = {
  good: {
    label: "Suitable",
    badgeClass:
      "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    scoreBarClass: "bg-emerald-500",
    cardClass:
      "border-emerald-500/40 bg-white shadow-md dark:border-emerald-500/30 dark:bg-slate-900",
  },
  partial: {
    label: "Partial",
    badgeClass:
      "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300",
    scoreBarClass: "bg-amber-500",
    cardClass:
      "border-amber-500/40 bg-white shadow-sm dark:border-amber-500/30 dark:bg-slate-900",
  },
  no: {
    label: "Not Suitable",
    badgeClass:
      "border-slate-400/40 bg-slate-500/15 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400",
    scoreBarClass: "bg-slate-400 dark:bg-slate-600",
    cardClass:
      "border-slate-300/70 bg-slate-100/70 opacity-60 grayscale-[35%] dark:border-slate-800 dark:bg-slate-900/40",
  },
};

const PRESET_SCENARIOS: Record<string, ScenarioStep[]> = {
  // Café scenarios
  greeter: mockScenario.steps,
  menu_presenter: [
    { action: "walk_to", target: "menu_board" },
    { action: "turn_to", target: "entrance" },
    { action: "wave" },
    {
      action: "say",
      text: "Hello everyone! Check out today's fresh pastry and roast coffee combo on our menu board.",
    },
    { action: "point_to", target: "menu_board" },
    { action: "wait", seconds: 2 },
    { action: "point_to", target: "counter" },
    {
      action: "say",
      text: "Head right over to the counter whenever you are ready to order.",
    },
  ],
  table_guide: [
    { action: "walk_to", target: "entrance" },
    { action: "wave" },
    {
      action: "say",
      text: "Welcome! Follow me and I will guide you to our seating area.",
    },
    { action: "walk_to", target: "tables" },
    { action: "point_to", target: "tables" },
    {
      action: "say",
      text: "Here are our available tables. Please make yourself comfortable!",
    },
    { action: "wait", seconds: 2 },
    { action: "point_to", target: "counter" },
    {
      action: "say",
      text: "When you are ready, you can place your order at the counter.",
    },
  ],

  // Retail Shop scenarios
  retail_greeter: [
    { action: "walk_to", target: "entrance" },
    { action: "wave" },
    {
      action: "say",
      text: "Welcome to our retail store! Let me help you find what you are looking for today.",
    },
    { action: "turn_to", target: "main_aisle_shelves" },
    { action: "point_to", target: "main_aisle_shelves" },
    {
      action: "say",
      text: "New arrivals and popular essentials are organized along our main aisle shelves.",
    },
    { action: "walk_to", target: "main_aisle_shelves" },
    { action: "turn_to", target: "checkout_counter" },
    { action: "point_to", target: "checkout_counter" },
    {
      action: "say",
      text: "When you finish browsing, our checkout counter is right over there.",
    },
  ],
  promo_announcer: [
    { action: "walk_to", target: "promo_display" },
    { action: "turn_to", target: "entrance" },
    { action: "wave" },
    {
      action: "say",
      text: "Good day shoppers! Take a look at our seasonal promotion board for today's member deals.",
    },
    { action: "point_to", target: "promo_display" },
    { action: "wait", seconds: 2 },
    { action: "point_to", target: "main_aisle_shelves" },
    {
      action: "say",
      text: "All featured promotional items are stocked on the main aisle shelves.",
    },
  ],
  checkout_helper: [
    { action: "walk_to", target: "waiting_bench" },
    { action: "wave" },
    {
      action: "say",
      text: "Ready to check out? Follow me toward the checkout counter.",
    },
    { action: "walk_to", target: "checkout_counter" },
    { action: "point_to", target: "checkout_counter" },
    {
      action: "say",
      text: "Register two and contactless self-checkout are open right here.",
    },
    { action: "wait", seconds: 2 },
  ],

  // Hotel Lobby scenarios
  hotel_greeter: [
    { action: "walk_to", target: "entrance" },
    { action: "wave" },
    {
      action: "say",
      text: "Welcome to our hotel! We are delighted to have you with us today.",
    },
    { action: "turn_to", target: "reception_desk" },
    { action: "point_to", target: "reception_desk" },
    {
      action: "say",
      text: "Please proceed to the reception desk on the right for room check-in and keycards.",
    },
    { action: "walk_to", target: "reception_desk" },
    { action: "turn_to", target: "waiting_lounge" },
    { action: "point_to", target: "waiting_lounge" },
    {
      action: "say",
      text: "Feel free to relax in our lobby sofa lounge while your room is prepared.",
    },
  ],
  event_info_host: [
    { action: "walk_to", target: "info_board" },
    { action: "turn_to", target: "entrance" },
    { action: "wave" },
    {
      action: "say",
      text: "Good morning guests! Breakfast is served until ten thirty next to our café seating tables.",
    },
    { action: "point_to", target: "seating_tables" },
    { action: "wait", seconds: 2 },
    { action: "point_to", target: "info_board" },
    {
      action: "say",
      text: "Today's conference rooms and city shuttle departures are listed on this concierge board.",
    },
  ],
  lobby_patrol: [
    { action: "walk_to", target: "waiting_lounge" },
    { action: "wave" },
    {
      action: "say",
      text: "Hello everyone in the lobby lounge! Check-in wait time is currently under two minutes.",
    },
    { action: "turn_to", target: "reception_desk" },
    { action: "point_to", target: "reception_desk" },
    { action: "wait", seconds: 2 },
    { action: "walk_to", target: "seating_tables" },
    {
      action: "say",
      text: "High-speed guest Wi-Fi is available throughout the lobby seating area.",
    },
  ],

  // Event / University Hall scenarios
  hall_wayfinder: [
    { action: "walk_to", target: "entrance" },
    { action: "wave" },
    {
      action: "say",
      text: "Welcome to the hall! Please pick up your visitor badge at the registration desk.",
    },
    { action: "turn_to", target: "registration_desk" },
    { action: "point_to", target: "registration_desk" },
    { action: "walk_to", target: "registration_desk" },
    { action: "turn_to", target: "agenda_board" },
    { action: "point_to", target: "agenda_board" },
    {
      action: "say",
      text: "Check the session agenda board for lecture room numbers and keynote times.",
    },
  ],
  agenda_announcer: [
    { action: "walk_to", target: "agenda_board" },
    { action: "turn_to", target: "entrance" },
    { action: "wave" },
    {
      action: "say",
      text: "Attention attendees! The next keynote session begins in five minutes.",
    },
    { action: "point_to", target: "agenda_board" },
    { action: "wait", seconds: 2 },
    { action: "point_to", target: "study_tables" },
    {
      action: "say",
      text: "Workshop groups are gathering around the networking tables right now.",
    },
  ],
  crowd_flow_helper: [
    { action: "walk_to", target: "entrance" },
    { action: "wave" },
    {
      action: "say",
      text: "Please keep the main entrance clear and move toward the networking tables.",
    },
    { action: "walk_to", target: "study_tables" },
    { action: "point_to", target: "study_tables" },
    { action: "turn_to", target: "waiting_sofa" },
    { action: "point_to", target: "waiting_sofa" },
    {
      action: "say",
      text: "Guest speakers are welcome to rest at the speaker waiting sofa before their panel.",
    },
  ],
};

interface JobsAndPlanSnapshot {
  jobsData: JobsResult;
  plan: RobotPlan;
  scene: Scene;
  hasCustomUpload: boolean;
  activePresetId: SpacePresetId | null;
  savedCustomAnalysis: SavedCustomAnalysis | null;
}

const SERVER_JOBS_PLAN_SNAPSHOT: JobsAndPlanSnapshot = {
  jobsData: SPACE_PRESETS.cafe.jobsData,
  plan: SPACE_PRESETS.cafe.plan,
  scene: SPACE_PRESETS.cafe.scene,
  hasCustomUpload: false,
  activePresetId: "cafe",
  savedCustomAnalysis: null,
};

let cachedStorageKey = "";
let cachedSnapshot: JobsAndPlanSnapshot = SERVER_JOBS_PLAN_SNAPSHOT;

function getJobsAndPlanClientSnapshot(): JobsAndPlanSnapshot {
  if (typeof window === "undefined") return SERVER_JOBS_PLAN_SNAPSHOT;
  try {
    const rawJobs = window.sessionStorage.getItem(JOBS_STORAGE_KEY) ?? "";
    const rawPlan = window.sessionStorage.getItem(PLAN_STORAGE_KEY) ?? "";
    const rawAnalysis =
      window.sessionStorage.getItem(ANALYSIS_STORAGE_KEY) ?? "";
    const rawScene = window.sessionStorage.getItem("robohire:scene") ?? "";
    const rawSavedCustom =
      window.sessionStorage.getItem(SAVED_CUSTOM_ANALYSIS_KEY) ?? "";
    const key = `${rawJobs}|${rawPlan}|${rawAnalysis}|${rawScene}|${rawSavedCustom}`;

    if (key !== cachedStorageKey) {
      cachedStorageKey = key;

      let jobsData: JobsResult = mockJobs;
      let hasStoredJobs = false;
      if (rawJobs) {
        try {
          const parsedJobs = JSON.parse(rawJobs) as unknown;
          if (isJobsResult(parsedJobs)) {
            jobsData = parsedJobs;
            hasStoredJobs = true;
          }
        } catch {
          jobsData = mockJobs;
        }
      }

      let storedScene: Scene | null = null;
      let analysisTasksCount = 0;
      if (rawAnalysis) {
        try {
          const parsedAnalysis = JSON.parse(rawAnalysis) as {
            scene?: unknown;
            tasks?: unknown;
          };
          if (isScene(parsedAnalysis?.scene)) {
            storedScene = parsedAnalysis.scene;
          }
          if (Array.isArray(parsedAnalysis?.tasks)) {
            analysisTasksCount = parsedAnalysis.tasks.length;
          }
        } catch {
          // ignore malformed analysis
        }
      }
      if (!storedScene && rawScene) {
        try {
          const parsedScene = JSON.parse(rawScene) as unknown;
          if (isScene(parsedScene)) {
            storedScene = parsedScene;
          }
        } catch {
          // ignore malformed scene
        }
      }

      const matchedPreset = matchExactPreset(jobsData, storedScene);
      const hasCustomUpload =
        matchedPreset === null && (hasStoredJobs || analysisTasksCount > 0);
      const activePresetId = matchedPreset ? matchedPreset.id : null;

      const scene: Scene = storedScene ?? matchedPreset?.scene ?? mockScene;

      const jobIdsSet = new Set(jobsData.jobs.map((j) => j.id));
      let plan: RobotPlan | null = null;
      if (rawPlan) {
        try {
          const parsedPlan = JSON.parse(rawPlan) as unknown;
          if (
            isRobotPlan(parsedPlan) &&
            parsedPlan.job_ids.every((id) => jobIdsSet.has(id))
          ) {
            plan = parsedPlan;
          }
        } catch {
          plan = null;
        }
      }

      if (!plan) {
        plan = buildPlan(jobsData.jobs, DEFAULT_HOURLY_COST);
      }

      const savedCustomAnalysis = hasCustomUpload
        ? null
        : parseSavedCustomAnalysis(rawSavedCustom);

      cachedSnapshot = {
        jobsData,
        plan,
        scene,
        hasCustomUpload,
        activePresetId,
        savedCustomAnalysis,
      };
    }
  } catch {
    cachedSnapshot = SERVER_JOBS_PLAN_SNAPSHOT;
    return SERVER_JOBS_PLAN_SNAPSHOT;
  }
  return cachedSnapshot;
}

function getJobsAndPlanServerSnapshot(): JobsAndPlanSnapshot {
  return SERVER_JOBS_PLAN_SNAPSHOT;
}

function subscribeJobsStorage(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener("popstate", callback);
  window.addEventListener("focus", callback);
  window.addEventListener("robohire:storage", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("popstate", callback);
    window.removeEventListener("focus", callback);
    window.removeEventListener("robohire:storage", callback);
  };
}

function buildFallbackScenario(job: Job, scene: Scene): Scenario {
  const zoneIds = scene.zones.map((z) => z.id);
  const label = shortLabel(job.title);
  const preset = PRESET_SCENARIOS[job.id];
  if (preset) {
    const validPreset = filterValidSteps(preset, zoneIds);
    if (validPreset.length >= 2) {
      return { job_id: job.id, steps: finalizeSteps(validPreset, label) };
    }
  }

  const firstZone = scene.zones[0]?.id;
  const secondZone = scene.zones[1]?.id ?? firstZone;

  const genericSteps: ScenarioStep[] = firstZone
    ? [
        { action: "walk_to", target: firstZone },
        { action: "wave" },
        {
          action: "say",
          text: `Performing ${label}.`,
        },
        ...(secondZone
          ? ([
              { action: "turn_to", target: secondZone },
              { action: "point_to", target: secondZone },
            ] as ScenarioStep[])
          : []),
        { action: "wait", seconds: 2 },
        {
          action: "say",
          text: "Task complete. Ready to help.",
        },
      ]
    : [{ action: "wave" }];

  return {
    job_id: job.id,
    steps: finalizeSteps(filterValidSteps(genericSteps, zoneIds), label),
  };
}

function getDisplayPaybackMonths(job: Job): number | null {
  if (job.fit === "no" || job.savings_eur_month <= 0) return null;
  if (typeof job.payback_months === "number" && job.payback_months > 0) {
    return job.payback_months;
  }
  return Math.max(1, Math.round(ROBOT_PRICE_EUR / job.savings_eur_month));
}

interface JobCardProps {
  job: Job;
  rank: number;
  inPlan: boolean;
  isHiring: boolean;
  isAnyHiring: boolean;
  onHire: (job: Job) => void;
}

function JobCard({
  job,
  rank,
  inPlan,
  isHiring,
  isAnyHiring,
  onHire,
}: JobCardProps) {
  const style = FIT_STYLES[job.fit];
  const isNotSuitable = job.fit === "no";
  const canHire = job.fit === "good" || job.fit === "partial";
  const paybackMonths = getDisplayPaybackMonths(job);

  return (
    <article
      data-testid={`job-card-${job.id}`}
      data-fit={job.fit}
      className={`flex flex-col justify-between rounded-2xl border p-6 transition-colors ${style.cardClass}`}
    >
      <div className="space-y-4">
        {/* Header: Rank, Title, In Plan Badge, Fit Badge, Score, and Hire Button */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-xs font-bold text-slate-400 dark:text-slate-500">
                #{rank}
              </span>
              <h2
                className={`text-xl font-bold tracking-tight ${
                  isNotSuitable
                    ? "text-slate-600 dark:text-slate-400"
                    : "text-slate-900 dark:text-white"
                }`}
              >
                {job.title}
              </h2>
              {inPlan && (
                <span
                  data-testid={`in-plan-badge-${job.id}`}
                  className="rounded-full border border-sky-500/50 bg-sky-500/15 px-2.5 py-0.5 text-xs font-bold text-sky-700 dark:text-sky-300"
                >
                  In plan
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold tracking-wide ${style.badgeClass}`}
            >
              {style.label}
            </span>
            <div className="flex items-baseline gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono dark:border-slate-800 dark:bg-slate-950">
              <span
                className={`text-base font-extrabold ${
                  isNotSuitable
                    ? "text-slate-500 dark:text-slate-400"
                    : "text-slate-900 dark:text-white"
                }`}
              >
                {job.score}
              </span>
              <span className="text-xs text-slate-400">/100</span>
            </div>

            {canHire && (
              <button
                type="button"
                data-testid={`hire-job-btn-${job.id}`}
                disabled={isAnyHiring}
                onClick={() => onHire(job)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-sky-400/60 bg-sky-600 px-4 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-sky-500 active:scale-95 disabled:cursor-wait disabled:opacity-60"
              >
                {isHiring && (
                  <span
                    aria-hidden="true"
                    className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"
                  />
                )}
                <span>{isHiring ? "Hiring…" : "Hire"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Score Bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className={`h-full rounded-full transition-all ${style.scoreBarClass}`}
            style={{ width: `${Math.max(0, Math.min(100, job.score))}%` }}
          />
        </div>

        {/* Why it fits & Limitations */}
        <div className="grid gap-3 pt-1 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800/80 dark:bg-slate-950/50">
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Why it fits
            </div>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {job.why}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800/80 dark:bg-slate-950/50">
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Limitations
            </div>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {job.limits}
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Footer: Hours/week, Savings/mo (€), and Payback (months) */}
      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-200/80 pt-4 text-center dark:border-slate-800/80">
        <div className="rounded-lg bg-slate-100/80 px-3 py-2 dark:bg-slate-950/60">
          <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Hours / week
          </dt>
          <dd className="mt-0.5 font-mono text-base font-bold text-slate-900 dark:text-slate-100">
            {job.hours_per_week} hrs/wk
          </dd>
        </div>

        <div className="rounded-lg bg-slate-100/80 px-3 py-2 dark:bg-slate-950/60">
          <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Savings / mo
          </dt>
          <dd
            className={`mt-0.5 font-mono text-base font-bold ${
              job.savings_eur_month > 0
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-slate-500 dark:text-slate-500"
            }`}
          >
            €{job.savings_eur_month}/mo
          </dd>
        </div>

        <div className="rounded-lg bg-slate-100/80 px-3 py-2 dark:bg-slate-950/60">
          <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Payback
          </dt>
          <dd className="mt-0.5 font-mono text-base font-bold text-slate-900 dark:text-slate-100">
            {paybackMonths !== null ? `${paybackMonths} mo` : "—"}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default function JobsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    jobsData,
    plan,
    scene,
    hasCustomUpload,
    activePresetId,
    savedCustomAnalysis,
  } = useSyncExternalStore(
    subscribeJobsStorage,
    getJobsAndPlanClientSnapshot,
    getJobsAndPlanServerSnapshot,
  );
  const [hiringTargetTitle, setHiringTargetTitle] = useState<string | null>(
    null,
  );
  const [hiringJobId, setHiringJobId] = useState<string | null>(null);
  const isHiringRef = useRef(false);

  useEffect(() => {
    try {
      const currentIds = new Set(jobsData.jobs.map((j) => j.id));
      const rawJob = window.sessionStorage.getItem("robohire:job");
      if (rawJob) {
        const parsed = JSON.parse(rawJob) as unknown;
        if (!isJob(parsed) || !currentIds.has(parsed.id)) {
          clearHandoffStorage();
        }
      }
      if (hasCustomUpload) {
        // Fresh real analysis is active — discard any older saved backup
        window.sessionStorage.removeItem(SAVED_CUSTOM_ANALYSIS_KEY);
      }
    } catch {
      // Ignore storage errors
    }
    window.dispatchEvent(new Event("robohire:storage"));
  }, [pathname, jobsData.jobs, hasCustomUpload]);

  function handleSelectPreset(preset: SpacePreset) {
    if (hiringTargetTitle !== null) return;
    try {
      // Preserve the user's real analysis before switching to a demo preset
      if (hasCustomUpload) {
        const rawJobs = window.sessionStorage.getItem(JOBS_STORAGE_KEY);
        if (rawJobs) {
          const backup: SavedCustomAnalysis = {
            businessType: jobsData.business_type,
            rawAnalysis: window.sessionStorage.getItem(ANALYSIS_STORAGE_KEY),
            rawJobs,
            rawPlan: window.sessionStorage.getItem(PLAN_STORAGE_KEY),
            rawScene: window.sessionStorage.getItem("robohire:scene"),
          };
          window.sessionStorage.setItem(
            SAVED_CUSTOM_ANALYSIS_KEY,
            JSON.stringify(backup),
          );
        }
      }

      clearHandoffStorage();
      window.sessionStorage.setItem(
        JOBS_STORAGE_KEY,
        JSON.stringify(preset.jobsData),
      );
      window.sessionStorage.setItem(
        PLAN_STORAGE_KEY,
        JSON.stringify(preset.plan),
      );
      window.sessionStorage.setItem(
        ANALYSIS_STORAGE_KEY,
        JSON.stringify({
          scene: preset.scene,
          tasks: buildPresetTasks(preset),
          businessType: preset.jobsData.business_type,
          hoursPerWeek: 60,
          hourlyCost: DEFAULT_HOURLY_COST,
        }),
      );
      window.sessionStorage.setItem(
        "robohire:scene",
        JSON.stringify(preset.scene),
      );
      window.localStorage.setItem(
        "robohire:scene",
        JSON.stringify(preset.scene),
      );
      window.dispatchEvent(new Event("robohire:storage"));
    } catch {
      // Ignore storage errors
    }
  }

  function handleRestoreCustomAnalysis() {
    if (hiringTargetTitle !== null || !savedCustomAnalysis) return;
    try {
      clearHandoffStorage();
      window.sessionStorage.setItem(
        JOBS_STORAGE_KEY,
        savedCustomAnalysis.rawJobs,
      );
      if (savedCustomAnalysis.rawPlan) {
        window.sessionStorage.setItem(
          PLAN_STORAGE_KEY,
          savedCustomAnalysis.rawPlan,
        );
      } else {
        window.sessionStorage.removeItem(PLAN_STORAGE_KEY);
      }
      if (savedCustomAnalysis.rawAnalysis) {
        window.sessionStorage.setItem(
          ANALYSIS_STORAGE_KEY,
          savedCustomAnalysis.rawAnalysis,
        );
      } else {
        window.sessionStorage.removeItem(ANALYSIS_STORAGE_KEY);
      }
      if (savedCustomAnalysis.rawScene) {
        window.sessionStorage.setItem(
          "robohire:scene",
          savedCustomAnalysis.rawScene,
        );
      }
      window.sessionStorage.removeItem(SAVED_CUSTOM_ANALYSIS_KEY);
      window.dispatchEvent(new Event("robohire:storage"));
    } catch {
      // Ignore storage errors
    }
  }

  const sortedJobs = useMemo(
    () => [...jobsData.jobs].sort((a, b) => b.score - a.score),
    [jobsData.jobs],
  );

  const planIdSet = useMemo(() => new Set(plan.job_ids), [plan.job_ids]);

  const includedJobs = useMemo(
    () =>
      plan.job_ids
        .map((id) => jobsData.jobs.find((j) => j.id === id))
        .filter((j): j is Job => j !== undefined),
    [plan.job_ids, jobsData.jobs],
  );

  const primaryHireJob = useMemo(
    () =>
      includedJobs[0] ??
      sortedJobs.find((j) => j.fit === "good" || j.fit === "partial") ??
      null,
    [includedJobs, sortedJobs],
  );

  function persistHandoff(
    targetScene: Scene,
    targetScenario: Scenario,
    targetJob: Job,
  ) {
    try {
      const sceneJson = JSON.stringify(targetScene);
      const scenarioJson = JSON.stringify(targetScenario);
      const jobJson = JSON.stringify(targetJob);
      const planJson = JSON.stringify(plan);
      const jobsJson = JSON.stringify(jobsData);

      window.sessionStorage.setItem("robohire:scene", sceneJson);
      window.sessionStorage.setItem("robohire:scenario", scenarioJson);
      window.sessionStorage.setItem("robohire:job", jobJson);
      window.sessionStorage.setItem(PLAN_STORAGE_KEY, planJson);
      window.sessionStorage.setItem(JOBS_STORAGE_KEY, jobsJson);

      window.localStorage.setItem("robohire:scene", sceneJson);
      window.localStorage.setItem("robohire:scenario", scenarioJson);
      window.localStorage.setItem("robohire:job", jobJson);

      window.dispatchEvent(new Event("robohire:storage"));
    } catch {
      // Ignore storage quota errors
    }
  }

  async function handleHireJob(job: Job) {
    if (isHiringRef.current || hiringTargetTitle !== null) return;
    isHiringRef.current = true;
    setHiringTargetTitle(job.title);
    setHiringJobId(job.id);

    try {
      clearHandoffStorage();
      let scenario: Scenario | null = null;

      try {
        const { scenario: candidate } = await getOrCreateScenario(job, scene, {
          businessType: jobsData.business_type,
          timeoutMs: SCENARIO_TIMEOUT_MS,
        });
        const validSteps = filterValidSteps(
          candidate.steps,
          scene.zones.map((z) => z.id),
        );
        if (validSteps.length > 0) {
          scenario = { job_id: candidate.job_id, steps: validSteps };
        }
      } catch {
        // Gracefully fall back to matching preset scenario below
      }

      if (!scenario) {
        scenario = buildFallbackScenario(job, scene);
      }

      persistHandoff(scene, scenario, job);
      router.push("/robot");
    } catch {
      isHiringRef.current = false;
      setHiringTargetTitle(null);
      setHiringJobId(null);
    }
  }

  async function handleHireShift() {
    if (isHiringRef.current || hiringTargetTitle !== null || !primaryHireJob) return;
    isHiringRef.current = true;
    setHiringTargetTitle(
      includedJobs.map((j) => j.title).join(" + ") || primaryHireJob.title,
    );
    setHiringJobId("shift");

    try {
      clearHandoffStorage();
      let scenario: Scenario | null = null;

      try {
        const { scenario: shiftCandidate } = await getOrCreateShift(
          plan,
          jobsData.jobs,
          scene,
          {
            businessType: jobsData.business_type,
            timeoutMs: SHIFT_TIMEOUT_MS,
          },
        );
        const validSteps = filterValidSteps(
          shiftCandidate.steps,
          scene.zones.map((z) => z.id),
        );
        if (validSteps.length > 0) {
          scenario = { job_id: shiftCandidate.job_id, steps: validSteps };
        }
      } catch {
        // If shift endpoint fails, fall back to first plan job's scenario
        try {
          const { scenario: jobCandidate } = await getOrCreateScenario(
            primaryHireJob,
            scene,
            {
              businessType: jobsData.business_type,
              timeoutMs: SCENARIO_TIMEOUT_MS,
            },
          );
          const validSteps = filterValidSteps(
            jobCandidate.steps,
            scene.zones.map((z) => z.id),
          );
          if (validSteps.length > 0) {
            scenario = { job_id: jobCandidate.job_id, steps: validSteps };
          }
        } catch {
          // Fall through to buildFallbackScenario
        }
      }

      if (!scenario) {
        scenario = buildFallbackScenario(primaryHireJob, scene);
      }

      persistHandoff(scene, scenario, primaryHireJob);
      router.push("/robot");
    } catch {
      isHiringRef.current = false;
      setHiringTargetTitle(null);
      setHiringJobId(null);
    }
  }

  const capacityPercent =
    plan.capacity_hours_per_week > 0
      ? Math.min(
          100,
          Math.round((plan.hours_per_week / plan.capacity_hours_per_week) * 100),
        )
      : 0;

  return (
    <main className="flex-1 bg-slate-50 px-4 py-8 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Page Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
          <div>
            <span className="inline-block rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-0.5 font-mono text-xs font-semibold text-sky-700 dark:text-sky-300">
              Step 2 of 3 • {jobsData.business_type}
            </span>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Matched Booster K1 Robot Jobs
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Switch between business space presets or review your uploaded
              space, ranked by Booster K1 capability fit score (0–100), monthly
              savings, and payback period.
            </p>
          </div>
        </div>

        {/* Space Preset Selector Tabs / Pills */}
        <section
          aria-label="Business Space Presets"
          data-testid="space-preset-tabs"
          className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs transition-colors dark:border-slate-800 dark:bg-slate-900"
        >
          {hasCustomUpload && (
            <div
              data-testid="custom-analysis-banner"
              className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200"
            >
              <span className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                Showing your analyzed space:{" "}
                <strong className="font-bold">{jobsData.business_type}</strong>
              </span>
              <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-300">
                {scene.room.width}m × {scene.room.depth}m • {scene.zones.length}{" "}
                zones
              </span>
            </div>
          )}

          {!hasCustomUpload && savedCustomAnalysis && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3.5 py-2 text-xs text-sky-900 dark:text-sky-200">
              <span className="font-medium">
                Previewing demo preset. Your real analysis is saved.
              </span>
              <button
                type="button"
                data-testid="back-to-my-analysis-btn"
                disabled={hiringTargetTitle !== null}
                onClick={handleRestoreCustomAnalysis}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-sky-500/50 bg-sky-600 px-3 py-1 text-xs font-bold text-white shadow-2xs transition hover:bg-sky-500 active:scale-95 disabled:opacity-50"
              >
                ← Back to my analysis ({savedCustomAnalysis.businessType})
              </button>
            </div>
          )}

          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {hasCustomUpload || savedCustomAnalysis
                ? "Try other demo spaces"
                : "Select Business Space Preset"}
            </span>
            {!hasCustomUpload && (
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {scene.room.width}m × {scene.room.depth}m • {scene.zones.length}{" "}
                zones
              </span>
            )}
          </div>
          <div
            role="tablist"
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {SPACE_PRESET_LIST.map((preset) => {
              const isSelected = !hasCustomUpload && activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  data-testid={`space-preset-${preset.id}`}
                  disabled={hiringTargetTitle !== null}
                  onClick={() => handleSelectPreset(preset)}
                  className={`flex cursor-pointer flex-col items-start rounded-xl border px-3.5 py-2.5 text-left transition active:scale-[0.98] disabled:cursor-wait ${
                    isSelected
                      ? "border-sky-500 bg-sky-500/10 text-sky-900 shadow-2xs ring-1 ring-sky-500/40 dark:border-sky-400 dark:bg-sky-500/15 dark:text-white"
                      : "border-slate-200 bg-slate-50/80 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800/70"
                  }`}
                >
                  <span className="text-sm font-bold">{preset.label}</span>
                  <span className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {preset.tagline}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Recommended: hire 1 Booster K1 Shift Plan Panel */}
        <section
          data-testid="robot-plan-panel"
          className="rounded-2xl border-2 border-sky-500/50 bg-white p-6 shadow-md transition-colors dark:border-sky-500/40 dark:bg-slate-900"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/40 bg-sky-500/15 px-3 py-0.5 text-xs font-bold text-sky-700 dark:text-sky-300">
                <span>Robot Shift Plan</span>
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Recommended: hire 1 Booster K1
              </h2>
              {includedJobs.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Included jobs:
                  </span>
                  {includedJobs.map((j) => (
                    <span
                      key={j.id}
                      className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:text-emerald-200"
                    >
                      {j.title}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  No tasks currently meet the minimum gross savings threshold
                  for a shift plan.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/report"
                data-testid="download-report-btn"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-100 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <span>Download report</span>
              </Link>
              {primaryHireJob && (
                <button
                  type="button"
                  data-testid="hire-plan-btn"
                  disabled={hiringTargetTitle !== null}
                  onClick={handleHireShift}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-sky-400/60 bg-sky-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-sky-500 active:scale-95 disabled:cursor-wait disabled:opacity-60"
                >
                  {hiringJobId === "shift" && (
                    <span
                      aria-hidden="true"
                      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                    />
                  )}
                  <span>
                    {hiringJobId === "shift" ? "Hiring…" : "Hire this K1"}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Shift Plan Economics Grid */}
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5">
              <dt className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                Net savings
              </dt>
              <dd className="mt-0.5 font-mono text-lg font-extrabold text-emerald-700 dark:text-emerald-300">
                €{plan.net_savings_eur_month}/mo
              </dd>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/60">
              <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Payback
              </dt>
              <dd className="mt-0.5 font-mono text-lg font-extrabold text-slate-900 dark:text-white">
                {plan.payback_months !== null
                  ? `${plan.payback_months} mo`
                  : "—"}
              </dd>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/60">
              <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Robot price
              </dt>
              <dd className="mt-0.5 font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                €{plan.robot_price_eur}
              </dd>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/60">
              <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Running cost
              </dt>
              <dd className="mt-0.5 font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                €{plan.running_cost_eur_month}/mo
              </dd>
            </div>
          </dl>

          {/* Robot Hours Used vs Capacity Bar */}
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Robot hours used vs weekly capacity
              </span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                {plan.hours_per_week} / {plan.capacity_hours_per_week} hrs/wk (
                {capacityPercent}%)
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-sky-500 transition-all"
                style={{ width: `${capacityPercent}%` }}
              />
            </div>
          </div>

          {/* Collapsible Assumptions */}
          {plan.assumptions.length > 0 && (
            <details className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
              <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-200">
                Assumptions ({plan.assumptions.length})
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {plan.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          )}
        </section>

        {/* Hiring Transition Loading Banner */}
        {hiringTargetTitle && (
          <div
            role="status"
            data-testid="hiring-loading-banner"
            className="flex items-center gap-3 rounded-2xl border border-sky-500/50 bg-sky-500/10 px-5 py-3.5 text-sm font-semibold text-sky-800 shadow-sm dark:text-sky-200"
          >
            <span className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
            <span>
              Preparing 3D workspace &amp; generating K1 scenario for{" "}
              <strong className="font-bold">{hiringTargetTitle}</strong>…
            </span>
          </div>
        )}

        {/* Sorted Job Cards List */}
        <section className="space-y-4" aria-label="Matched Robot Jobs">
          {sortedJobs.map((job, idx) => (
            <JobCard
              key={job.id}
              job={job}
              rank={idx + 1}
              inPlan={planIdSet.has(job.id)}
              isHiring={hiringJobId === job.id}
              isAnyHiring={hiringTargetTitle !== null}
              onHire={handleHireJob}
            />
          ))}
        </section>
      </div>
    </main>
  );
}
