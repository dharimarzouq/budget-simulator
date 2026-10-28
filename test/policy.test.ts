import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adult, calculate, child, household, ruleSet } from "../src/engine";
import { decodePopulation } from "../src/population";
import { costPolicy, run } from "../src/policy/costing";
import { LEVER, LEVERS } from "../src/policy/levers";
import { applyPolicy, policyFromQuery, policyToQuery } from "../src/policy/policy";

const r = ruleSet("2026-27");

describe("levers and policies", () => {
  it("every lever reads today's value and writes a new one without touching the original rules", () => {
    for (const l of LEVERS) {
      const now = l.get(r);
      const next = l.unit === "flag" ? !now : (now as number) + l.step;
      const changed = applyPolicy(r, [{ lever: l.id, value: next }]);
      expect(l.get(changed), l.id).toBe(next);
      expect(l.get(r), l.id).toBe(now);
    }
  });

  it("the basic rate lever moves England, Wales and NI together, and leaves Scotland alone", () => {
    const changed = applyPolicy(r, [{ lever: "it_basic", value: 0.21 }]);
    expect(changed.incomeTax.bands.ruk[0]!.rate).toBe(0.21);
    expect(changed.incomeTax.bands.wales[0]!.rate).toBe(0.21);
    expect(changed.incomeTax.bands.scotland[1]!.rate).toBe(0.2);
  });

  it("a policy round-trips through a share link", () => {
    const p = [{ lever: "it_basic", value: 0.21 }, { lever: "uc_two_child_limit", value: true }];
    expect(policyFromQuery(policyToQuery(p))).toEqual(p);
    expect(policyFromQuery("it_basic=0.21&nonsense=4&it_pa=abc")).toEqual([{ lever: "it_basic", value: 0.21 }]);
  });

  it("a changed rule flows through the engine: 21p basic rate on £30,000", () => {
    // (30,000 - 12,570) × 21% = 3,660.30
    const h = household({ adults: [adult({ employment: 30000 })] });
    expect(calculate(h, applyPolicy(r, [{ lever: "it_basic", value: 0.21 }])).adults[0]!.incomeTax).toBeCloseTo(3660.3, 2);
  });
});

describe("costing over the population", () => {
  const pop = decodePopulation(JSON.parse(readFileSync("public/data/population-2026-27.json", "utf-8")));
  const base = run(pop, r);

  it("no change costs nothing", () => {
    expect(costPolicy(pop, r, [], base).netRevenue).toBe(0);
    expect(costPolicy(pop, r, [{ lever: "it_basic", value: 0.2 }], base).netRevenue).toBe(0);
  });

  it("£1 a week more for the eldest child costs about £52 for each family paid, less the extra charge", () => {
    const c = costPolicy(pop, r, [{ lever: "cb_eldest", value: LEVER.cb_eldest!.get(r) as number + 1 }], base);
    const families = pop.units.reduce((s, u, i) => s + (base.netIncome[i]! >= 0 && calculate(u.data, r).childBenefit > 0 ? u.weight : 0), 0);
    expect(c.change.childBenefit).toBeCloseTo(families * 52, -5);
    expect(c.change.childBenefitCharge).toBeGreaterThan(0);
    expect(c.netRevenue).toBeLessThan(0);
  });

  it("a tax rise raises money, but Universal Credit gives some back: it's withdrawn on pay after tax", () => {
    // Higher tax means lower net pay, so the 55% taper takes less: UC rises by 55p per £1 of extra tax for claimants.
    const c = costPolicy(pop, r, [{ lever: "it_basic", value: 0.21 }], base);
    expect(c.change.incomeTax).toBeGreaterThan(0);
    expect(c.change.universalCredit).toBeGreaterThan(0);
    expect(c.change.universalCredit).toBeLessThan(c.change.incomeTax * 0.2);
  });

  it("per-lever costs plus interaction add up to the package", () => {
    const c = costPolicy(pop, r, [{ lever: "it_basic", value: 0.22 }, { lever: "uc_taper", value: 0.5 }], base);
    const sum = c.perLever.reduce((s, l) => s + l.netRevenue, 0) + c.interaction;
    expect(sum).toBeCloseTo(c.netRevenue, 0);
  });

  it("bringing back the two-child limit saves money", () => {
    const c = costPolicy(pop, r, [{ lever: "uc_two_child_limit", value: true }], base);
    expect(c.change.universalCredit).toBeLessThan(0);
  });
});

// Used by other tests to build households quickly.
export { child };
