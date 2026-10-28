// Static costing: run the whole population under today's rules and under a policy, and take the difference.
// "Static" means nobody changes what they earn or claim in response; behavioural costing is separate (6d).
import { calculate, type RuleSet } from "../engine";
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

export interface Costing {
  base: Run;
  reformed: Run;
  /** Change in each tax and benefit, £ a year (reformed minus base). */
  change: Effects;
  /** Positive raises money, negative costs money. */
  netRevenue: number;
  /** Each lever on its own, and what's left over from levers interacting. */
  perLever: { lever: string; netRevenue: number }[];
  interaction: number;
}

/** Cost a policy. Pass the base run if you already have it, to save running today's rules again. */
export function costPolicy(pop: Population, rules: RuleSet, policy: Policy, base: Run = run(pop, rules)): Costing {
  const changes = effectiveChanges(rules, policy);
  const reformed = changes.length ? run(pop, applyPolicy(rules, changes)) : base;
  const change = difference(reformed.totals, base.totals);
  const total = netRevenue(change);
  const perLever =
    changes.length > 1
      ? changes.map((c) => ({ lever: c.lever, netRevenue: netRevenue(difference(run(pop, applyPolicy(rules, [c])).totals, base.totals)) }))
      : changes.map((c) => ({ lever: c.lever, netRevenue: total }));
  const interaction = total - perLever.reduce((s, l) => s + l.netRevenue, 0);
  return { base, reformed, change, netRevenue: total, perLever, interaction };
}
