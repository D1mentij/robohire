import type { ZoneType } from "./zoneTasks";
import { findPreset, isAutoDetect } from "./businessPresets";

/**
 * Task templates per business kind (local analysis flow; Vision AI maps spatial zones).
 * `{zone}` in a title/desc is replaced by the real zone label.
 */
export type Fit = "good" | "partial" | "no";
export type Template = {
  key: string;
  title: string;
  desc: string;
  perDay: number;
  minutes: number;
  fit: Fit;
  why?: string;
};

export type BusinessKind =
  | "cafe"
  | "hotel"
  | "showroom"
  | "retail"
  | "library"
  | "office"
  | "university"
  | "gym"
  | "event"
  | "museum"
  | "terminal"
  | "restaurant"
  | "bar"
  | "supermarket"
  | "mall"
  | "clinic"
  | "warehouse"
  | "factory"
  | "generic";

/** Order matters: first match wins. EN / LV / RU keywords. */
const DETECT: [BusinessKind, RegExp][] = [
  [
    "warehouse",
    /warehouse|distribution|logistics|fulfillment|intralogistics|noliktav|loģistik|склад|логистик/i,
  ],
  [
    "factory",
    /factory|manufactur|production|assembly|industrial\s*plant|rūpnīc|ražošan|завод|фабрик|производств/i,
  ],
  ["retail", /electronics|appliance|tech\s*store|elektronik|электроник/i],
  [
    "mall",
    /shopping\s*(mall|centre|center)|\bmall\b|atrium|airport|tirdzniec[iī]bas\s*centr|lidost|торгов\w*\s*центр|аэропорт/i,
  ],
  [
    "showroom",
    /showroom|dealer|dealership|d[iī]ler|car\s*(sales|shop|salon|centre|center)|auto\s*(salon|centre|center|sales|house)|\bauto\b|autosal|automobil|\bcars?\b|motor|vehicle|автосалон|автодилер|автомобил|машин|дилер|салон\s*авто/i,
  ],
  [
    "hotel",
    /hotel|hostel|motel|resort|guest\s*house|viesn[iī]c|naktsm[iī]t|otel|отел|гостиниц|хостел/i,
  ],
  [
    "gym",
    /\bgym\b|fitness|crossfit|workout|health\s*club|sporta\s*klub|фитнес|тренажер/i,
  ],
  [
    "event",
    /conference|\bexpo\b|convention|event\s*venue|summit|congress|konferenc|izst[aā]d|выставк|конференц/i,
  ],
  ["museum", /museum|gallery|exhibit|art\s*space|muzej|galerij|музей|галере/i],
  [
    "terminal",
    /train\s*terminal|railway|bus\s*terminal|\bterminal\b|station|stacij|вокзал/i,
  ],
  ["library", /librar|bibliot[eē]k|библиотек/i],
  [
    "university",
    /universit|college|school|campus|augstskol|skol[aā]|universit[aā]t|универс|институт|школ|колледж|вуз/i,
  ],
  [
    "clinic",
    /clinic|dental|dentist|medical|doctor|hospital|k[lļ][iī]nik|zobārst|poliklīn|клиник|стоматолог|больниц|поликлиник/i,
  ],
  [
    "cafe",
    /narrow.*caf[eé]|tight\s*caf[eé]|caf[eé]|coffee|bakery|canteen|kafejn[iī]c|k[aā]фе|кафе|кофе|пекарн|столов/i,
  ],
  [
    "restaurant",
    /restaurant|food\s*hall|bistro|eatery|diner|restor[aā]n|ресторан|бистро|трактир/i,
  ],
  ["bar", /\bbar\b|lounge|\bpub\b|nightclub|cocktail|b[aā]rs\b|\bбар\b|паб/i],
  [
    "supermarket",
    /supermarket|grocery|hypermarket|food\s*store|veikals\s*maxima|rimi|супермаркет|продукт/i,
  ],
  [
    "retail",
    /retail|shop|store|boutique|market|pharmacy|veikal|aptiek|магазин|аптек|бутик/i,
  ],
  [
    "office",
    /office|tower|reception|bank|coworking|birojs|rec[eē]pcij|ofis|офис|ресепш|приём|приемн|банк/i,
  ],
];

