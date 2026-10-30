// Council tax and business rates in costings (COSTING.md, "Council tax and business rates"). Council tax is counted
// after Council Tax Reduction, as the OBR counts its receipts, so income tax and benefit changes move it a little;
// the council tax lever is costed through every home; business rates scale the OBR's forecast.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ruleSet } from "../src/engine";
import { decodePopulation } from "../src/population";
import { costPolicy, run } from "../src/policy/costing";
import { leverCheck } from "../src/policy/grades";
import { fiscalPath } from "../src/economy/fiscal";

const r = ruleSet("2026-27");
const pop = decodePopulation(JSON.parse(readFileSync("public/data/population-2026-27.json", "utf-8")));
const base = run(pop, r);
const bn = (x: number) => x / 1e9;

describe("council tax in costings", () => {
  it("today's council tax after Council Tax Reduction is in the totals, near the OBR's receipts plus Northern Ireland's rates", () => {
    // OBR 2026-27: £53.1bn (England, Scotland, Wales) plus about £0.95bn of Northern Ireland's domestic rates.
    expect(bn(base.totals.councilTax)).toBeGreaterThan(50);
    expect(bn(base.totals.councilTax)).toBeLessThan(55);
  });

  it("1% on every bill raises about £0.5bn: 1% of the bills, less the extra Council Tax Reduction", () => {
    const c = costPolicy(pop, r, [{ lever: "council_tax", value: 0.01 }], base, { behaviour: false });
    expect(bn(c.netRevenue)).toBeGreaterThan(0.45);
    expect(bn(c.netRevenue)).toBeLessThan(0.55);
    // Only council tax moves.
    for (const k of ["incomeTax", "employeeNI", "universalCredit", "childBenefit"] as const) expect(c.change[k]).toBe(0);
    expect(c.behaviour.central).toBe(0);
  });

  it("an income tax rise moves council tax only through Council Tax Reduction, a little, on its own line", () => {
    const c = costPolicy(pop, r, [{ lever: "it_basic", value: 0.21 }], base, { behaviour: false });
    // Lower incomes after tax mean more Council Tax Reduction, so a little less council tax.
    expect(c.change.councilTax).toBeLessThan(0);
    expect(Math.abs(c.change.councilTax)).toBeLessThan(0.02 * c.change.incomeTax);
  });

  it("a Universal Credit cut moves Council Tax Reduction too", () => {
    const c = costPolicy(pop, r, [{ lever: "uc_taper", value: 0.6 }], base, { behaviour: false });
    expect(c.change.universalCredit).toBeLessThan(0);
    expect(c.change.councilTax).not.toBe(0);
  });

  it("carried forward with the OBR's council tax forecast", () => {
    const zero = { incomeTax: 0, employeeNI: 0, employerNI: 0, selfEmployedNI: 0, childBenefitCharge: 0, councilTax: 1e9, childBenefit: 0, universalCredit: 0 };
    const p = fiscalPath(zero, 0, { compound: false });
    const y = p.years.find((x) => x.year === "2027-28")!;
    expect(y.taxRaised).toBeCloseTo(55.878 / 53.091, 6);
  });
});

describe("business rates", () => {
  it("1% raises 1% of the OBR's forecast, England, Scotland and Wales plus Northern Ireland, static", () => {
    const c = costPolicy(pop, r, [{ lever: "business_rates", value: 0.01 }], base, { behaviour: false });
    expect(c.reckoner).toHaveLength(1);
    const br = c.reckoner[0]!;
    expect(br.static).toBe(true);
    expect(bn(br.raises[0]!)).toBeCloseTo(0.01 * (35.436 + 0.406), 6);
    expect(bn(c.netRevenue)).toBeCloseTo(0.01 * (35.436 + 0.406), 6);
    // Nobody's household result changes.
    expect(c.change.councilTax).toBe(0);
    // In 2027-28 it has grown with the forecast.
    const zero = { incomeTax: 0, employeeNI: 0, employerNI: 0, selfEmployedNI: 0, childBenefitCharge: 0, councilTax: 0, childBenefit: 0, universalCredit: 0 };
    const y = fiscalPath(zero, 0, { reckoner: c.reckoner, compound: false }).years.find((x) => x.year === "2027-28")!;
    expect(y.taxRaised).toBeCloseTo(0.01 * (35.436 + 0.406) * (37.217 / 35.436), 6);
  });

  it("a cut costs the mirror image; past 10% it's flagged as a known gap", () => {
    const cut = costPolicy(pop, r, [{ lever: "business_rates", value: -0.05 }], base, { behaviour: false });
    expect(bn(cut.netRevenue)).toBeCloseTo(-0.05 * (35.436 + 0.406), 6);
    expect(leverCheck("business_rates", cut.reckoner[0]!.fit).check).toBe("fair");
    const big = costPolicy(pop, r, [{ lever: "business_rates", value: 0.2 }], base, { behaviour: false });
    expect(leverCheck("business_rates", big.reckoner[0]!.fit).check).toBe("gap");
  });
});
