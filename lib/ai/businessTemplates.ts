import type { ZoneType } from "./zoneTasks";
import { findPreset, isAutoDetect } from "./businessPresets";

/**
 * Task templates per business kind (local analysis only; the model just reports zones). `{zone}` in a title/desc is replaced by the
 * REAL zone label. Frequencies are defaults for a ~60 h/week business, scaled by opening hours — assumptions, not measured data.
 * "no" tasks are the physical ones K1 cannot do (no hands).
 */
export type Fit = "good" | "partial" | "no";
export type Template = { key: string; title: string; desc: string; perDay: number; minutes: number; fit: Fit; why?: string };
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
  | "generic";

/** Order matters: the first match wins (electronics/mall before car showroom, hotel before university "lobby" etc.). EN / LV / RU keywords. */
const DETECT: [BusinessKind, RegExp][] = [
  ["retail", /electronics|appliance|tech\s*store|elektronik|электроник/i],
  ["mall", /shopping\s*(mall|centre|center)|\bmall\b|atrium|tirdzniec[iī]bas\s*centr|торгов\w*\s*центр/i],
  ["showroom", /showroom|dealer|dealership|d[iī]ler|car\s*(sales|shop|salon|centre|center)|auto\s*(salon|centre|center|sales|house)|\bauto\b|autosal|automobil|\bcars?\b|motor|vehicle|автосалон|автодилер|автомобил|машин|дилер|салон\s*авто/i],
  ["hotel", /hotel|hostel|motel|resort|guest\s*house|viesn[iī]c|naktsm[iī]t|otel|отел|гостиниц|хостел/i],
  ["gym", /\bgym\b|fitness|crossfit|workout|health\s*club|sporta\s*klub|фитнес|тренажер/i],
  ["event", /conference|\bexpo\b|convention|event\s*venue|summit|congress|konferenc|izst[aā]d|выставк|конференц/i],
  ["museum", /museum|gallery|exhibit|art\s*space|muzej|galerij|музей|галере/i],
  ["terminal", /airport|train\s*terminal|railway|bus\s*terminal|\bterminal\b|station|lidost|stacij|аэропорт|вокзал/i],
  ["library", /librar|bibliot[eē]k|библиотек/i],
  ["university", /universit|college|school|campus|augstskol|skol[aā]|universit[aā]t|универс|институт|школ|колледж|вуз/i],
  ["clinic", /clinic|dental|dentist|medical|doctor|hospital|k[lļ][iī]nik|zobārst|poliklīn|клиник|стоматолог|больниц|поликлиник/i],
  ["restaurant", /restaurant|bistro|eatery|diner|restor[aā]n|ресторан|бистро|трактир/i],
  ["bar", /\bbar\b|lounge|\bpub\b|nightclub|cocktail|b[aā]rs\b|\bбар\b|паб/i],
  ["cafe", /caf[eé]|coffee|bakery|canteen|kafejn[iī]c|k[aā]фе|кафе|кофе|пекарн|столов/i],
  ["supermarket", /supermarket|grocery|hypermarket|food\s*store|veikals\s*maxima|rimi|супермаркет|продукт/i],
  ["retail", /retail|shop|store|boutique|market|pharmacy|veikal|aptiek|магазин|аптек|бутик/i],
  ["office", /office|reception|bank|coworking|birojs|rec[eē]pcij|ofis|офис|ресепш|приём|приемн|банк/i],
];

/** Contains-matching on the owner's text (EN/LV/RU synonyms, e.g. "Autodealer", "car salon", "viesnīca", "автодилер"). */
export function detectBusiness(businessType: string | null | undefined, hints: string[] = []): BusinessKind {
  const t = (businessType ?? "").trim();
  if (!t || isAutoDetect(t)) return inferFromHints(hints);
  const preset = findPreset(t); // a selector preset knows its family exactly
  if (preset) return preset.family;
  const direct = DETECT.find(([, re]) => re.test(t))?.[0];
  if (direct) return direct;
  return inferFromHints(hints);
}

