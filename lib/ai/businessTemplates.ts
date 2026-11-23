import type { ZoneType } from "./zoneTasks";

/**
 * Task templates per business kind (local analysis only; the model just reports zones). `{zone}` in a title/desc is replaced by the
 * REAL zone label. Frequencies are defaults for a ~60 h/week business, scaled by opening hours — assumptions, not measured data.
 * "no" tasks are the physical ones K1 cannot do (no hands).
 */
export type Fit = "good" | "partial" | "no";
export type Template = { key: string; title: string; desc: string; perDay: number; minutes: number; fit: Fit; why?: string };
export type BusinessKind = "cafe" | "hotel" | "showroom" | "retail" | "library" | "office" | "university" | "generic";

/** Order matters: the first match wins (showroom before retail, hotel before university "lobby" etc.). EN / LV / RU keywords. */
const DETECT: [BusinessKind, RegExp][] = [
  ["showroom", /showroom|dealer|dealership|d[iī]ler|car\s*(sales|shop|salon|centre|center)|auto\s*(salon|centre|center|sales|house)|\bauto\b|autosal|automobil|\bcars?\b|motor|vehicle|автосалон|автодилер|автомобил|машин|дилер|салон\s*авто/i],
  ["hotel", /hotel|hostel|motel|resort|guest\s*house|viesn[iī]c|naktsm[iī]t|otel|отел|гостиниц|хостел/i],
  ["library", /librar|bibliot[eē]k|библиотек/i],
  ["university", /universit|college|school|campus|augstskol|skol[aā]|universit[aā]t|универс|институт|школ|колледж|вуз/i],
  ["cafe", /caf[eé]|coffee|restaurant|bistro|\bbar\b|pub\b|bakery|canteen|kafejn[iī]c|restor[aā]n|k[aā]фе|кафе|ресторан|кофе|пекарн|столов/i],
  ["retail", /retail|shop|store|boutique|supermarket|market|pharmacy|veikal|aptiek|магазин|аптек|бутик|супермаркет/i],
  ["office", /office|reception|clinic|bank|coworking|birojs|rec[eē]pcij|ofis|офис|ресепш|приём|приемн|клиник|банк/i],
];

/** Contains-matching on the owner's text (EN/LV/RU synonyms, e.g. "Autodealer", "car salon", "viesnīca", "автодилер"). */
export function detectBusiness(businessType: string | null | undefined, hints: string[] = []): BusinessKind {
  const t = (businessType ?? "").trim();
  const direct = DETECT.find(([, re]) => re.test(t))?.[0];
  if (direct) return direct;
  return inferFromHints(hints);
}

/** Unknown business type: guess from what the model saw (zone labels, activities). Several hits needed unless the word is unambiguous. */
const HINTS: [BusinessKind, RegExp][] = [
  ["showroom", /\b(cars?|vehicles?|automobiles?|showroom|test.?drive|dealer\w*)\b/i],
  ["library", /\b(books?|library|readers?|reading|librarian)\b/i],
  ["cafe", /\b(barista|coffee|espresso|latte|menu|caf[eé]|drinks?|pastr\w+)\b/i],
  ["hotel", /\b(hotel|luggage|elevators?|check-?in|concierge|guests?)\b/i],
  ["retail", /\b(shoppers?|cashier|checkout|store|boutique|clothes|groceries)\b/i],
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
};

/** Templates for a zone type in a business kind; a type the kind does not define falls back to the generic set. */
export function templatesFor(kind: BusinessKind, type: ZoneType): Template[] {
  if (kind === "generic") return GENERIC[type];
  return SETS[kind][type] ?? GENERIC[type];
}
export const genericBasics = (): Template[] => [GENERIC.entrance[0], GENERIC.corridor[0], GENERIC.display[0]];
