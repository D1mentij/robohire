import profile from "./k1-profile.json";

export type Sourced<T = unknown> = { value?: T; assumption: boolean; source: string | null; [k: string]: unknown };

export interface K1Profile {
  robot: string;
  specs: Record<string, Record<string, unknown> & { assumption: boolean; source: string | null }>;
  can: { ability: string; notes: string }[];
  cannot: { limitation: string; notes: string }[];
  price_eur: { value: number; assumption: boolean; notes?: string };
  sources: string[];
}

export const k1Profile: K1Profile = profile as K1Profile;