/** Unknown business type: guess from what the model saw (zone labels, activities). Several hits needed unless the word is unambiguous. */
const HINTS: [BusinessKind, RegExp][] = [
  ["showroom", /\b(cars?|vehicles?|automobiles?|showroom|test.?drive|dealer\w*)\b/i],
  ["library", /\b(books?|library|readers?|reading|librarian)\b/i],
  ["gym", /\b(treadmills?|dumbbells?|weights?|workout|gym|fitness|lockers?)\b/i],
  ["event", /\b(auditorium|registration|conference|expo|stage|badges?|keynote)\b/i],
  ["museum", /\b(paintings?|sculptures?|gallery|museum|exhibit\w*|artwork)\b/i],
  ["terminal", /\b(departures?|boarding|gates?|platforms?|airport|terminal|trains?)\b/i],
  ["clinic", /\b(patients?|dental|dentist|doctors?|nurses?|clinic|treatment rooms?)\b/i],
  ["supermarket", /\b(groceries|grocery|supermarket|aisles?|shopping carts?|trolleys?)\b/i],
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

const T = (key: string, title: string, desc: string, perDay: number, minutes: number, fit: Fit, why?: string): Template => ({ key, title, desc, perDay, minutes, fit, ...(why ? { why } : {}) });
type Set = Partial<Record<ZoneType, Template[]>>;

const GENERIC: Record<ZoneType, Template[]> = {
  entrance: [T("greet", "Greet visitors at {zone}", "Welcome people at {zone} and tell them where to go.", 80, 0.5, "good")],
  counter: [
    T("explain", "Answer questions at {zone}", "Answer repeated questions about products, prices and offers at {zone}.", 45, 1.5, "good"),
    T("carry", "Carry items from {zone} to visitors", "Bring items from {zone} to where people are.", 35, 2, "no"),
  ],
  seating: [
    T("seat", "Guide visitors to {zone}", "Show arriving guests to a free place in {zone}.", 40, 1, "good"),
    T("tidy", "Tidy and wipe {zone}", "Clear and wipe surfaces in {zone}.", 50, 2.5, "no"),
  ],
  display: [T("present", "Present offers at {zone}", "Point out and explain what is shown at {zone}.", 30, 1.5, "good")],
  waiting: [T("queue", "Give waiting info at {zone}", "Tell people in {zone} how long they wait and what happens next.", 35, 1, "good")],
  shelves: [
    T("where", "Answer 'where is it' at {zone}", "Point visitors to items at {zone}.", 25, 1, "good"),
    T("restock", "Restock {zone}", "Carry and arrange goods at {zone}.", 6, 20, "no"),
  ],
  desk: [T("checkin", "Answer questions at {zone}", "Handle repeated questions and check-in at {zone}.", 40, 2, "partial", "K1 can talk and point, but cannot handle documents, keys or payments.")],
  corridor: [T("way", "Guide visitors via {zone}", "Show people the way through {zone}.", 30, 1, "good")],
  other: [T("ask", "Answer questions near {zone}", "Respond to repeated questions near {zone}.", 20, 1, "partial")],
};

const SETS: Record<Exclude<BusinessKind, "generic">, Set> = {
  cafe: {
    entrance: [T("greet", "Greet guests at {zone}", "Welcome guests at {zone}.", 80, 0.5, "good")],
    counter: [
      T("explain", "Explain menu and offers at {zone}", "Answer repeated questions about drinks, food and offers at {zone}.", 45, 1.5, "good"),
      T("carry", "Carry orders from {zone} to tables", "Bring finished drinks and food from {zone} to guests.", 35, 2, "no"),
    ],
    seating: [
      T("seat", "Guide guests to a free table in {zone}", "Show arriving guests to a free table in {zone}.", 40, 1, "good"),
      T("tidy", "Clear and wipe tables in {zone}", "Remove dishes and wipe tables in {zone}.", 50, 2.5, "no"),
    ],
    display: [T("present", "Present today's specials at {zone}", "Point out and explain specials and the menu at {zone}.", 30, 1.5, "good")],
  },
  hotel: {
    entrance: [
      T("greet", "Greet guests at {zone}", "Welcome arriving guests at {zone}.", 60, 0.5, "good"),
      T("luggage", "Carry luggage from {zone} to rooms", "Take guests' bags from {zone} to their rooms.", 25, 6, "no"),
    ],
    corridor: [T("way", "Guide guests to elevators via {zone}", "Show guests the way to reception, elevators and rooms through {zone}.", 40, 1, "good")],
    counter: [T("reception", "Guide guests to reception at {zone}", "Direct arriving guests to {zone} and explain the check-in steps.", 50, 1, "good")],
    desk: [T("reception", "Answer check-in questions at {zone}", "Answer repeated check-in and check-out questions at {zone}.", 45, 2, "partial", "K1 can talk and point, but cannot handle keys, cards or documents.")],
    display: [T("amenities", "Explain breakfast and amenities at {zone}", "Explain breakfast hours, spa and other amenities shown at {zone}.", 35, 1.5, "good")],
    waiting: [T("queue", "Give check-in wait information at {zone}", "Tell guests in {zone} how long the wait is.", 25, 1, "good")],
    seating: [
      T("lounge", "Tell guests about lounge hours at {zone}", "Explain lounge and bar opening hours to guests in {zone}.", 20, 1, "good"),
      T("tidy", "Tidy cushions and tables in {zone}", "Straighten furniture and clear cups in {zone}.", 30, 3, "no"),
    ],
    shelves: [T("restock", "Restock brochures at {zone}", "Refill brochures and supplies at {zone}.", 4, 10, "no")],
  },
  showroom: {
    entrance: [T("greet", "Greet visitors at {zone}", "Welcome visitors at {zone}.", 40, 0.5, "good")],
    display: [
      T("offers", "Present current offers at {zone}", "Point out the cars and current offers shown at {zone}.", 30, 2, "good"),
      T("polish", "Wipe and polish cars at {zone}", "Clean and polish the cars at {zone}.", 3, 20, "no"),
    ],
    waiting: [T("guide", "Guide visitors to {zone}", "Invite visitors to {zone} and tell them how long until a sales advisor is free.", 25, 1, "good")],
    seating: [
      T("guide", "Guide visitors to {zone}", "Invite visitors to {zone} while they wait for an advisor.", 25, 1, "good"),
      T("refresh", "Serve refreshments at {zone}", "Prepare and bring refreshments to waiting customers at {zone}.", 15, 3, "no"),
    ],
    desk: [T("testdrive", "Explain test-drive booking at {zone}", "Explain how to book a test drive and what to bring at {zone}.", 15, 2, "good")],
    counter: [T("testdrive", "Explain test-drive booking at {zone}", "Explain how to book a test drive at {zone}.", 15, 2, "good")],
    corridor: [T("way", "Guide visitors to the sales desk via {zone}", "Show visitors the way to the sales desk through {zone}.", 20, 1, "good")],
    shelves: [T("brochure", "Point out brochures at {zone}", "Show visitors the brochures and price lists at {zone}.", 15, 1, "good")],
  },
  retail: {
    entrance: [T("greet", "Greet shoppers at {zone}", "Welcome shoppers at {zone}.", 120, 0.5, "good")],
    display: [T("present", "Present promotions at {zone}", "Point out current promotions at {zone}.", 40, 1, "good")],
    shelves: [
      T("where", "Answer 'where can I find...' at {zone}", "Point shoppers to products at {zone}.", 40, 1, "good"),
      T("restock", "Restock shelves at {zone}", "Carry and arrange goods at {zone}.", 8, 20, "no"),
    ],
    counter: [
      T("loyalty", "Explain loyalty card at {zone}", "Explain the loyalty card and promotions at {zone}.", 40, 1, "good"),
      T("bag", "Pack purchases at {zone}", "Pack and hand over purchases at {zone}.", 60, 1, "no"),
    ],
    waiting: [T("queue", "Give queue information at {zone}", "Tell shoppers at {zone} which till is free.", 40, 0.5, "good")],
    corridor: [T("way", "Guide shoppers to departments via {zone}", "Show shoppers the way to departments through {zone}.", 30, 1, "good")],
    seating: [T("rest", "Point shoppers to {zone}", "Show shoppers where they can sit or try things at {zone}.", 15, 1, "good")],
  },
  library: {
    entrance: [T("greet", "Greet and orient visitors at {zone}", "Welcome readers at {zone} and explain where things are.", 70, 0.5, "good")],
    corridor: [T("way", "Guide readers to sections via {zone}", "Show readers the way to book sections through {zone}.", 40, 1, "good")],
    shelves: [
      T("where", "Guide readers to sections at {zone}", "Point readers to the right section and shelf at {zone}.", 40, 1, "good"),
      T("reshelve", "Reshelve books at {zone}", "Return books to the right shelves at {zone}.", 15, 10, "no"),
    ],
    desk: [T("selfservice", "Explain self-service return at {zone}", "Explain how to borrow and return books by self-service at {zone}.", 40, 1, "good")],
    counter: [T("selfservice", "Explain self-service return at {zone}", "Explain how to borrow and return books by self-service at {zone}.", 40, 1, "good")],
    seating: [
      T("quiet", "Announce quiet hours in {zone}", "Remind readers in {zone} of quiet hours and closing time.", 12, 0.5, "good"),
      T("tidy", "Tidy reading tables in {zone}", "Straighten chairs and clear tables in {zone}.", 20, 5, "no"),
    ],
    display: [T("present", "Present new arrivals at {zone}", "Tell visitors about new books and events shown at {zone}.", 20, 1, "good")],
    waiting: [T("queue", "Give queue information at {zone}", "Tell people in {zone} where to queue.", 15, 1, "good")],
  },
  office: {
    entrance: [T("greet", "Greet visitors at {zone}", "Welcome visitors at {zone}.", 50, 0.5, "good")],
    desk: [
      T("checkin", "Explain visitor check-in at {zone}", "Explain the check-in steps to visitors at {zone}.", 40, 1.5, "good"),
      T("badge", "Hand out visitor badges at {zone}", "Print and hand over badges at {zone}.", 40, 1, "no"),
    ],
    counter: [T("checkin", "Explain visitor check-in at {zone}", "Explain the check-in steps to visitors at {zone}.", 40, 1.5, "good")],
    waiting: [T("queue", "Tell visitors the wait at {zone}", "Tell visitors in {zone} how long until their host is ready.", 30, 1, "good")],
    corridor: [T("way", "Guide visitors to meeting rooms via {zone}", "Show visitors the way to meeting rooms through {zone}.", 35, 1.5, "good")],
    seating: [T("seat", "Invite visitors to sit in {zone}", "Show visitors where to wait comfortably in {zone}.", 25, 0.5, "good")],
    display: [T("present", "Present company information at {zone}", "Explain the company and its services shown at {zone}.", 12, 1.5, "good")],
    shelves: [T("mail", "Sort post and parcels at {zone}", "Sort incoming post and parcels at {zone}.", 10, 5, "no")],
  },
  university: {
    entrance: [T("greet", "Greet students and visitors at {zone}", "Welcome students and visitors at {zone}.", 120, 0.5, "good")],
    corridor: [T("way", "Guide visitors to lecture halls via {zone}", "Show visitors the way to lecture halls and offices through {zone}.", 60, 1, "good")],
    desk: [T("enquiry", "Answer room and schedule questions at {zone}", "Answer repeated questions about rooms and schedules at {zone}.", 60, 1.5, "partial", "K1 can answer and point, but cannot look up or hand over documents.")],
    counter: [T("enquiry", "Answer room and schedule questions at {zone}", "Answer repeated questions about rooms and schedules at {zone}.", 50, 1.5, "partial", "K1 can answer and point, but cannot look up or hand over documents.")],
    display: [T("events", "Present today's events at {zone}", "Tell people about today's events shown at {zone}.", 30, 1, "good")],
    waiting: [T("queue", "Tell visitors where to queue at {zone}", "Explain where and how to queue in {zone}.", 30, 1, "good")],
    seating: [
      T("announce", "Announce events in {zone}", "Announce events and room changes in {zone}.", 15, 0.5, "good"),
      T("chairs", "Set up chairs in {zone}", "Carry and arrange chairs in {zone}.", 4, 15, "no"),
    ],
    shelves: [T("flyers", "Hand out flyers at {zone}", "Hand out flyers and leaflets at {zone}.", 40, 0.5, "no")],
  },
  gym: {
    entrance: [T("greet", "Greet gym members at {zone}", "Welcome arriving members and trial visitors at {zone}.", 90, 0.5, "good")],
    counter: [
      T("checkin", "Explain membership check-in at {zone}", "Guide members through QR check-in and membership options at {zone}.", 55, 1, "good"),
      T("towels", "Hand out towels and keys at {zone}", "Distribute fresh towels and locker keys at {zone}.", 60, 1, "no"),
    ],
    display: [T("schedule", "Present class schedule at {zone}", "Point out group class times and studio locations at {zone}.", 35, 1, "good")],
    corridor: [T("way", "Guide members to studios via {zone}", "Show members the way to locker rooms and studios through {zone}.", 40, 1, "good")],
    seating: [
      T("lounge", "Share club rules and hours at {zone}", "Remind members in {zone} about sauna hours and recovery area etiquette.", 20, 1, "good"),
      T("weights", "Re-rack weights and tidy {zone}", "Collect equipment and wipe benches in {zone}.", 25, 4, "no"),
    ],
    waiting: [T("queue", "Give trainer wait info at {zone}", "Let trial guests in {zone} know when an instructor will meet them.", 25, 1, "good")],
    desk: [T("checkin", "Answer membership questions at {zone}", "Answer common questions about plans and classes at {zone}.", 40, 1.5, "partial", "K1 can explain plans and guide visitors, but cannot process cards or sign contracts.")],
    shelves: [T("restock", "Restock drinks and towels at {zone}", "Carry and restock bottles and towels at {zone}.", 6, 15, "no")],
  },
  event: {
    entrance: [T("greet", "Greet attendees at {zone}", "Welcome arriving attendees and speakers at {zone}.", 130, 0.5, "good")],
    desk: [
      T("reg", "Explain badge registration at {zone}", "Direct attendees to the right registration queue and QR check-in at {zone}.", 70, 1, "good"),
      T("badges", "Print and hand out lanyards at {zone}", "Print badges and hand lanyards to attendees at {zone}.", 80, 1, "no"),
    ],
    counter: [T("reg", "Explain registration steps at {zone}", "Explain registration queues and check-in steps at {zone}.", 70, 1, "good")],
    display: [T("agenda", "Present session schedule at {zone}", "Point out keynote times, room numbers and sponsors at {zone}.", 45, 1, "good")],
    corridor: [T("way", "Guide attendees to halls via {zone}", "Direct attendees toward auditoriums and breakout rooms through {zone}.", 65, 1, "good")],
    seating: [
      T("announce", "Announce upcoming sessions at {zone}", "Remind attendees in {zone} when the next keynote starts.", 20, 1, "good"),
      T("chairs", "Rearrange chairs and booths in {zone}", "Move chairs and set up event signage in {zone}.", 6, 15, "no"),
    ],
    waiting: [T("queue", "Manage registration queue info at {zone}", "Tell waiting attendees in {zone} which desk is fastest.", 45, 0.5, "good")],
    shelves: [T("swag", "Pack and hand out swag bags at {zone}", "Assemble and hand out conference bags at {zone}.", 30, 2, "no")],
  },
  museum: {
    entrance: [T("greet", "Greet museum visitors at {zone}", "Welcome arriving visitors at {zone} and orient them.", 80, 0.5, "good")],
    counter: [
      T("tickets", "Explain tickets and audio guides at {zone}", "Answer repeated questions about ticket tiers and audio guides at {zone}.", 45, 1.5, "good"),
      T("audio", "Hand out audio guide headsets at {zone}", "Sanitize and hand over audio guide devices at {zone}.", 40, 1, "no"),
    ],
    display: [T("highlights", "Present exhibition highlights at {zone}", "Point out featured collections and timed tours at {zone}.", 35, 1.5, "good")],
    corridor: [T("way", "Guide visitors to wings via {zone}", "Direct visitors to galleries, restrooms and exits through {zone}.", 45, 1, "good")],
    seating: [
      T("rules", "Share gallery etiquette at {zone}", "Politely remind visitors in {zone} about photo rules and closing times.", 20, 1, "good"),
      T("clean", "Wipe glass cases and tidy {zone}", "Clean display glass and tidy brochures in {zone}.", 10, 10, "no"),
    ],
    waiting: [T("queue", "Give timed-entry info at {zone}", "Inform waiting visitors in {zone} when the next tour enters.", 30, 1, "good")],
    desk: [T("tickets", "Answer exhibition questions at {zone}", "Answer common visitor questions about exhibits at {zone}.", 40, 1.5, "good")],
    shelves: [T("restock", "Restock catalogues at {zone}", "Carry and restock exhibition catalogues at {zone}.", 5, 12, "no")],
  },
  terminal: {
    entrance: [T("greet", "Greet travellers at {zone}", "Welcome arriving passengers at {zone} and orient them.", 150, 0.5, "good")],
    desk: [
      T("info", "Answer gate and transfer questions at {zone}", "Answer repeated passenger questions about terminals, gates and transit at {zone}.", 80, 1, "good"),
      T("luggage", "Assist with heavy luggage at {zone}", "Lift and transport passenger bags from {zone}.", 25, 4, "no"),
    ],
    counter: [T("info", "Explain check-in steps at {zone}", "Guide passengers to self-check-in kiosks and bag drop at {zone}.", 70, 1, "good")],
    display: [T("departures", "Point out departure updates at {zone}", "Direct passengers to live departure boards and boarding times at {zone}.", 50, 1, "good")],
    corridor: [T("way", "Guide passengers to gates via {zone}", "Show passengers the way to security, gates and platforms through {zone}.", 75, 1, "good")],
    waiting: [T("boarding", "Announce boarding reminders at {zone}", "Share friendly boarding and gate-change reminders at {zone}.", 30, 1, "good")],
    seating: [
      T("boarding", "Share gate reminders at {zone}", "Remind seated passengers in {zone} about security and boarding times.", 25, 1, "good"),
      T("tidy", "Clear trays and litter in {zone}", "Collect left-behind cups and tidy seating in {zone}.", 20, 5, "no"),
    ],
    shelves: [T("restock", "Restock transit maps at {zone}", "Refill printed timetables and maps at {zone}.", 5, 10, "no")],
  },
  restaurant: {
    entrance: [T("greet", "Greet diners at {zone}", "Welcome arriving diners at {zone}.", 90, 0.5, "good")],
    desk: [T("host", "Explain table wait and reservations at {zone}", "Tell arriving diners about reservations and the wait at {zone}.", 50, 1, "good")],
    counter: [
      T("menu", "Answer menu and allergen questions at {zone}", "Answer repeated questions about dishes, drinks and allergens at {zone}.", 40, 1.5, "good"),
      T("carry", "Carry dishes from {zone} to tables", "Bring plates and drinks from {zone} to the tables.", 60, 2, "no"),
    ],
    seating: [
      T("seat", "Guide diners to a free table in {zone}", "Show diners to a free table in {zone}.", 50, 1, "good"),
      T("reset", "Clear and reset tables in {zone}", "Clear plates and set the tables in {zone}.", 60, 3, "no"),
    ],
    display: [T("specials", "Present daily specials at {zone}", "Explain today's specials shown at {zone}.", 30, 1, "good")],
    waiting: [T("queue", "Give table wait information at {zone}", "Tell guests in {zone} how long until a table is free.", 40, 1, "good")],
    corridor: [T("way", "Guide diners to restrooms via {zone}", "Show diners the way to restrooms and exits through {zone}.", 20, 1, "good")],
    shelves: [T("restock", "Restock cutlery and napkins at {zone}", "Refill cutlery, napkins and condiments at {zone}.", 6, 8, "no")],
  },
  bar: {
    entrance: [T("greet", "Greet guests at {zone}", "Welcome arriving guests at {zone}.", 70, 0.5, "good")],
    counter: [
      T("menu", "Explain drinks menu and offers at {zone}", "Answer repeated questions about drinks, happy hour and offers at {zone}.", 45, 1.5, "good"),
      T("pour", "Pour and serve drinks from {zone}", "Prepare and hand over drinks at {zone}.", 90, 2, "no"),
    ],
    seating: [
      T("seat", "Guide guests to a free booth in {zone}", "Show guests to a free place in {zone}.", 30, 1, "good"),
      T("glasses", "Collect glasses in {zone}", "Collect empty glasses and wipe tables in {zone}.", 60, 3, "no"),
    ],
    display: [T("events", "Present event nights and specials at {zone}", "Announce events and drink specials shown at {zone}.", 25, 1, "good")],
    waiting: [T("queue", "Give queue information at {zone}", "Tell guests in {zone} how long the wait is.", 25, 1, "good")],
    desk: [T("book", "Answer reservation questions at {zone}", "Answer repeated booking questions at {zone}.", 20, 1.5, "partial", "K1 can answer, but cannot take bookings or payments.")],
    corridor: [T("way", "Guide guests to restrooms via {zone}", "Show guests the way through {zone}.", 20, 1, "good")],
  },
  supermarket: {
    entrance: [T("greet", "Greet shoppers at {zone}", "Welcome shoppers at {zone}.", 200, 0.5, "good")],
    display: [T("offers", "Announce weekly offers at {zone}", "Point out weekly offers and promotions shown at {zone}.", 50, 1, "good")],
    shelves: [
      T("where", "Answer 'where is it' questions at {zone}", "Point shoppers to products and aisles at {zone}.", 70, 1, "good"),
      T("restock", "Restock shelves at {zone}", "Carry and arrange goods at {zone}.", 10, 20, "no"),
    ],
    counter: [
      T("selfcheck", "Explain self-checkout steps at {zone}", "Explain how self-checkout and loyalty cards work at {zone}.", 60, 1, "good"),
      T("scan", "Scan and bag items at {zone}", "Scan, pack and hand over purchases at {zone}.", 120, 1, "no"),
    ],
    waiting: [T("queue", "Give queue information at {zone}", "Tell shoppers at {zone} which checkout is free.", 50, 0.5, "good")],
    corridor: [T("way", "Guide shoppers to departments via {zone}", "Show shoppers the way to departments through {zone}.", 40, 1, "good")],
    desk: [T("service", "Answer customer-service questions at {zone}", "Answer repeated questions about returns and opening hours at {zone}.", 30, 1.5, "partial", "K1 can answer, but cannot handle receipts, cash or cards.")],
  },
  mall: {
    entrance: [T("greet", "Greet visitors at {zone}", "Welcome visitors at {zone} and orient them.", 200, 0.5, "good")],
    desk: [
      T("directory", "Answer mall directory questions at {zone}", "Tell visitors where shops, toilets and parking are at {zone}.", 90, 1, "good"),
      T("maps", "Hand out maps and vouchers at {zone}", "Hand printed maps and vouchers to visitors at {zone}.", 40, 0.5, "no"),
    ],
    display: [T("stores", "Present store directory and promotions at {zone}", "Point out the store directory and promotions shown at {zone}.", 50, 1, "good")],
    corridor: [T("way", "Guide visitors to shops via {zone}", "Show visitors the way to shops and exits through {zone}.", 100, 1, "good")],
    seating: [
      T("events", "Announce events and opening hours in {zone}", "Announce events and opening hours to people in {zone}.", 20, 0.5, "good"),
      T("litter", "Clear litter in {zone}", "Collect litter and tidy {zone}.", 20, 5, "no"),
    ],
    counter: [T("info", "Answer visitor questions at {zone}", "Answer repeated visitor questions at {zone}.", 60, 1, "good")],
    waiting: [T("queue", "Give queue information at {zone}", "Tell people in {zone} where to queue.", 25, 1, "good")],
  },
  clinic: {
    entrance: [T("greet", "Greet patients at {zone}", "Welcome arriving patients at {zone}.", 60, 0.5, "good")],
    desk: [
      T("checkin", "Explain check-in steps at {zone}", "Explain how to check in and what to prepare at {zone}.", 50, 1.5, "good"),
      T("insurance", "Take insurance cards and payments at {zone}", "Scan insurance cards and take payments at {zone}.", 40, 2, "no"),
    ],
    counter: [T("checkin", "Explain check-in steps at {zone}", "Explain how to check in at {zone}.", 50, 1.5, "good")],
    waiting: [T("queue", "Give wait-time information at {zone}", "Tell patients in {zone} how long until their appointment.", 50, 1, "good")],
    corridor: [T("way", "Guide patients to treatment rooms via {zone}", "Show patients the way to treatment rooms through {zone}.", 40, 1, "good")],
    display: [T("services", "Present clinic services and hours at {zone}", "Explain services and opening hours shown at {zone}.", 15, 1, "good")],
    seating: [
      T("guidance", "Share waiting-room guidance in {zone}", "Remind patients in {zone} about forms and hygiene rules.", 20, 0.5, "good"),
      T("disinfect", "Disinfect chairs in {zone}", "Wipe and disinfect chairs in {zone}.", 15, 5, "no"),
    ],
    shelves: [T("leaflets", "Restock leaflets at {zone}", "Refill patient leaflets at {zone}.", 3, 8, "no")],
  },
};

/** Templates for a zone type in a business kind; a type the kind does not define falls back to the generic set. */
export function templatesFor(kind: BusinessKind, type: ZoneType): Template[] {
  if (kind === "generic") return GENERIC[type];
  return SETS[kind][type] ?? GENERIC[type];
}
export const genericBasics = (): Template[] => [GENERIC.entrance[0], GENERIC.corridor[0], GENERIC.display[0]];
