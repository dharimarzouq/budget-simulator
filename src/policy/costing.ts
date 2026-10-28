// Static costing: run the whole population under today's rules and under a policy, and take the difference.
// "Static" means nobody changes what they earn or claim in response. The behavioural costing (below) adds how
// taxable income responds, and is always reported next to the static figure, never instead of it.
import { calculate, type AdultResult, type Household, type RuleSet } from "../engine";
import type { Population } from "../population";
import { applyPolicy, effectiveChanges, type Policy } from "./policy";

/** £ a year across the population. */
export interface Effects {
  incomeTax: number;
  employeeNI: number;
  employerNI: number;
  selfEmployedNI: number;
  childBenefitCharge: number;
  childBenefit: number;
  universalCredit: number;
}

export const TAXES: (keyof Effects)[] = ["incomeTax", "employeeNI", "employerNI", "selfEmployedNI", "childBenefitCharge"];
export const BENEFITS: (keyof Effects)[] = ["childBenefit", "universalCredit"];

export interface Run {
  totals: Effects;
  /** Net income of each benefit unit, in population order. */
  netIncome: Float64Array;
}

export function run(pop: Population, r: RuleSet): Run {
  const totals: Effects = { incomeTax: 0, employeeNI: 0, employerNI: 0, selfEmployedNI: 0, childBenefitCharge: 0, childBenefit: 0, universalCredit: 0 };
  const netIncome = new Float64Array(pop.units.length);
  pop.units.forEach(({ weight: w, data }, i) => {
    const res = calculate(data, r);
    for (const a of res.adults) {
      totals.incomeTax += w * a.incomeTax;
      totals.employeeNI += w * a.employeeNI;
      totals.employerNI += w * a.employerNI;
      totals.selfEmployedNI += w * a.selfEmployedNI;
    }
    totals.childBenefitCharge += w * res.childBenefitCharge;
    totals.childBenefit += w * res.childBenefit;
    totals.universalCredit += w * res.universalCredit.award * 12;
    netIncome[i] = res.netIncome;
  });
  return { totals, netIncome };
}

/** Money raised (positive) or cost (negative) to the government: more tax, or less benefit, counts as raised. */
export function netRevenue(change: Effects): number {
  return TAXES.reduce((s, k) => s + change[k], 0) - BENEFITS.reduce((s, k) => s + change[k], 0);
}

export function difference(after: Effects, before: Effects): Effects {
  return Object.fromEntries(Object.keys(before).map((k) => [k, after[k as keyof Effects] - before[k as keyof Effects]])) as unknown as Effects;
}

/** Behavioural effect on revenue, £ a year, to add to the static figure (usually negative for a tax rise). */
export interface Behaviour {
  central: number;
  low: number;
  high: number;
}

const STEP = 100;
const SOURCES = ["employment", "selfEmployment", "pension", "propertyIncome", "dividends", "savingsInterest"] as const;

/** Share of an extra £100 of this adult's largest kind of income that goes in income tax, and in their own NICs. */
function marginalTaxRates(data: Household, i: number, r: RuleSet, now: AdultResult): { it: number; ni: number } {
  const a = data.adults[i]!;
  const kind = SOURCES.reduce((best, k) => ((a[k] ?? 0) > (a[best] ?? 0) ? k : best), SOURCES[0]);
  const adults = data.adults.map((x, j) => (j === i ? { ...x, [kind]: (x[kind] ?? 0) + STEP } : x)) as Household["adults"];
  const more = calculate({ ...data, adults }, r).adults[i]!;
  return { it: (more.incomeTax - now.incomeTax) / STEP, ni: (more.employeeNI + more.selfEmployedNI - now.employeeNI - now.selfEmployedNI) / STEP };
}

const bandValue = (x: number, bands: { threshold: number; rate: number }[]) => bands.reduce((v, b) => (x >= b.threshold ? b.rate : v), bands[0]!.rate);

/**
 * How taxable income responds to a change in marginal tax rates, and what that does to revenue. For each person:
 * the % change in taxable income is the elasticity for their income band times the % change in the share of an
 * extra pound they keep (1 - marginal rate); the tax on that changed income is lost or gained at the new marginal
 * rate. Employer NICs and benefits are left static. Low and high figures scale the elasticities (see behaviour.yaml).
 */
export function behaviouralEffect(pop: Population, before: RuleSet, after: RuleSet): Behaviour & { incomeTax: number; ni: number } {
  const tie = after.behaviour.taxableIncomeElasticity;
  let incomeTax = 0;
  let ni = 0;
  for (const { weight: w, data } of pop.units) {
    const was = calculate(data, before);
    const now = calculate(data, after);
    data.adults.forEach((_, i) => {
      const income = now.adults[i]!.totalIncome;
      if (income <= 0) return;
      const m0 = marginalTaxRates(data, i, before, was.adults[i]!);
      const m1 = marginalTaxRates(data, i, after, now.adults[i]!);
      const t0 = m0.it + m0.ni;
      const t1 = m1.it + m1.ni;
      if (Math.abs(t1 - t0) < 1e-9 || t0 >= 1 || t1 >= 1) return;
      const incomeChange = bandValue(income, tie) * income * Math.log((1 - t1) / (1 - t0));
      incomeTax += w * incomeChange * m1.it;
      ni += w * incomeChange * m1.ni;
    });
  }
  const central = incomeTax + ni;
  return { central, low: central * after.behaviour.rangeLow, high: central * after.behaviour.rangeHigh, incomeTax, ni };
}

export interface Costing {
  base: Run;
  reformed: Run;
  /** Change in each tax and benefit, £ a year (reformed minus base). */
  change: Effects;
  /** Positive raises money, negative costs money. Static: nobody changes what they do. */
  netRevenue: number;
  /** Each lever on its own, and what's left over from levers interacting. */
  perLever: { lever: string; netRevenue: number }[];
  interaction: number;
  /** Behavioural effect to add to the static figure, and the totals with it: central, low and high. */
  behaviour: Behaviour;
  withBehaviour: Behaviour;
}

/** Cost a policy. Pass the base run if you already have it, to save running today's rules again. */
export function costPolicy(pop: Population, rules: RuleSet, policy: Policy, base: Run = run(pop, rules)): Costing {
  const changes = effectiveChanges(rules, policy);
  const reformedRules = applyPolicy(rules, changes);
  const reformed = changes.length ? run(pop, reformedRules) : base;
  const change = difference(reformed.totals, base.totals);
  const total = netRevenue(change);
  const perLever =
    changes.length > 1
      ? changes.map((c) => ({ lever: c.lever, netRevenue: netRevenue(difference(run(pop, applyPolicy(rules, [c])).totals, base.totals)) }))
      : changes.map((c) => ({ lever: c.lever, netRevenue: total }));
  const interaction = total - perLever.reduce((s, l) => s + l.netRevenue, 0);
  const b = changes.length ? behaviouralEffect(pop, rules, reformedRules) : { central: 0, low: 0, high: 0 };
  const behaviour = { central: b.central, low: b.low, high: b.high };
  const withBehaviour = { central: total + behaviour.central, low: total + behaviour.low, high: total + behaviour.high };
  return { base, reformed, change, netRevenue: total, perLever, interaction, behaviour, withBehaviour };
}
