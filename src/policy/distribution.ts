// Winners and losers: how a policy changes households' incomes, by income decile, family type and region.
// Static: the change in each household's net income with nobody responding (see COSTING.md for why).
import type { Population } from "../population";
import type { Run } from "./costing";

/** A change smaller than this (£ a year, either way) counts as no real change: £1 a week. */
export const NO_CHANGE = 52;
const PENSION_AGE = 66;

export interface Group {
  label: string;
  /** Households in the group (weighted). */
  households: number;
  /** Average net household income before the policy, £ a year. */
  meanIncome: number;
  /** Average change in net household income, £ a year (positive is a gain). */
  meanChange: number;
  /** Total change as a % of the group's total net income. */
  percentOfIncome: number;
  /** Shares of households gaining, losing, or seeing no real change (each 0 to 1). */
  gain: number;
  lose: number;
  noChange: number;
}

export interface Distribution {
  all: Group;
  /** Tenths of households, poorest first, ranked by equivalised net income before the policy. */
  deciles: Group[];
  familyTypes: Group[];
  regions: Group[];
}

interface HouseholdRow {
  weight: number;
  before: number;
  after: number;
  equivalised: number;
  family: string;
  region: string;
}

/**
 * Equivalised the way HBAI does it (modified OECD scale, before housing costs): first adult 0.67, other adults and
 * children 14 or over 0.33, children under 14 0.2.
 */
function equivalence(ages: { adult: boolean; age: number }[]): number {
  return 0.67 + ages.slice(1).reduce((s, p) => s + (p.adult || p.age >= 14 ? 0.33 : 0.2), 0);
}

/** One label per household, from the families (benefit units) in it. */
function familyType(units: Population["units"]): string {
  const withKids = units.find((u) => u.data.children.length > 0);
  if (withKids) return withKids.data.adults.length === 2 ? "Couple with children" : "Lone parent";
  if (units.every((u) => u.data.adults.every((a) => a.age >= PENSION_AGE))) return "Pensioners";
  if (units.length > 1) return "Adults sharing (more than one family)";
  if (units[0]!.data.adults.some((a) => a.age >= PENSION_AGE)) return "Pensioners";
  return units[0]!.data.adults.length === 2 ? "Couple without children" : "Single without children";
}

function households(pop: Population, before: Run, after: Run): HouseholdRow[] {
  const byId = new Map<number, number[]>();
  pop.units.forEach((u, i) => {
    if (u.outside) return; // household tables cover private households, as HBAI does
    const list = byId.get(u.household);
    if (list) list.push(i);
    else byId.set(u.household, [i]);
  });
  const rows: HouseholdRow[] = [];
  for (const idx of byId.values()) {
    const units = idx.map((i) => pop.units[i]!);
    const people = units.flatMap((u) => [...u.data.adults.map((a) => ({ adult: true, age: a.age })), ...u.data.children.map((c) => ({ adult: false, age: c.age }))]);
    const b = idx.reduce((s, i) => s + before.netIncome[i]!, 0);
    const a = idx.reduce((s, i) => s + after.netIncome[i]!, 0);
    rows.push({ weight: units[0]!.weight, before: b, after: a, equivalised: b / equivalence(people), family: familyType(units),
      region: units[0]!.regionDetail ?? units[0]!.data.region });
  }
  return rows;
}

function summarise(label: string, rows: HouseholdRow[]): Group {
  let w = 0, income = 0, change = 0, gain = 0, lose = 0;
  for (const r of rows) {
    const d = r.after - r.before;
    w += r.weight;
    income += r.weight * r.before;
    change += r.weight * d;
    if (d > NO_CHANGE) gain += r.weight;
    else if (d < -NO_CHANGE) lose += r.weight;
  }
  return {
    label, households: w, meanIncome: w ? income / w : 0, meanChange: w ? change / w : 0,
    percentOfIncome: income ? (100 * change) / income : 0, gain: w ? gain / w : 0, lose: w ? lose / w : 0, noChange: w ? (w - gain - lose) / w : 0,
  };
}

const groupBy = (rows: HouseholdRow[], key: (r: HouseholdRow) => string) => {
  const groups = new Map<string, HouseholdRow[]>();
  for (const r of rows) (groups.get(key(r)) ?? groups.set(key(r), []).get(key(r))!).push(r);
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, g]) => summarise(label, g));
};

/** Winners and losers from two runs of the same population (today's rules, and the policy). */
export function distribution(pop: Population, before: Run, after: Run): Distribution {
  const rows = households(pop, before, after).sort((a, b) => a.equivalised - b.equivalised);
  const total = rows.reduce((s, r) => s + r.weight, 0);
  const deciles: HouseholdRow[][] = Array.from({ length: 10 }, () => []);
  let cum = 0;
  for (const r of rows) {
    // Each household goes in the tenth its middle falls in, so every decile holds a tenth of households (weighted).
    const k = Math.min(9, Math.floor(((cum + r.weight / 2) / total) * 10));
    deciles[k]!.push(r);
    cum += r.weight;
  }
  return {
    all: summarise("All households", rows),
    deciles: deciles.map((g, k) => summarise(k === 0 ? "Poorest tenth" : k === 9 ? "Richest tenth" : `Tenth ${k + 1}`, g)),
    familyTypes: groupBy(rows, (r) => r.family),
    regions: groupBy(rows, (r) => r.region),
  };
}
