import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adult, calculate, child, household, ruleSet } from "../src/engine";
import { decodePopulation } from "../src/population";
import { costPolicy, run } from "../src/policy/costing";
import { distribution } from "../src/policy/distribution";
import { leverCheck, policyCheck } from "../src/policy/grades";
import { LEVER, LEVERS } from "../src/policy/levers";
import { applyPolicy, effectiveChanges, policyFromQuery, policyToQuery, type Policy } from "../src/policy/policy";
import { REMOVALS } from "../src/policy/removals";
import type { Region } from "../src/engine";

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

  it("behavioural costing: one person on £200,000 when the additional rate goes up 1p", () => {
    // Marginal rate 45% + 2% NICs = 47%, then 48%. Elasticity at £200,000 is 0.35, so taxable income changes by
    // 0.35 × 200,000 × ln(0.52 / 0.53) = -1,333.33, losing 48% of it in tax: -640.00. Static yield: 1% of the
    // 74,860 above £125,140 = 748.60. With behaviour: 108.60; low and high use half and 1.5 times the response.
    const pop = { about: "", year: "2026-27", published: {}, units: [{ weight: 1, household: 0, data: household({ adults: [adult({ employment: 200000 })] }) }] };
    const c = costPolicy(pop, r, [{ lever: "it_additional", value: 0.46 }]);
    expect(c.netRevenue).toBeCloseTo(748.6, 1);
    const response = 0.35 * 200000 * Math.log(0.52 / 0.53) * 0.48;
    expect(c.behaviour.central).toBeCloseTo(response, 1);
    expect(c.withBehaviour.central).toBeCloseTo(748.6 + response, 1);
    expect(c.behaviour.low).toBeCloseTo(response * 0.5, 1);
    expect(c.behaviour.high).toBeCloseTo(response * 1.5, 1);
    // A change that doesn't touch anyone's marginal tax rate (Child Benefit) has no behavioural effect.
    expect(costPolicy(pop, r, [{ lever: "cb_eldest", value: 30 }]).behaviour.central).toBe(0);
  });

  it("a changed rule flows through the engine: 21p basic rate on £30,000", () => {
    // (30,000 - 12,570) × 21% = 3,660.30
    const h = household({ adults: [adult({ employment: 30000 })] });
    expect(calculate(h, applyPolicy(r, [{ lever: "it_basic", value: 0.21 }])).adults[0]!.incomeTax).toBeCloseTo(3660.3, 2);
  });
});

describe("levers at the ends of their sliders", () => {
  // Households that touch every part of the engine: tax bands, the taper, NICs, Child Benefit and its charge,
  // Universal Credit with rent, children, health and the cap, savings and dividends, Scotland, pensioners.
  const households = [
    household({ adults: [adult({ employment: 15000 })] }),
    household({ adults: [adult({ employment: 60000, savingsInterest: 2000, dividends: 5000 })], children: [child(), child()] }),
    household({ adults: [adult({ employment: 70000 }), adult({ employment: 0 })], children: [child()] }),
    household({ adults: [adult({ employment: 150000, selfEmployment: 40000 })] }),
    household({ region: "scotland", adults: [adult({ employment: 45000 })] }),
    household({ region: "london", adults: [adult({ age: 30, health: "lcwra" })], children: [child(), child(), child()], rentMonthly: 2500 }),
    household({ adults: [adult({ age: 70, pension: 30000 })] }),
    household({ adults: [adult({ age: 22, employment: 9000, carer: true })], rentMonthly: 600, savings: 8000 }),
  ];
  const finite = (p: Policy) =>
    households.every((h) => {
      const res = calculate(h, applyPolicy(r, p));
      return [res.netIncome, res.childBenefitCharge, res.universalCredit.award, ...res.adults.flatMap((a) => [a.incomeTax, a.employeeNI, a.employerNI, a.selfEmployedNI])].every(Number.isFinite);
    });

  it("every lever at zero, and at double today's value, gives a figure for every household", () => {
    for (const l of LEVERS) {
      if (l.unit === "flag") continue;
      expect(finite([{ lever: l.id, value: 0 }]), `${l.id} at 0`).toBe(true);
      expect(finite([{ lever: l.id, value: 2 * (l.get(r) as number) }]), `${l.id} doubled`).toBe(true);
    }
    expect(finite(LEVERS.filter((l) => l.unit !== "flag").map((l) => ({ lever: l.id, value: 0 })))).toBe(true);
  });

  it("with no taper width, the Child Benefit charge takes all of it once income is over the threshold", () => {
    const family = (pay: number) => household({ adults: [adult({ employment: pay })], children: [child(), child()] });
    const p = applyPolicy(r, [{ lever: "cb_charge_width", value: 0 }]);
    expect(calculate(family(60001), p).childBenefitCharge).toBeCloseTo(calculate(family(60001), p).childBenefit, 6);
    expect(calculate(family(59000), p).childBenefitCharge).toBe(0);
  });
});

