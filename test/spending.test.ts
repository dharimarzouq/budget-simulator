import { describe, expect, it } from "vitest";
import { adult, household, ruleSet } from "../src/engine";
import { FORECAST, fiscalPath, interestRates } from "../src/economy/fiscal";
import { START, costPolicy, run } from "../src/policy/costing";
import { costingGrade, leverCheck } from "../src/policy/grades";
import { LEVER } from "../src/policy/levers";
import { applyPolicy } from "../src/policy/policy";
import { BARNETT_SOURCE, DEPARTMENTS, barnett, spendingCosts, spendingInYear } from "../src/policy/spending";
import { sources } from "../src/rules";

const r = ruleSet("2026-27");
const zero = { incomeTax: 0, employeeNI: 0, employerNI: 0, selfEmployedNI: 0, childBenefitCharge: 0, childBenefit: 0, universalCredit: 0 };
const at = (y: string) => FORECAST.years.indexOf(y);

describe("spending", () => {
  it("every department has plans for the years the OBR gives, comparability factors, and two sliders", () => {
    expect(sources[BARNETT_SOURCE]).toBeDefined();
    for (const [id, d] of Object.entries(DEPARTMENTS)) {
      expect(d.rdel.length, id).toBe(4); // 2025-26 to 2028-29
      expect(d.cdel.length, id).toBe(5); // 2025-26 to 2029-30
      expect(LEVER[`rdel_${id}`], id).toBeDefined();
      expect(LEVER[`cdel_${id}`], id).toBeDefined();
    }
  });

  it("Barnett: reproduces HM Treasury's worked example (Statement of Funding Policy, Annex A)", () => {
    // Department B, 100% comparable, cut by £50m: Scotland −£4.758m, Wales −£2.880m, NI −£2.012m.
    expect(barnett("education", -50e6)).toBeCloseTo(-50e6 * (0.0952 + 0.0549 * 1.05 + 0.0333 * 0.975 * 1.24), 0);
    expect(-50e6 * 0.0952).toBeCloseTo(-4.76e6, -4);
    expect(-50e6 * 0.0549 * 1.05).toBeCloseTo(-2.882e6, -4);
    expect(-50e6 * 0.0333 * 0.975 * 1.24).toBeCloseTo(-2.013e6, -4);
    // Defence is reserved: no Barnett share. Justice: Scotland and NI only.
    expect(barnett("defence", 1e9)).toBe(0);
    expect(barnett("justice", 1e9)).toBeCloseTo(1e9 * (0.0952 + 0.0333 * 0.975 * 1.24), 0);
  });

  it("a spending change costs exactly what's set plus its Barnett share, with no household run and no estimate to grade", () => {
    const pop = { about: "", year: "2026-27", published: {}, units: [{ weight: 1, household: 0, data: household({ adults: [adult({ employment: 30000 })] }) }] };
    const base = run(pop, r);
    const c = costPolicy(pop, r, [{ lever: "rdel_health", value: 10 }], base);
    const b = barnett("health", 10e9);
    expect(c.netRevenue).toBeCloseTo(-(10e9 + b), 0);
    expect(c.reformed).toBe(base);
    expect(c.behaviour.central).toBe(0);
    expect(costingGrade([{ lever: "rdel_health", value: 10 }])).toBeNull();
    expect(leverCheck("rdel_health").check).toBe("close");
    // A benefit as a share of the OBR's forecast for 2027-28: 5% of the State Pension.
    const sp = spendingCosts(r, applyPolicy(r, [{ lever: "ame_state_pension", value: 0.05 }]), START);
    expect(sp[0]!.first).toBeCloseTo(0.05 * 159.64e9, 0);
    expect(sp[0]!.barnett).toBe(0);
  });

  it("borrowing: day-to-day spending uses the main rule's margin; investment adds to borrowing but leaves it alone (hand-worked)", () => {
    const day = spendingCosts(r, applyPolicy(r, [{ lever: "rdel_defence", value: 1 }]), START); // no Barnett share
    const inv = spendingCosts(r, applyPolicy(r, [{ lever: "cdel_defence", value: 1 }]), START);
    const pDay = fiscalPath(zero, 0, { spending: day });
    const pInv = fiscalPath(zero, 0, { spending: inv });
    // 2027-28: £1bn, and interest at the ready reckoner's 2027-28 rate on half of it.
    const r27 = interestRates()[at("2027-28")]!;
    const y = pDay.years.find((y) => y.year === "2027-28")!;
    expect(y.spending).toBeCloseTo(1, 9);
    expect(y.debtInterest).toBeCloseTo((r27 * 0.5) / (1 - r27 / 2), 9);
    // 2029-30: day-to-day defence carries on with the OBR's total after 2028-29.
    const total = FORECAST.series.rdel_total!.values as number[];
    const d = DEPARTMENTS.defence!.rdel;
    const plan29 = (d[3]! * total[at("2029-30")]!) / total[at("2028-29")]!;
    const t = pDay.years.find((y) => y.year === "2029-30")!;
    expect(t.spending).toBeCloseTo(plan29 / d[at("2027-28")]!, 9);
    expect(pDay.stabilityMargin).toBeCloseTo(FORECAST.fiscal_rules.stability.margin - t.borrowing, 9);
    // Investment: borrowing goes up (and debt), but the main rule only feels the interest on it.
    const ti = pInv.years.find((y) => y.year === "2029-30")!;
    expect(ti.investment).toBeGreaterThan(0.9);
    expect(pInv.stabilityMargin).toBeCloseTo(FORECAST.fiscal_rules.stability.margin - (ti.borrowing - ti.investment), 9);
    expect(FORECAST.fiscal_rules.stability.margin - pInv.stabilityMargin).toBeLessThan(0.2); // only interest
    expect(pInv.debtMargin).toBeLessThan(FORECAST.fiscal_rules.debt.margin);
  });

  it("with the economy: investment spending moves GDP by the OBR's 1.00 in its first year, day-to-day by 0.45", () => {
    const inv = spendingCosts(r, applyPolicy(r, [{ lever: "cdel_defence", value: 10 }]), START);
    const day = spendingCosts(r, applyPolicy(r, [{ lever: "rdel_defence", value: 10 }]), START);
    const gdp = FORECAST.series.gdp!.values[at("2027-28")]!;
    const yi = fiscalPath(zero, 0, { spending: inv, economy: true }).years.find((y) => y.year === "2027-28")!;
    const yd = fiscalPath(zero, 0, { spending: day, economy: true }).years.find((y) => y.year === "2027-28")!;
    expect(yi.gdp).toBeCloseTo((1.0 * 10 * 100) / gdp, 9);
    expect(yd.gdp).toBeCloseTo((0.45 * 10 * 100) / gdp, 9);
  });

  it("spendingInYear grows a change with the department's plans", () => {
    const c = spendingCosts(r, applyPolicy(r, [{ lever: "rdel_education", value: 2 }]), START)[0]!;
    const e = DEPARTMENTS.education!.rdel;
    const v = spendingInYear(c, at("2028-29"), START);
    expect(v.amount).toBeCloseTo((2e9 * e[3]!) / e[2]!, 0);
    expect(v.barnett).toBeCloseTo((c.barnett * e[3]!) / e[2]!, 0);
  });
});