export function detectBusiness(
  businessType: string | null | undefined,
  hints: string[] = [],
): BusinessKind {
  const t = (businessType ?? "").trim();
  if (!t || isAutoDetect(t)) return inferFromHints(hints);
  const preset = findPreset(t);
  if (preset) return preset.family;
  const direct = DETECT.find(([, re]) => re.test(t))?.[0];
  if (direct) return direct;
  return inferFromHints(hints);
}

const HINTS: [BusinessKind, RegExp][] = [
  ["warehouse", /\b(pallets?|forklifts?|racks?|loading\s*dock|warehouse|inbound|outbound)\b/i],
  ["factory", /\b(assembly|conveyor|cnc|machines?|manufacturing|production\s*line)\b/i],
  ["showroom", /\b(cars?|vehicles?|automobiles?|showroom|test.?drive|dealer\w*)\b/i],
  ["library", /\b(books?|library|readers?|reading|librarian)\b/i],
  ["gym", /\b(treadmills?|dumbbells?|weights?|workout|gym|fitness|lockers?)\b/i],
  ["event", /\b(auditorium|registration|conference|expo|stage|badges?|keynote)\b/i],
  ["museum", /\b(paintings?|sculptures?|gallery|museum|exhibit\w*|artwork)\b/i],
  ["terminal", /\b(departures?|boarding|gates?|platforms?|airport|terminal|trains?)\b/i],
  ["clinic", /\b(patients?|dental|dentist|doctors?|nurses?|clinic|treatment rooms?)\b/i],
  ["supermarket", /\b(groceries|grocery|supermarket|shopping carts?|trolleys?)\b/i],
  ["mall", /\b(mall|atrium|storefronts?|escalators?)\b/i],
  ["bar", /\b(bartenders?|cocktails?|beer|pub|nightclub)\b/i],
  ["cafe", /\b(barista|coffee|espresso|latte|caf[eé]|pastr\w+)\b/i],
  ["restaurant", /\b(waiters?|waitress|diners?|dining|chefs?|kitchen|menu)\b/i],
  ["hotel", /\b(hotel|luggage|elevators?|check-?in|concierge|guests?)\b/i],
  ["retail", /\b(shoppers?|cashier|checkout|store|boutique|clothes|fitting\s*rooms?)\b/i],
  ["office", /\b(office|meeting rooms?|employees?|visitor badges?)\b/i],
];

export function inferFromHints(hints: string[]): BusinessKind {
  const text = hints.join(" \n ");
  return HINTS.find(([, re]) => re.test(text))?.[0] ?? "generic";
}

const T = (
  key: string,
  title: string,
  desc: string,
  perDay: number,
  minutes: number,
  fit: Fit,
  why?: string,
): Template => ({
  key,
  title,
  desc,
  perDay,
  minutes,
  fit,
  ...(why ? { why } : {}),
});
type Set = Partial<Record<ZoneType, Template[]>>;

