import type { Task } from "./types";

/** Sample tasks for the default Riga Tight Café floor plan (mocks/scene.json). */
export const demoTasks: Task[] = [
  {
    id: "narrow_tray_delivery",
    title: "Deliver coffee & pastry orders through 55 cm aisles",
    zone_id: "counter",
    description:
      "Shuttle prepared coffee cups and pastries from the counter to tightly spaced café tables.",
    frequency_per_day: 65,
    minutes_each: 2,
  },
  {
    id: "entrance_greeter",
    title: "Greet guests & showcase daily combo specials",
    zone_id: "entrance",
    description:
      "Welcome arriving guests at the entrance and display promotions on a front ad screen.",
    frequency_per_day: 80,
    minutes_each: 1,
  },
  {
    id: "table_bussing",
    title: "Return cleared cups and plates from tables",
    zone_id: "tables",
    description:
      "Collect cleared tableware in a bussing tray and return it to the service pass.",
    frequency_per_day: 50,
    minutes_each: 2,
  },
  {
    id: "floor_vacuum",
    title: "After-hours floor vacuuming around counter & entry",
    zone_id: "waiting_area",
    description:
      "Vacuum crumbs and dry dust across open café walkways after closing.",
    frequency_per_day: 4,
    minutes_each: 15,
  },
  {
    id: "espresso_barista",
    title: "Pull espresso shots & steam latte art manually",
    zone_id: "counter",
    description:
      "Operate the espresso machine, steam milk, and hand-craft specialty beverages.",
    frequency_per_day: 90,
    minutes_each: 2,
  },
];

export const demoMeta = {
  businessType: "Tight Café / Bistro (Narrow Aisles ~55 cm)",
  hoursPerWeek: 56,
  hourlyCost: 9.24,
} as const;