describe("removing a tax, allowance or charge", () => {
  const tax = (h: ReturnType<typeof household>, p: Policy) => calculate(h, applyPolicy(r, p)).adults[0]!;
  const on = (id: string) => ({ lever: id, value: true });
  const employee = (pay: number, region: Region = "england") => household({ region, adults: [adult({ employment: pay })] });

  it("no higher rate: £80,000 pays the basic rate on everything above the allowance, and follows a changed basic rate", () => {
    expect(tax(employee(80000), [on("no_higher")]).incomeTax).toBeCloseTo((80000 - 12570) * 0.2, 2);
    expect(tax(employee(80000), [on("no_higher"), { lever: "it_basic", value: 0.21 }]).incomeTax).toBeCloseTo((80000 - 12570) * 0.21, 2);
    // Scotland sets its own rates, so it's untouched.
    expect(tax(employee(80000, "scotland"), [on("no_higher")]).incomeTax).toBeCloseTo(tax(employee(80000, "scotland"), []).incomeTax, 6);
  });

  it("no additional rate: top incomes pay the higher rate, or the basic rate if that's gone too", () => {
    expect(tax(employee(200000), [on("no_additional")]).incomeTax).toBeCloseTo(tax(employee(200000), [{ lever: "it_additional", value: 0.4 }]).incomeTax, 6);
    // No allowance at £200,000 (tapered away), so everything is taxed at 20%.
    expect(tax(employee(200000), [on("no_additional"), on("no_higher")]).incomeTax).toBeCloseTo(200000 * 0.2, 2);
  });

  it("no personal allowance: tax from the first pound; no taper: the full allowance at any income", () => {
    expect(tax(employee(30000), [on("no_pa")]).incomeTax).toBeCloseTo(6000, 2);
    // 37,700 at 20% + 87,440 at 40% + 12,290 at 45% on taxable income of 137,430.
    expect(tax(employee(150000), [on("no_taper")]).incomeTax).toBeCloseTo(7540 + 34976 + 5530.5, 2);
  });

  it("no National Insurance, employee, employer or self-employed", () => {
    expect(tax(employee(40000), [on("no_ni_employee")]).employeeNI).toBe(0);
    expect(tax(employee(40000), [on("no_ni_employer")]).employerNI).toBe(0);
    expect(tax(household({ adults: [adult({ selfEmployment: 40000 })] }), [on("no_ni_self")]).selfEmployedNI).toBe(0);
    // Each leaves the other kinds alone.
    expect(tax(employee(40000), [on("no_ni_employer")]).employeeNI).toBeCloseTo(tax(employee(40000), []).employeeNI, 6);
  });

  it("no dividend tax, and no savings allowances", () => {
    expect(tax(household({ adults: [adult({ dividends: 50000 })] }), [on("no_dividend_tax")]).incomeTax).toBe(0);
    // £1,000 of interest on top of £30,000 pay: today the £1,000 allowance covers it; without it, 20%.
    const saver = household({ adults: [adult({ employment: 30000, savingsInterest: 1000 })] });
    expect(tax(saver, [on("no_savings_allowances")]).incomeTax - tax(saver, []).incomeTax).toBeCloseTo(200, 2);
  });

  it("no Child Benefit charge, and no benefit cap", () => {
    const family = household({ adults: [adult({ employment: 80000 })], children: [child(), child()] });
    expect(calculate(family, r).childBenefitCharge).toBeGreaterThan(0);
    expect(calculate(family, applyPolicy(r, [on("no_cb_charge")])).childBenefitCharge).toBe(0);
    const capped = household({ region: "london", adults: [adult({ age: 30 })], children: [child(), child(), child(), child()], rentMonthly: 2500 });
    expect(calculate(capped, r).universalCredit.benefitCap.reduction).toBeGreaterThan(0);
    expect(calculate(capped, applyPolicy(r, [on("no_benefit_cap")])).universalCredit.benefitCap.reduction).toBe(0);
  });

  it("Scottish bands merge into the one below (the starter band into basic)", () => {
    const sc = (p: Policy) => tax(employee(200000, "scotland"), p).incomeTax;
    expect(sc([on("no_sc_top")])).toBeCloseTo(sc([{ lever: "sc_top", value: r.incomeTax.bands.scotland[4]!.rate }]), 6);
    expect(tax(employee(20000, "scotland"), [on("no_sc_starter")]).incomeTax).toBeCloseTo(tax(employee(20000, "scotland"), [{ lever: "sc_starter", value: 0.2 }]).incomeTax, 6);
  });

  it("a removal drops the levers it makes meaningless, goes in a share link, and is marked a known gap", () => {
    const p = [{ lever: "it_basic_band", value: 40000 }, { lever: "it_higher", value: 0.45 }, on("no_higher"), { lever: "it_basic", value: 0.21 }];
    expect(effectiveChanges(r, p)).toEqual([on("no_higher"), { lever: "it_basic", value: 0.21 }]);
    expect(policyFromQuery(policyToQuery([on("no_pa")]))).toEqual([on("no_pa")]);
    for (const x of REMOVALS) {
      expect(LEVER[x.lever], x.id).toBeDefined();
      expect(leverCheck(x.id).check).toBe("gap");
    }
  });
});