const GENERIC: Record<ZoneType, Template[]> = {
  entrance: [
    T("greet", "Greet visitors at {zone}", "Welcome arriving visitors at {zone} and guide them.", 80, 1, "good"),
  ],
  counter: [
    T("explain", "Assist visitors at {zone}", "Display offers and answer common questions at {zone}.", 45, 2, "good"),
    T("carry", "Shuttle trays from {zone}", "Deliver prepared trays from {zone} across the room.", 35, 2, "good"),
  ],
  seating: [
    T("seat", "Escort guests to {zone}", "Guide arriving guests toward available seating in {zone}.", 40, 1, "good"),
    T("tidy", "Manual table reset in {zone}", "Wipe tabletops and rearrange chairs in {zone}.", 50, 3, "no"),
  ],
  display: [
    T("present", "Present offers at {zone}", "Highlight promotions and wayfinding info at {zone}.", 30, 2, "good"),
  ],
  waiting: [
    T("queue", "Share queue updates at {zone}", "Keep waiting visitors informed at {zone}.", 35, 1, "good"),
  ],
  shelves: [
    T("where", "Guide visitors to {zone}", "Escort visitors to specific sections at {zone}.", 25, 1, "good"),
    T("restock", "Manual shelf restocking at {zone}", "Unbox and place individual items onto shelves at {zone}.", 6, 20, "no"),
  ],
  desk: [
    T("checkin", "Assist check-in at {zone}", "Provide video telepresence and FAQ guidance at {zone}.", 40, 2, "partial", "Greeter/telepresence bots handle check-in guidance, while staff verify IDs or keys."),
  ],
  corridor: [
    T("way", "Autonomous floor scrubbing in {zone}", "Scrub and vacuum open walkways along {zone}.", 12, 10, "good"),
  ],
  other: [
    T("ask", "Floor vacuuming near {zone}", "Run scheduled commercial vacuum passes around {zone}.", 10, 8, "good"),
  ],
};

