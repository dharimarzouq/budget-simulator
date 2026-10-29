import { describe, expect, it } from "vitest";
import { adult, household, ruleSet } from "../src/engine";
import { FORECAST, fiscalPath } from "../src/economy/fiscal";
import { costPolicy, run } from "../src/policy/costing";
import { costingGrade, leverCheck, policyCheck } from "../src/policy/grades";
import { LEVER, LEVERS } from "../src/policy/levers";
import { RECKONER, RECKONER_SOURCE, reckon } from "../src/policy/reckoner";
import { sources } from "../src/rules";

const r = ruleSet("2026-27");
const m = (xs: number[]) => xs.map((x) => x * 1e6);

describe("HMRC's ready reckoner", () => {
  it("every line has a lever and a forecast to carry it on, and every such lever has a line", () => {
    expect(sources[RECKONER_SOURCE]).toBeDefined();
    for (const [id, line] of Object.entries(RECKONER)) {
      expect(LEVER[id], id).toBeDefined();
      expect(FORECAST.series[line.receipts], `${id}: ${line.receipts}`).toBeDefined();
    }
    for (const l of LEVERS.filter((l) => ["VAT and duties", "Business and wealth taxes", "Stamp duty"].includes(l.group))) expect(RECKONER[l.id], l.id).toBeDefined();
  });

  it("reproduces every figure HMRC publishes, exactly, and the same figure the other way for a 'change' line", () => {
    for (const [id, line] of Object.entries(RECKONER)) {
      for (const p of line.points) {
        const c = reckon(id, p.change);
        c.raises.forEach((x, y) => expect(x, `${id} ${p.change} year ${y}`).toBeCloseTo(p.raises[y]! * 1e6, 3));
        expect(c.fit, id).toBe("exact");
        if (line.symmetric) {
          const back = reckon(id, -p.change);
          back.raises.forEach((x, y) => expect(x).toBeCloseTo(-p.raises[y]! * 1e6, 3));
          expect(back.fit).toBe("exact");
        }
      }
    }
  });

  it("scales between HMRC's figures (hand-worked) and says how far it has scaled", () => {
    // 3 points on the higher CGT rate: halfway between HMRC's 1-point (-15, 80, -30) and 5-point (-170, -235, -870).
    const cgt = reckon("cgt_higher", 0.03);
    cgt.raises.forEach((x, y) => expect(x).toBeCloseTo(m([-92.5, -77.5, -450])[y]!, 3));
    expect(cgt.fit).toBe("scaled");
    // Half a point on VAT: half of 1 point. Three points: still within reach. Four: beyond.
    expect(reckon("vat_standard", 0.005).raises[0]).toBeCloseTo(4400e6, 3);
    expect(reckon("vat_standard", 0.03).fit).toBe("scaled");
    expect(reckon("vat_standard", 0.04).fit).toBe("beyond");
    expect(reckon("vat_standard", 0.04).raises[0]).toBeCloseTo(4 * 8800e6, 3);
    // Duties are costed as a 1% change in their rates and trusted to 10% either way.
    expect(reckon("fuel_duty", -0.05).fit).toBe("scaled");
    expect(reckon("fuel_duty", -0.05).raises[0]).toBeCloseTo(-5 * 240e6, 3);
    expect(reckon("fuel_duty", 0.11).fit).toBe("beyond");
    // HMRC costs only a rise in corporation tax: a cut is its mirror image, never "exact".
    const ct = reckon("corporation_tax", -0.01);
    expect(ct.raises[0]).toBeCloseTo(-3600e6, 3);
    expect(ct.fit).toBe("scaled");
    // Stamp duty has its own figures each way: cutting the 12% rate raises money, raising it loses money.
    expect(reckon("sdlt_12", -0.01).raises[0]).toBeCloseTo(10e6, 3);
    expect(reckon("sdlt_12", 0.01).raises[0]).toBeCloseTo(-25e6, 3);
  });

  it("goes into the costing (both headline figures), the grade, and borrowing over the years", () => {
    const pop = { about: "", year: "2026-27", published: {}, units: [{ weight: 1, household: 0, data: household({ adults: [adult({ employment: 30000 })] }) }] };
    const base = run(pop, r);
    const c = costPolicy(pop, r, [{ lever: "vat_standard", value: 0.21 }], base);
    expect(c.netRevenue).toBeCloseTo(8800e6, 3);
    expect(c.reformed).toBe(base); // no household changes, so no second run
    expect(c.behaviour.central).toBe(0);
    expect(c.withBehaviour.central).toBeCloseTo(8800e6, 3);
    const fits = { vat_standard: c.reckoner[0]!.fit };
    expect(costingGrade([{ lever: "vat_standard", value: 0.21 }], fits)).toBe("A");
    expect(costingGrade([{ lever: "vat_standard", value: 0.21 }, { lever: "it_basic", value: 0.21 }], fits)).toBe("B");
    expect(policyCheck([{ lever: "vat_standard", value: 0.25 }], { vat_standard: "beyond" })).toBe("gap");
    expect(leverCheck("vat_standard", "exact").check).toBe("close");

    // Borrowing: HMRC's three years are the budget's first three, grown with the OBR's VAT forecast; then the third carries on.
    const zero = { incomeTax: 0, employeeNI: 0, employerNI: 0, selfEmployedNI: 0, childBenefitCharge: 0, childBenefit: 0, universalCredit: 0 };
    const vat = FORECAST.series.vat!.values as number[];
    const at = (y: string) => FORECAST.years.indexOf(y);
    const p = fiscalPath(zero, 0, { start: "2026-27", reckoner: c.reckoner, compound: false });
    expect(p.years[0]!.taxRaised).toBeCloseTo(8.8, 9);
    expect(p.years[1]!.taxRaised).toBeCloseTo(9.2, 9);
    expect(p.years.find((y) => y.year === "2029-30")!.taxRaised).toBeCloseTo((9.55 * vat[at("2029-30")]!) / vat[at("2028-29")]!, 9);
    // From April 2027: the first year uses HMRC's first-year figure, grown a year with the forecast.
    const later = fiscalPath(zero, 0, { reckoner: c.reckoner, compound: false });
    expect(later.years.find((y) => y.year === "2027-28")!.taxRaised).toBeCloseTo((8.8 * vat[at("2027-28")]!) / vat[at("2026-27")]!, 9);
  });
});
