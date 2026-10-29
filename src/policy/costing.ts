// Static costing: run the whole population under today's rules and under a policy, and take the difference.
// "Static" means nobody changes what they earn or claim in response. The behavioural costing (below) adds how
// taxable income responds, and is always reported next to the static figure, never instead of it.
import { calculate, type AdultResult, type Household, type RuleSet } from "../engine";
import type { Population } from "../population";
import { applyPolicy, effectiveChanges, type Policy } from "./policy";
import { isReckonerLever, reckonerCosts, type ReckonerCost } from "./reckoner";

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
  // Employment Allowance and apprentice relief are lump sums, not per person. They cancel out of most costings, but
  // not out of removing employer NICs, which takes them away too.
  totals.employerNI -= r.ni.employmentAllowanceCost + r.ni.apprenticeReliefCost;
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
/** Each adult's marginal rates under one set of rules, in population order (two slots per unit), to reuse across costings. */
export function marginalRatesFor(pop: Population, rules: RuleSet, progress?: (done: number) => void): { it: Float64Array; ni: Float64Array } {
  const it = new Float64Array(pop.units.length * 2);
  const ni = new Float64Array(pop.units.length * 2);
  pop.units.forEach(({ data }, u) => {
    if (progress && u % 2000 === 0) progress(u / pop.units.length);
    const res = calculate(data, rules);
    data.adults.forEach((_, i) => {
      const m = marginalTaxRates(data, i, rules, res.adults[i]!);
      it[u * 2 + i] = m.it;
      ni[u * 2 + i] = m.ni;
    });
  });
  return { it, ni };
}

const personalTax = (a: AdultResult) => a.incomeTax + a.employeeNI + a.selfEmployedNI;

/**
 * Pass `beforeRates` (from marginalRatesFor) to save working out today's marginal rates again. People whose own tax
 * doesn't change are skipped: their marginal rate can only change if they sit within £100 of a threshold that moved.
 * `progress` is told the share of the population done so far, now and then.
 */
export function behaviouralEffect(
  pop: Population, before: RuleSet, after: RuleSet, beforeRates?: { it: Float64Array; ni: Float64Array }, progress?: (done: number) => void,
): Behaviour & { incomeTax: number; ni: number } {
  const tie = after.behaviour.taxableIncomeElasticity;
  let incomeTax = 0;
  let ni = 0;
  pop.units.forEach(({ weight: w, data }, u) => {
    if (progress && u % 2000 === 0) progress(u / pop.units.length);
    const was = calculate(data, before);
    const now = calculate(data, after);
    data.adults.forEach((_, i) => {
      const income = now.adults[i]!.totalIncome;
      if (income <= 0) return;
      if (Math.abs(personalTax(now.adults[i]!) - personalTax(was.adults[i]!)) < 0.005) return;
      const m0 = beforeRates ? { it: beforeRates.it[u * 2 + i]!, ni: beforeRates.ni[u * 2 + i]! } : marginalTaxRates(data, i, before, was.adults[i]!);
      const m1 = marginalTaxRates(data, i, after, now.adults[i]!);
      const t0 = m0.it + m0.ni;
      const t1 = m1.it + m1.ni;
      if (Math.abs(t1 - t0) < 1e-9 || t0 >= 1 || t1 >= 1) return;
      const incomeChange = bandValue(income, tie) * income * Math.log((1 - t1) / (1 - t0));
      incomeTax += w * incomeChange * m1.it;
      ni += w * incomeChange * m1.ni;
    });
  });
  const central = incomeTax + ni;
  return { central, low: central * after.behaviour.rangeLow, high: central * after.behaviour.rangeHigh, incomeTax, ni };
}

export interface Costing {
  base: Run;
  reformed: Run;
  /** Change in each tax and benefit, £ a year (reformed minus base). */
  change: Effects;
  /** Taxes the household model doesn't cover, costed from HMRC's figures, which already allow for responses. */
  reckoner: ReckonerCost[];
  /** Positive raises money, negative costs money. Static for the household model (nobody changes what they do), plus
   * HMRC's costings of other taxes in their first year. */
  netRevenue: number;
  /** Each lever on its own, and what's left over from levers interacting. */
  perLever: { lever: string; netRevenue: number }[];
  interaction: number;
  /** Behavioural effect to add to the static figure, and the totals with it: central, low and high. */
  behaviour: Behaviour;
  withBehaviour: Behaviour;
}

/**
 * Cost a policy. Pass the base run if you already have it, to save running today's rules again. With
 * `behaviour: false` the behavioural figures are left at zero (the page adds them afterwards, as they take longer).
 */
export function costPolicy(pop: Population, rules: RuleSet, policy: Policy, base: Run = run(pop, rules), options: { behaviour?: boolean } = {}): Costing {
  const changes = effectiveChanges(rules, policy);
  const reformedRules = applyPolicy(rules, changes);
  // Changes to taxes the household model doesn't cover leave every household's result as it is.
  const reformed = changes.some((c) => !isReckonerLever(c.lever)) ? run(pop, reformedRules) : base;
  const change = difference(reformed.totals, base.totals);
  const reckoner = reckonerCosts(rules, reformedRules);
  const total = netRevenue(change) + firstYear(reckoner);
  const own = (c: Policy[number]) =>
    isReckonerLever(c.lever)
      ? firstYear(reckonerCosts(rules, applyPolicy(rules, [c])))
      : netRevenue(difference(run(pop, applyPolicy(rules, [c])).totals, base.totals));
  const perLever = changes.length > 1 ? changes.map((c) => ({ lever: c.lever, netRevenue: own(c) })) : changes.map((c) => ({ lever: c.lever, netRevenue: total }));
  const interaction = total - perLever.reduce((s, l) => s + l.netRevenue, 0);
  const b = changes.length && options.behaviour !== false ? behaviouralEffect(pop, rules, reformedRules) : { central: 0, low: 0, high: 0 };
  const behaviour = { central: b.central, low: b.low, high: b.high };
  const withBehaviour = { central: total + behaviour.central, low: total + behaviour.low, high: total + behaviour.high };
  return { base, reformed, change, reckoner, netRevenue: total, perLever, interaction, behaviour, withBehaviour };
}

/** What HMRC's costings raise in the first year of a change, £. */
export const firstYear = (costs: ReckonerCost[]) => costs.reduce((s, c) => s + c.raises[0]!, 0);
