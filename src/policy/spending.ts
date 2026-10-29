// Spending: changes to departments' day-to-day (RDEL) and investment (CDEL) budgets, and to benefits the household
// model doesn't cover (AME). A spending change costs exactly what is set; changes to England-only budgets also change
// the Scottish, Welsh and Northern Ireland block grants by the Barnett formula. Plans: forecasts/departments-2026-10.yaml.
import departmentData from "../../forecasts/departments-2026-10.yaml";
import forecastData from "../../forecasts/obr-2026-10.yaml";
import type { RuleSet } from "../engine";

type Nation = "scotland" | "wales" | "northern_ireland";
interface Department {
  label: string;
  rdel: number[];
  cdel: number[];
  comparability: Record<Nation, number>;
}
const DATA = departmentData as {
  departments: Record<string, Department>;
  barnett: { population_share: Record<Nation, number>; needs: Record<Nation, number>; vat_abatement: Record<Nation, number> };
  comparability_source: string;
};
const F = forecastData as { years: string[]; series: Record<string, { label: string; values: number[] }> };

export const DEPARTMENTS = DATA.departments;
export const BARNETT = DATA.barnett;
export const BARNETT_SOURCE = DATA.comparability_source;
const NATIONS: Nation[] = ["scotland", "wales", "northern_ireland"];

/** Benefits outside the household model: lever id → OBR forecast line. */
export const BENEFITS: Record<string, string> = {
  ame_state_pension: "state_pension",
  ame_disability: "disability_benefits",
  ame_attendance: "attendance_allowance",
  ame_pension_credit: "pension_credit",
  ame_housing_benefit: "housing_benefit",
  ame_carers: "carers_allowance",
};

export type Kind = "rdel" | "cdel" | "ame";

export interface SpendingCost {
  lever: string;
  kind: Kind;
  /** Department id (rdel, cdel) or OBR forecast line (ame). */
  of: string;
  /** More spending in the first year of the budget, £ (negative is a cut). */
  first: number;
  /** The Barnett consequentials for Scotland, Wales and Northern Ireland in that year, £ (same kind of spending). */
  barnett: number;
}

export function leverKind(id: string): { kind: Kind; of: string } | undefined {
  if (BENEFITS[id]) return { kind: "ame", of: BENEFITS[id]! };
  const m = id.match(/^(rdel|cdel)_(.+)$/);
  return m && DEPARTMENTS[m[2]!] ? { kind: m[1] as Kind, of: m[2]! } : undefined;
}
export const isSpendingLever = (id: string) => leverKind(id) !== undefined;

/** Barnett consequentials of a change to a UK department's budget, £ (change × comparability × population × factors). */
export function barnett(dept: string, change: number): number {
  const c = DEPARTMENTS[dept]!.comparability;
  return NATIONS.reduce((s, n) => s + change * c[n] * BARNETT.population_share[n] * BARNETT.needs[n] * BARNETT.vat_abatement[n], 0);
}

/**
 * A department's plan in each forecast year, £bn: the OBR's figures where given, and after that grown in line with the
 * OBR's total for that kind of spending.
 */
function plans(dept: string, kind: "rdel" | "cdel"): number[] {
  const given = DEPARTMENTS[dept]![kind];
  const total = F.series[kind === "rdel" ? "rdel_total" : "cdel_total"]!.values;
  const last = given.length - 1;
  return F.years.map((_, i) => (i <= last ? given[i]! : (given[last]! * total[i]!) / total[last]!));
}

/** What a spending change is in year `i` (index into the forecast years), given that it's `first` in year `start`. */
export function spendingInYear(c: SpendingCost, i: number, start: number): { amount: number; barnett: number } {
  const path = c.kind === "ame" ? F.series[c.of]!.values : plans(c.of, c.kind);
  // A department with nothing planned in its first year (e.g. local government investment) keeps the change flat.
  const g = path[start]! ? path[i]! / path[start]! : 1;
  return { amount: c.first * g, barnett: c.barnett * g };
}

/** Every spending change between two sets of rules, in the budget's first year (`start`, an index into the forecast years). */
export function spendingCosts(before: RuleSet, after: RuleSet, start: number): SpendingCost[] {
  const out: SpendingCost[] = [];
  const ids = new Set([...Object.keys(before.spending), ...Object.keys(after.spending)]);
  for (const id of ids) {
    const delta = (after.spending[id] ?? 0) - (before.spending[id] ?? 0);
    const k = leverKind(id);
    if (!k || Math.abs(delta) < 1e-12) continue;
    // Departments in £bn; benefits as a share of the OBR's forecast for that year.
    const first = k.kind === "ame" ? delta * F.series[k.of]!.values[start]! * 1e9 : delta * 1e9;
    out.push({ lever: id, kind: k.kind, of: k.of, first, barnett: k.kind === "ame" ? 0 : barnett(k.of, first) });
  }
  return out;
}

/** The first year's spending changes, Barnett included, £. */
export const totalSpending = (costs: SpendingCost[]) => costs.reduce((s, c) => s + c.first + c.barnett, 0);

/** The 2027-28 plan, £bn, for setting a slider's range. */
export const planFor = (dept: string, kind: "rdel" | "cdel") => plans(dept, kind)[F.years.indexOf("2027-28")]!;