// These run the whole population, several times over with behaviour, so they get longer than the default 5 seconds.
describe("costing over the population", { timeout: 30000 }, () => {
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

  it("every lever at zero at once still gives a figure for the whole population", () => {
    const after = run(pop, applyPolicy(r, LEVERS.filter((l) => l.unit !== "flag").map((l) => ({ lever: l.id, value: 0 }))));
    expect(Object.values(after.totals).every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(distribution(pop, base, after).all.meanChange)).toBe(true);
  });

  it("removing employer National Insurance loses what it raises, after the Employment Allowance", () => {
    const c = costPolicy(pop, r, [{ lever: "no_ni_employer", value: true }], base);
    expect(c.reformed.totals.employerNI).toBe(0);
    expect(c.change.employerNI).toBeCloseTo(-base.totals.employerNI, 0);
  });

  it("bringing back the two-child limit saves money", () => {
    const c = costPolicy(pop, r, [{ lever: "uc_two_child_limit", value: true }], base);
    expect(c.change.universalCredit).toBeLessThan(0);
  });

  it("winners and losers: deciles each hold a tenth of households, and a basic rate rise costs richer tenths more", () => {
    const d = distribution(pop, base, run(pop, applyPolicy(r, [{ lever: "it_basic", value: 0.21 }])));
    for (const g of d.deciles) expect(g.households / d.all.households).toBeCloseTo(0.1, 2);
    expect(d.deciles.every((g) => g.meanChange <= 0)).toBe(true);
    expect(d.deciles[9]!.meanChange).toBeLessThan(d.deciles[4]!.meanChange);
    expect(d.deciles[4]!.meanChange).toBeLessThan(d.deciles[0]!.meanChange);
    // Gain + lose + no real change covers everyone.
    expect(d.all.gain + d.all.lose + d.all.noChange).toBeCloseTo(1, 10);
    // The average change across households equals the change in total net income of private households.
    const net = (x: Float64Array) => pop.units.reduce((s, u, i) => s + (u.outside ? 0 : u.weight * x[i]!), 0);
    const after = run(pop, applyPolicy(r, [{ lever: "it_basic", value: 0.21 }]));
    expect(d.all.meanChange * d.all.households).toBeCloseTo(net(after.netIncome) - net(base.netIncome), -3);
  });

  it("winners and losers: bringing back the two-child limit hits the poorer tenths and families with children", () => {
    const d = distribution(pop, base, run(pop, applyPolicy(r, [{ lever: "uc_two_child_limit", value: true }])));
    expect(d.deciles[0]!.meanChange + d.deciles[1]!.meanChange).toBeLessThan(d.deciles[8]!.meanChange + d.deciles[9]!.meanChange);
    const pensioners = d.familyTypes.find((g) => g.label === "Pensioners")!;
    expect(pensioners.lose).toBe(0);
    expect(d.regions.length).toBe(12);
  });
});

describe("checks against published figures", () => {
  it("every lever has a check with a reason, and a policy takes its weakest lever's check", () => {
    for (const l of LEVERS) {
      const c = leverCheck(l.id);
      expect(c.why, l.id).not.toBe("Not checked.");
      expect(["close", "fair", "gap"]).toContain(c.check);
    }
    expect(policyCheck([])).toBe("close");
    expect(policyCheck([{ lever: "ni_employer", value: 0.16 }])).toBe("close");
    expect(policyCheck([{ lever: "ni_employer", value: 0.16 }, { lever: "it_basic", value: 0.21 }])).toBe("fair");
    expect(policyCheck([{ lever: "it_basic", value: 0.21 }, { lever: "ni_main", value: 0.09 }])).toBe("gap");
  });
});

describe("winners and losers on a hand-made population", () => {
  it("averages, shares and equivalisation", () => {
    // Two one-person households, each with weight 1. Net incomes are given directly.
    const pop = {
      about: "", year: "2026-27", published: {},
      units: [
        { weight: 1, household: 0, regionDetail: "London", data: household({ adults: [adult({ employment: 20000 })] }) },
        { weight: 1, household: 1, regionDetail: "Wales", data: household({ adults: [adult({ employment: 60000 })] }) },
      ],
    };
    const before = { totals: {} as never, netIncome: Float64Array.from([18000, 45000]) };
    const after = { totals: {} as never, netIncome: Float64Array.from([18030, 44000]) }; // +£30 (no real change), -£1,000
    const d = distribution(pop, before, after);
    expect(d.all.meanChange).toBe(-485);
    expect(d.all.gain).toBe(0);
    expect(d.all.lose).toBe(0.5);
    expect(d.all.noChange).toBe(0.5);
    expect(d.all.percentOfIncome).toBeCloseTo((-970 / 63000) * 100, 10);
    expect(d.regions.map((g) => g.label)).toEqual(["London", "Wales"]);
    expect(d.familyTypes[0]!.label).toBe("Single without children");
  });
});

// Used by other tests to build households quickly.
export { child };
