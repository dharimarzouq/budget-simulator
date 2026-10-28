import { describe, expect, it } from "vitest";
import { FORECAST, fiscalPath, interestRates } from "../src/economy/fiscal";
import type { Effects } from "../src/policy/costing";
import { sources } from "../src/rules";

const none: Effects = { incomeTax: 0, employeeNI: 0, employerNI: 0, selfEmployedNI: 0, childBenefitCharge: 0, childBenefit: 0, universalCredit: 0 };
const with_ = (x: Partial<Effects>): Effects => ({ ...none, ...x });

describe("the OBR forecast data", () => {
  it("every series covers every year and names a known source", () => {
    for (const [name, s] of Object.entries(FORECAST.series)) {
      expect(s.values.length, name).toBe(FORECAST.years.length);
      expect(sources[s.source], name).toBeDefined();
    }
    for (const s of [FORECAST.fiscal_rules.stability.source, FORECAST.fiscal_rules.debt.source, FORECAST.multipliers.source, FORECAST.cyclical_borrowing.source]) {
      expect(sources[s]).toBeDefined();
    }
  });

  it("the published figures hang together: borrowing over GDP, and the stability margin is the 2029-30 surplus", () => {
    const i = FORECAST.years.indexOf("2026-27");
    expect((FORECAST.series.psnb!.values[i]! / FORECAST.series.gdp!.values[i]!) * 100).toBeCloseTo(4.2, 1); // Table A.9: 4.2%
    const t = FORECAST.years.indexOf("2029-30");
    expect(-FORECAST.series.current_budget_deficit!.values[t]!).toBeCloseTo(FORECAST.fiscal_rules.stability.margin, 0);
    // Debt margin from the rounded debt figures: within £1bn of the OBR's £24.4bn.
    const debt = FORECAST.series.psnfl!.values as number[];
    const g = FORECAST.series.gdp_centred!.values as number[];
    expect((debt[t - 1]! / g[t - 1]!) * g[t]! - debt[t]!).toBeCloseTo(FORECAST.fiscal_rules.debt.margin, -0.5);
  });

  it("the OBR's cyclical coefficients reproduce its cyclically adjusted borrowing (Table A.9)", () => {
    // Output gaps -0.8, -1.1, -0.9, -0.6 (2025-26 to 2028-29); borrowing less cyclically adjusted borrowing, % of GDP.
    const gaps = [-0.8, -1.1, -0.9, -0.6];
    const published = [4.2 - 3.5, 3.4 - 2.7, 2.9 - 2.4];
    gaps.slice(1).forEach((g, i) => expect(-(0.5 * g + 0.2 * gaps[i]!)).toBeCloseTo(published[i]!, 0.9));
  });
});

describe("borrowing and debt for a budget", () => {
  it("no change leaves the OBR's forecast and margins as they are", () => {
    const p = fiscalPath(none, 0, { economy: true });
    expect(p.years.every((y) => y.borrowing === 0 && y.debt === 0 && y.gdp === 0)).toBe(true);
    expect(p.stabilityMargin).toBe(FORECAST.fiscal_rules.stability.margin);
    expect(p.debtMargin).toBe(FORECAST.fiscal_rules.debt.margin);
  });

  it("debt interest follows the OBR's ready reckoner (hand-worked, without interest on interest)", () => {
    // A £10bn cut in employer NICs from 2026-27, growing with the OBR's employer NICs forecast.
    const p = fiscalPath(with_({ employerNI: -10e9 }), 0, { start: "2026-27", compound: false });
    const [y1, y2] = p.years;
    // Year 1: £10bn more borrowing; interest on half of it at the ready reckoner's year-1 rate is the reckoner itself.
    expect(y1!.borrowing).toBeCloseTo(10, 6);
    expect(y1!.debtInterest).toBeCloseTo(0.240411, 6);
    // Year 2: £10bn × 157.49 / 152.74 more, interest on £10bn plus half of that at 0.769948 / 15.
    const b2 = (10 * 157.49) / 152.74;
    expect(y2!.borrowing).toBeCloseTo(b2, 6);
    expect(y2!.debtInterest).toBeCloseTo((0.769948 / 15) * (10 + b2 / 2), 6);
    expect(interestRates()[FORECAST.years.indexOf("2026-27")]).toBeCloseTo(0.240411 / 5, 9);
  });

  it("a £10bn tax cut from 2027-28 uses up most of the stability margin; interest on the debt adds to it", () => {
    const p = fiscalPath(with_({ incomeTax: -10e9 }), 0);
    expect(p.years[0]!.borrowing).toBe(0); // 2026-27 untouched: starts next April
    const target = p.years.find((y) => y.year === "2029-30")!;
    expect(target.borrowing).toBeGreaterThan((10 * 426.44) / 365.44); // the cut, grown with income tax, plus interest
    expect(p.stabilityMargin).toBeCloseTo(FORECAST.fiscal_rules.stability.margin - target.borrowing, 9);
    // Debt: £24.4bn, plus last year's extra debt grown with GDP, less this year's.
    const before = p.years.find((y) => y.year === "2028-29")!.debt;
    expect(p.debtMargin).toBeCloseTo(24.4 + (before * 3607.164) / 3478.399 - target.debt, 9);
    expect(p.debtMargin).toBeLessThan(24.4);
  });

  it("with the economy: a tax rise of 1% of GDP cuts GDP by 0.33% in its first year, which adds to borrowing", () => {
    const x = 0.01 * 3179.867e9;
    const p = fiscalPath(with_({ incomeTax: x }), 0, { start: "2026-27", economy: true });
    const y = p.years[0]!;
    expect(y.gdp).toBeCloseTo(-0.33, 9);
    expect(y.cyclical).toBeCloseTo(0.5 * 0.0033 * 3179.867, 6); // £5.2bn
    // Second year: the multiplier is 0.30, and last year's smaller economy still costs 0.2 of it.
    const y2 = p.years[1]!;
    const size2 = (x / 1e9) * (392.19 / 365.44);
    expect(y2.gdp).toBeCloseTo((-0.3 * size2 / 3291.088) * 100, 9);
    expect(y2.cyclical).toBeCloseTo((-(0.5 * y2.gdp + 0.2 * y.gdp) / 100) * 3291.088, 9);
    // The tax rise still lowers borrowing overall: the feedback is a fraction of it.
    expect(y.borrowing).toBeLessThan(0);
  });
});
