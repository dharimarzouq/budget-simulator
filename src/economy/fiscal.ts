// Borrowing and debt: a budget's costing carried over the OBR's forecast years, with the extra debt interest it
// brings, checked against the fiscal rules. Two versions: the standard one, which leaves the economy as the OBR
// forecasts it (as official costings do), and one that adds the budget's effect on GDP and what that does to
// borrowing, using the OBR's fiscal multipliers.
import forecastData from "../../forecasts/obr-2026-10.yaml";
import type { Effects } from "../policy/costing";
import type { ReckonerCost } from "../policy/reckoner";
import { spendingInYear, type SpendingCost } from "../policy/spending";

export interface Forecast {
  forecast: string;
  label: string;
  years: string[];
  limits: string[];
  series: Record<string, { label: string; unit: string; values: (number | null)[]; source: string; table: string }>;
  fiscal_rules: {
    target_year: string;
    stability: { label: string; margin: number; source: string; table: string };
    debt: { label: string; margin: number; source: string; table: string; note: string };
  };
  multipliers: { label: string; tax: number[]; welfare: number[]; rdel: number[]; cdel: number[]; source: string; table: string; note: string; range_low: number; range_high: number; range_note: string };
  cyclical_borrowing: { label: string; this_year: number; last_year: number; source: string; note: string };
}

export const FORECAST = forecastData as Forecast;

/** The year a budget announced now would start: the next tax year. */
export const START_YEAR = "2027-28";

const BN = 1e9;

/** Which forecast series carries each part of a costing forward. */
const CARRIED_BY: Record<keyof Effects, string> = {
  incomeTax: "income_tax",
  childBenefitCharge: "income_tax",
  employeeNI: "employee_nics",
  employerNI: "employer_nics",
  selfEmployedNI: "self_employed_nics",
  universalCredit: "universal_credit",
  childBenefit: "child_benefit",
};
const TAXES: (keyof Effects)[] = ["incomeTax", "childBenefitCharge", "employeeNI", "employerNI", "selfEmployedNI"];
const BENEFITS: (keyof Effects)[] = ["universalCredit", "childBenefit"];

export interface Year {
  year: string;
  /** £bn a year. Positive raises money. */
  taxRaised: number;
  benefitsCut: number;
  /** Behavioural effect, £bn (usually negative for a tax rise). */
  behaviour: number;
  /** Extra debt interest, £bn. */
  debtInterest: number;
  /** More day-to-day spending (departments, benefits outside the household model, and their Barnett share), £bn. */
  spending: number;
  /** More investment spending (with its Barnett share), £bn: borrowing, but not the current budget. */
  investment: number;
  /** Change in borrowing, £bn (positive means more borrowing). The current budget deficit changes by this less investment. */
  borrowing: number;
  /** Extra debt at the end of the year (end-March), £bn. */
  debt: number;
  /** Effect on real GDP, % (only in the version with the economy). */
  gdp: number;
  /** Change in borrowing from the economy's response, £bn (included in `borrowing`). */
  cyclical: number;
}

export interface Path {
  years: Year[];
  /** Margins against the fiscal rules after the budget, £bn; negative means the rule is missed. */
  stabilityMargin: number;
  debtMargin: number;
}

const index = (year: string) => {
  const i = FORECAST.years.indexOf(year);
  if (i < 0) throw new Error(`No forecast for ${year}`);
  return i;
};
const series = (name: string) => FORECAST.series[name]!.values as number[];

/**
 * The interest rate on extra debt in each year, read off the OBR's ready reckoner: £10bn more borrowing every year
 * from the start of 2026-27 adds R(t) to debt interest in year t, when the extra debt averages 10 × (years so far) +
 * 5 (half of this year's). Using these rates on any path of extra borrowing reproduces the ready reckoner for its own
 * case exactly.
 */
export function interestRates(): number[] {
  const first = index("2026-27");
  return series("debt_interest_per_10bn").map((r, i) => (i < first ? 0 : r / (10 * (i - first) + 5)));
}

export interface Options {
  /** Add the budget's effect on GDP and the borrowing that follows from it. */
  economy?: boolean;
  /** Scale the multipliers (the low and high figures). */
  multiplierScale?: number;
  /** Extra debt interest is itself borrowed and earns interest (on by default; off to check against the ready reckoner). */
  compound?: boolean;
  start?: string;
  /**
   * Taxes costed from HMRC's ready reckoner. HMRC gives three years from a change, which here are the first three years
   * of your budget, grown in line with the OBR's forecast for that tax; after the third, the third year's costing grows
   * with the forecast.
   */
  reckoner?: ReckonerCost[];
  /** Spending changes, set for the budget's first year and growing with each department's plans or benefit's forecast. */
  spending?: SpendingCost[];
}

