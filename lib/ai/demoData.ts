import type { Task } from "./types";

/** Demo tasks for mockScene (zones: entrance, counter, tables, menu_board, waiting_area). Illustrative, not measured. */
export const demoTasks: Task[] = [
  { id: "greeter", title: "Greet guests at the entrance", zone_id: "entrance", description: "Welcome arriving guests and tell them where to go.", frequency_per_day: 40, minutes_each: 2 },
  { id: "menu_presenter", title: "Explain the menu and daily offers", zone_id: "menu_board", description: "Present the menu board, daily specials and answer common questions.", frequency_per_day: 25, minutes_each: 3 },
  { id: "table_guide", title: "Guide guests to a free table", zone_id: "tables", description: "Walk guests to an available table and point out the seating.", frequency_per_day: 30, minutes_each: 2 },
  { id: "queue_info", title: "Give queue and waiting-time information", zone_id: "waiting_area", description: "Tell waiting guests how long it will take and what to do next.", frequency_per_day: 20, minutes_each: 2 },
  { id: "dishwashing", title: "Wash dishes and clear tables", zone_id: "counter", description: "Collect dirty dishes and wash them by hand.", frequency_per_day: 15, minutes_each: 8 },
];

export const demoMeta = { businessType: "Small café (Riga)", hoursPerWeek: 60, hourlyCost: 8.5 };