const SETS: Record<Exclude<BusinessKind, "generic">, Set> = {
  cafe: {
    entrance: [T("greet", "Greet café guests at {zone}", "Welcome guests and display daily pastry offers at {zone}.", 80, 1, "good")],
    counter: [
      T("carry", "Deliver coffee & pastry trays from {zone}", "Run orders on compact 55 cm tray bots from {zone} to tables.", 55, 2, "good"),
      T("barista", "Pull espresso shots at {zone}", "Steam milk and prepare specialty drinks behind {zone}.", 90, 2, "no"),
    ],
    seating: [
      T("bus", "Bus cleared dishes from {zone}", "Return used cups and plates from {zone} to the service counter.", 45, 2, "good"),
      T("wipe", "Wipe sticky tabletops in {zone}", "Sanitize tabletops and tuck tight café chairs in {zone}.", 45, 2, "no"),
    ],
    display: [T("present", "Showcase specials near {zone}", "Display combo promotions at {zone}.", 30, 2, "good")],
  },
  restaurant: {
    entrance: [T("greet", "Greet & escort diners from {zone}", "Welcome diners at {zone} and escort them to tables.", 90, 1, "good")],
    desk: [T("host", "Manage reception greeting at {zone}", "Greet reservations and display wait info at {zone}.", 50, 1, "good")],
    counter: [
      T("carry", "Run multi-tray food orders from {zone}", "Deliver up to 40 kg of plates from {zone} to dining tables.", 85, 2, "good"),
    ],
    seating: [
      T("bus", "Return dirty dishes from {zone}", "Shuttle bussing tubs from {zone} back to the dish-pit.", 70, 3, "good"),
      T("reset", "Set cutlery and glassware in {zone}", "Polish glasses and lay fresh table settings in {zone}.", 60, 3, "no"),
    ],
    display: [T("specials", "Display chef specials at {zone}", "Promote daily menu highlights near {zone}.", 30, 1, "good")],
    corridor: [T("clean", "Scrub dining walkways via {zone}", "4-in-1 floor scrubbing and vacuuming after service in {zone}.", 6, 15, "good")],
  },
  bar: {
    entrance: [T("greet", "Welcome lounge guests at {zone}", "Greet guests and promote happy-hour specials at {zone}.", 70, 1, "good")],
    counter: [
      T("carry", "Shuttle drink trays from {zone}", "Deliver appetizer and bottle trays from {zone} to booths.", 55, 2, "good"),
      T("pour", "Mix cocktails behind {zone}", "Bartend and pour draft drinks at {zone}.", 90, 2, "no"),
    ],
    seating: [
      T("glasses", "Return empty glassware from {zone}", "Bus cleared glasses from {zone} in a bussing tub.", 60, 2, "good"),
    ],
  },
  hotel: {
    entrance: [
      T("greet", "Welcome arriving hotel guests at {zone}", "Greet guests at {zone} and guide them to reception.", 60, 1, "good"),
      T("luggage", "Load oversized suitcases onto bell carts at {zone}", "Lift heavy 30 kg+ guest trunks up steps at {zone}.", 25, 6, "no"),
    ],
    corridor: [
      T("courier", "Enclosed room-service delivery via {zone}", "Call elevators autonomously via {zone} to deliver amenities to guest floors.", 45, 4, "good"),
    ],
    counter: [T("reception", "Reception telepresence & concierge at {zone}", "Answer breakfast, Wi-Fi, and spa FAQs at {zone}.", 50, 2, "good")],
    seating: [
      T("clean", "Vacuum & scrub lobby floors around {zone}", "4-in-1 carpet vacuuming and hard-floor scrubbing around {zone}.", 8, 15, "good"),
    ],
    display: [T("amenities", "Display breakfast & spa hours at {zone}", "Promote hotel amenities on screen near {zone}.", 35, 2, "good")],
  },
  office: {
    entrance: [T("greet", "Visitor reception & telepresence at {zone}", "Greet corporate guests and call hosts via video screen at {zone}.", 50, 1, "good")],
    desk: [
      T("checkin", "Guide visitor check-in at {zone}", "Walk visitors through digital sign-in at {zone}.", 40, 2, "good"),
      T("badge", "Encode physical security cards at {zone}", "Verify passports and issue metal keys at {zone}.", 30, 2, "no"),
    ],
    corridor: [
      T("courier", "Multi-floor mail & parcel courier via {zone}", "Deliver enclosed documents and parcels across office floors via {zone}.", 35, 4, "good"),
    ],
    waiting: [T("clean", "Vacuum office carpets in {zone}", "Scheduled quiet commercial vacuuming across {zone}.", 6, 15, "good")],
  },
  clinic: {
    entrance: [T("greet", "Patient greeting & wayfinding at {zone}", "Welcome patients and guide them toward check-in from {zone}.", 60, 1, "good")],
    desk: [
      T("checkin", "Explain appointment check-in at {zone}", "Provide multilingual check-in info at {zone}.", 50, 2, "good"),
      T("insurance", "Verify medical IDs & copays at {zone}", "Process health insurance paperwork at {zone}.", 40, 2, "no"),
    ],
    corridor: [
      T("samples", "Enclosed lab sample & supply courier via {zone}", "Deliver sealed clinic supplies between floors via {zone}.", 30, 4, "good"),
    ],
    waiting: [T("clean", "Scrub & sanitize waiting floor in {zone}", "Automated wet scrubbing of hard clinic floors in {zone}.", 8, 12, "good")],
  },
  retail: {
    entrance: [T("greet", "Greet shoppers & display promos at {zone}", "Attract foot traffic with front ad-screen offers at {zone}.", 120, 1, "good")],
    display: [T("present", "Promote seasonal deals at {zone}", "Showcase featured items on mobile ad display near {zone}.", 45, 1, "good")],
    shelves: [
      T("where", "Escort shoppers to aisles at {zone}", "Lead customers directly to requested product sections at {zone}.", 45, 1, "good"),
      T("restock", "Unbox & hang garments on {zone}", "Attach security tags and hang individual items on {zone}.", 8, 20, "no"),
    ],
    counter: [T("clean", "After-hours floor scrubbing near {zone}", "Vacuum and scrub retail aisles around {zone}.", 6, 15, "good")],
  },
  showroom: {
    entrance: [T("greet", "Welcome showroom visitors at {zone}", "Greet customers and connect remote advisors via screen at {zone}.", 40, 1, "good")],
    display: [
      T("offers", "Present specs & financing promos at {zone}", "Display vehicle/product specs next to {zone}.", 30, 2, "good"),
      T("polish", "Hand-detail & polish vehicles at {zone}", "Buff paintwork and wipe interiors inside {zone}.", 3, 20, "no"),
    ],
    seating: [T("clean", "Scrub showroom tile floors around {zone}", "Keep high-gloss showroom floors spotless near {zone}.", 6, 15, "good")],
    desk: [T("testdrive", "Guide visitors to sales desk at {zone}", "Escort buyers to {zone} for test-drive signing.", 20, 2, "good")],
  },
  supermarket: {
    entrance: [T("greet", "Display weekly flyers at {zone}", "Show digital promotions to entering shoppers at {zone}.", 150, 1, "good")],
    shelves: [
      T("where", "Escort shoppers to grocery aisles at {zone}", "Guide customers to items along {zone}.", 70, 1, "good"),
      T("restock", "Hand-stack produce onto {zone}", "Rotate perishables and stack shelves at {zone}.", 12, 20, "no"),
    ],
    corridor: [T("scrub", "Heavy floor scrubbing along {zone}", "Autonomous multi-shift scrubbing of wide grocery aisles in {zone}.", 12, 20, "good")],
  },
  mall: {
    entrance: [T("greet", "Greet visitors & store directory at {zone}", "Provide interactive wayfinding and ad campaigns at {zone}.", 180, 1, "good")],
    corridor: [
      T("scrub", "24/7 autonomous concourse scrubbing in {zone}", "Scrub 5,000–8,000 m² mall/airport concourse floors along {zone}.", 18, 25, "good"),
    ],
    desk: [
      T("info", "Passenger / shopper telepresence at {zone}", "Answer directory and gate questions via screen at {zone}.", 80, 1, "good"),
    ],
    seating: [
      T("litter", "Empty trash bins in {zone}", "Remove bulky food-court bags from bins in {zone}.", 20, 5, "no"),
    ],
  },
  terminal: {
    entrance: [T("greet", "Passenger wayfinding at {zone}", "Direct travellers to check-in and gates from {zone}.", 150, 1, "good")],
    corridor: [
      T("scrub", "24/7 terminal concourse scrubbing in {zone}", "Continuous autonomous industrial floor scrubbing across {zone}.", 20, 25, "good"),
    ],
    desk: [
      T("info", "Multilingual gate info at {zone}", "Answer transit and gate queries at {zone}.", 80, 1, "good"),
      T("luggage", "Lift oversized baggage at {zone}", "Check and tag heavy passenger bags at {zone}.", 25, 4, "no"),
    ],
  },
  warehouse: {
    entrance: [
      T("amr_inbound", "Shuttle 250–300 kg pallets from {zone}", "Autonomous AMR transport from {zone} to storage racks.", 65, 4, "good"),
    ],
    corridor: [
      T("amr_lane", "Intralogistics AMR corridor runs via {zone}", "Continuous trackless pallet & cage transport through ≥1,450 mm {zone}.", 80, 4, "good"),
      T("scrub", "Industrial warehouse floor scrubbing in {zone}", "Autonomous scrubbing of dust and tire marks along {zone}.", 10, 20, "good"),
    ],
    shelves: [
      T("high_reach", "High-bay reach-truck stacking at {zone}", "Lift 1,000 kg pallets onto 6-meter upper racking at {zone}.", 20, 8, "no"),
    ],
    desk: [
      T("dispatch", "Deliver picked totes to {zone}", "Drop order cages at {zone} for outbound packing.", 55, 3, "good"),
    ],
  },
  factory: {
    entrance: [
      T("raw_amr", "Transport raw components from {zone}", "Autonomous 250–300 kg AMR delivery from {zone} to assembly cells.", 70, 4, "good"),
    ],
    corridor: [
      T("line_amr", "Line-side kitting AMR shuttle via {zone}", "Just-in-time part cart delivery along {zone} (≤20 mm threshold).", 90, 4, "good"),
      T("scrub", "Multi-shift factory floor scrubbing in {zone}", "Heavy autonomous scrubbing of production aisles in {zone}.", 12, 20, "good"),
    ],
    desk: [
      T("qa_drop", "Shuttle sub-assemblies to {zone}", "Deliver completed trays to {zone} for quality inspection.", 50, 3, "good"),
    ],
    shelves: [
      T("tooling", "Precision CNC tool changeover at {zone}", "Calibrate fixtures and torque bolts manually at {zone}.", 12, 15, "no"),
    ],
  },
  gym: {
    entrance: [T("greet", "Member greeting & promo screen at {zone}", "Welcome members and showcase personal-training promos at {zone}.", 90, 1, "good")],
    corridor: [T("clean", "4-in-1 scrubbing & vacuuming in {zone}", "Automated daily sweeping, scrubbing, and vacuuming of {zone}.", 10, 15, "good")],
    seating: [
      T("lounge", "Vacuum recovery lounge at {zone}", "Keep carpet and rubber mats dust-free in {zone}.", 8, 12, "good"),
      T("weights", "Re-rack 40 kg dumbbells in {zone}", "Pick up free weights from the floor and rack them in {zone}.", 25, 4, "no"),
    ],
    counter: [T("checkin", "Membership FAQ screen at {zone}", "Answer class schedule and plan questions at {zone}.", 45, 1, "good")],
  },
  library: {
    entrance: [T("greet", "Orient readers at {zone}", "Welcome visitors and guide them to reading halls from {zone}.", 70, 1, "good")],
    shelves: [
      T("where", "Escort readers to {zone}", "Guide visitors to catalog sections at {zone}.", 40, 1, "good"),
      T("reshelve", "Slot individual books onto {zone}", "Sort and shelve returned books alphabetically at {zone}.", 15, 10, "no"),
    ],
    corridor: [T("clean", "Quiet commercial vacuuming in {zone}", "Low-noise floor vacuuming along {zone}.", 6, 15, "good")],
  },
  university: {
    entrance: [T("greet", "Campus visitor wayfinding at {zone}", "Welcome students and guests via interactive screen at {zone}.", 120, 1, "good")],
    corridor: [T("clean", "Hallway floor scrubbing via {zone}", "Autonomous scrubbing of high-traffic campus corridors in {zone}.", 10, 18, "good")],
    display: [T("events", "Display lecture & event schedule at {zone}", "Highlight room changes and events near {zone}.", 35, 1, "good")],
    seating: [T("chairs", "Stack lecture chairs in {zone}", "Rearrange heavy hall seating manually in {zone}.", 4, 15, "no")],
  },
  event: {
    entrance: [T("greet", "Welcome conference attendees at {zone}", "Display sponsor promos and guide badge pickup from {zone}.", 130, 1, "good")],
    corridor: [T("clean", "Scrub expo concourse in {zone}", "Autonomous floor scrubbing between keynote sessions in {zone}.", 10, 18, "good")],
    display: [T("agenda", "Present live stage agenda at {zone}", "Highlight upcoming tracks on mobile ad screen at {zone}.", 45, 1, "good")],
    shelves: [T("swag", "Assemble conference swag bags at {zone}", "Pack lanyards and brochures manually at {zone}.", 30, 2, "no")],
  },
  museum: {
    entrance: [T("greet", "Greet gallery visitors at {zone}", "Welcome visitors and preview exhibits on screen at {zone}.", 80, 1, "good")],
    corridor: [T("clean", "Scrub & vacuum gallery wing {zone}", "After-hours automated floor care across {zone}.", 8, 15, "good")],
    display: [T("highlights", "Showcase exhibition highlights at {zone}", "Guide tours past {zone}.", 35, 2, "good")],
    seating: [T("clean_glass", "Hand-clean delicate display cases in {zone}", "Polish curatorial glass enclosures in {zone}.", 10, 10, "no")],
  },
};

export function templatesFor(kind: BusinessKind, type: ZoneType): Template[] {
  if (kind === "generic") return GENERIC[type];
  return SETS[kind][type] ?? GENERIC[type];
}

export const genericBasics = (): Template[] => [
  GENERIC.entrance[0],
  GENERIC.corridor[0],
  GENERIC.display[0],
];