/**
 * Carry a 2026-27 costing (`change`, in £ a year, and the behavioural effect in £) over the forecast years. Each part
 * grows in line with the OBR's forecast for its tax or benefit; behaviour grows with income tax.
 */
export function fiscalPath(change: Effects, behaviour: number, opts: Options = {}): Path {
  const { economy = false, multiplierScale = 1, compound = true, start = START_YEAR, reckoner = [], spending = [] } = opts;
  const first = index("2026-27");
  const s0 = index(start);
  const rates = interestRates();
  const gdp = series("gdp");
  const m = FORECAST.multipliers;
  const cyc = FORECAST.cyclical_borrowing;
  const growth = (name: string, i: number) => series(name)[i]! / series(name)[first]!;

  const years: Year[] = [];
  let debt = 0;
  let lastGdp = 0;
  for (let i = first; i < FORECAST.years.length; i++) {
    const on = i >= s0;
    const fromHmrc = on
      ? reckoner.reduce((s, c) => {
          const col = Math.min(i - s0, c.raises.length - 1);
          return s + (c.raises[col]! / BN) * (series(c.receipts)[i]! / series(c.receipts)[first + col]!);
        }, 0)
      : 0;
    const taxRaised = on ? TAXES.reduce((s, k) => s + (change[k] * growth(CARRIED_BY[k], i)) / BN, 0) + fromHmrc : 0;
    const benefitsCut = on ? -BENEFITS.reduce((s, k) => s + (change[k] * growth(CARRIED_BY[k], i)) / BN, 0) : 0;
    const b = on ? (behaviour * growth("income_tax", i)) / BN : 0;
    // Spending changes by kind, Barnett shares included (they're the same kind of spending for the devolved governments).
    let rdel = 0, cdel = 0, ame = 0;
    if (on) {
      for (const c of spending) {
        const v = spendingInYear(c, i, s0);
        const x = (v.amount + v.barnett) / BN;
        if (c.kind === "rdel") rdel += x;
        else if (c.kind === "cdel") cdel += x;
        else ame += x;
      }
    }

    // Effect on GDP, % of GDP: each year's measure times the multiplier for how long the policy has been running.
    // Raising tax or cutting benefits takes demand out of the economy; more spending adds to it.
    let gdpEffect = 0;
    if (economy && on) {
      const age = Math.min(i - s0, m.tax.length - 1);
      const demand = -(m.tax[age]! * (taxRaised + b) + m.welfare[age]! * (benefitsCut - ame)) + m.rdel[age]! * rdel + m.cdel[age]! * cdel;
      gdpEffect = ((multiplierScale * demand) / gdp[i]!) * 100;
    }
    // A smaller economy means less tax and more spending: the OBR's 0.5 this year and 0.2 last year.
    const cyclical = economy ? (-(cyc.this_year * gdpEffect + cyc.last_year * lastGdp) / 100) * gdp[i]! : 0;

    const primary = -(taxRaised + benefitsCut + b) + rdel + ame + cdel + cyclical;
    // Interest on the debt at the start of the year and half of this year's extra borrowing; with compounding, the
    // interest is borrowed too (solved exactly: x = r × (debt + (primary + x) / 2)).
    const r = rates[i]!;
    const debtInterest = compound ? (r * (debt + primary / 2)) / (1 - r / 2) : r * (debt + primary / 2);
    const borrowing = primary + (compound ? debtInterest : 0);
    debt += borrowing;
    years.push({ year: FORECAST.years[i]!, taxRaised, benefitsCut, behaviour: b, spending: rdel + ame, investment: cdel, debtInterest, borrowing, debt, gdp: gdpEffect, cyclical });
    lastGdp = gdpEffect;
  }

  // The rules, in their target year. Stability: the current budget surplus falls by the extra borrowing, except what
  // went on investment, which the rule leaves out. Debt: the
  // margin is how much higher debt could be at the end of the target year and still be falling as a share of GDP;
  // extra debt at the end of the year before raises that limit in proportion to GDP growth.
  const t = FORECAST.years.indexOf(FORECAST.fiscal_rules.target_year);
  const at = (i: number) => years.find((y) => y.year === FORECAST.years[i])?.debt ?? 0;
  const centred = series("gdp_centred");
  const yt = years.find((y) => y.year === FORECAST.fiscal_rules.target_year)!;
  return {
    years,
    stabilityMargin: FORECAST.fiscal_rules.stability.margin - (yt.borrowing - yt.investment),
    debtMargin: FORECAST.fiscal_rules.debt.margin + (at(t - 1) * centred[t]!) / centred[t - 1]! - at(t),
  };
}

/** The OBR's forecast for each year, for showing next to the budget's effect. */
export function baseline(name: "psnb" | "current_budget_deficit" | "psnfl" | "psnd" | "gdp" | "gdp_centred"): Record<string, number> {
  return Object.fromEntries(FORECAST.years.map((y, i) => [y, series(name)[i]!]));
}
