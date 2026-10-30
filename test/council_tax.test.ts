// Council tax, Northern Ireland's rates and Council Tax Reduction (rules/2026-27/council_tax.yaml; POPULATION.md,
// "Council tax"). Hand-worked households, then the population against published totals, with the gaps held where
// POPULATION.md says they are.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adult, calculate, child, household, ruleSet, type Dwelling, type Household } from "../src/engine";
import { decodePopulation } from "../src/population";

const r = ruleSet("2026-27");
const home = (d: Partial<Dwelling> = {}): Dwelling => ({ area: "South East", band: "D", adultsInHome: 2, takeUpDraw: 0, ...d });
const ct = (h: Household) => calculate(h, r).councilTax;

describe("council tax for one household", () => {
  it("no home given, no council tax: the calculator and other families in the home are unchanged", () => {
    const h = household({ adults: [adult({ employment: 30000 })] });
    expect(ct(h).net).toBe(0);
    expect(calculate(h, r).lines.some((l) => l.label === "Council tax")).toBe(false);
  });

  it("Band D in the South East is the region's average, £2,472.41; one adult gets 25% off", () => {
    const pay = [adult({ employment: 40000 }), adult({ employment: 40000 })] as Household["adults"];
    expect(ct(household({ adults: pay, home: home() })).net).toBeCloseTo(2472.41, 2);
    const one = ct(household({ adults: [adult({ employment: 40000 })], home: home({ adultsInHome: 1 }) }));
    expect(one.discount).toBeCloseTo(2472.41 * 0.25, 2);
    expect(one.net).toBeCloseTo(2472.41 * 0.75, 2);
  });

  it("council tax comes off net income, as HBAI measures it", () => {
    const adults = [adult({ employment: 40000 }), adult({ employment: 40000 })] as Household["adults"];
    const without = calculate(household({ adults }), r).netIncome;
    expect(without - calculate(household({ adults, home: home() }), r).netIncome).toBeCloseTo(2472.41, 2);
  });

  it("band ratios: Wales's band I is 21/9 of Band D; Scotland's band H is 882/360", () => {
    const rich = [adult({ employment: 90000 }), adult({ employment: 90000 })] as Household["adults"];
    expect(ct(household({ region: "wales", adults: rich, home: home({ area: "Wales", band: "I" }) })).charge).toBeCloseTo((2283 * 21) / 9, 2);
    expect(ct(household({ region: "scotland", adults: rich, home: home({ area: "Scotland", band: "H" }) })).charge).toBeCloseTo((1653.44 * 882) / 360, 2);
  });

  it("Northern Ireland: rates on the capital value, capped at £400,000; 20% off for someone 70 or over living alone", () => {
    const rate = 0.005559 + 0.004905;
    const ni = (age: number, alone: boolean) =>
      ct(household({ region: "northern_ireland", adults: [adult({ age, pension: 60000 })], home: { area: "Northern Ireland", capitalValue: 500000, adultsInHome: alone ? 1 : 2 } }));
    expect(ni(50, true).charge).toBeCloseTo(400000 * rate, 2);
    expect(ni(50, true).discount).toBe(0); // no single person discount in Northern Ireland
    expect(ni(75, true).net).toBeCloseTo(400000 * rate * 0.8, 2);
    expect(ni(75, false).net).toBeCloseTo(400000 * rate, 2);
  });

  it("Council Tax Reduction: a family living on Universal Credit gets 75% off in England, all of it in Wales", () => {
    const family = { adults: [adult({ age: 30 })] as Household["adults"], children: [child()], rentMonthly: 700 };
    const eng = ct(household({ ...family, home: home({ adultsInHome: 1, band: "B" }) }));
    expect(eng.reduction).toBeCloseTo(0.75 * (eng.charge - eng.discount), 2);
    const wal = ct(household({ ...family, region: "wales", home: home({ area: "Wales", adultsInHome: 1, band: "B" }) }));
    expect(wal.net).toBeCloseTo(0, 6);
    // Not claiming Universal Credit: no reduction either.
    expect(ct(household({ ...family, claimsUniversalCredit: false, home: home({ adultsInHome: 1, band: "B" }) })).reduction).toBe(0);
  });

  it("earnings above Universal Credit's work allowance reduce it by 20p per £1 of income above the applicable amount", () => {
    const at = (pay: number) => ct(household({ adults: [adult({ age: 30, employment: pay })], children: [child()], home: home({ adultsInHome: 1, band: "A" }) })).reduction;
    expect(at(6000)).toBeCloseTo(at(2000), 6); // within the work allowance: ignored
    expect(at(9000)).toBeGreaterThan(0);
    expect(at(9000)).toBeLessThan(at(2000));
    expect(at(80000)).toBe(0);
  });

  it("pensioners: full reduction below the applicable amount (£256 a week, 72 or over), whatever their savings", () => {
    const pensioner = (pension: number, savings: number) =>
      ct(household({ adults: [adult({ age: 78, pension })], savings, home: home({ adultsInHome: 1, band: "C" }) }));
    expect(pensioner(12000, 50000).net).toBeCloseTo(0, 6); // under 52 × £256: guarantee credit, no savings limit
    expect(pensioner(20000, 50000).reduction).toBe(0); // over it, and savings over £16,000
    expect(pensioner(15000, 5000).reduction).toBeGreaterThan(0); // tapered
    expect(pensioner(15000, 5000).net).toBeGreaterThan(0);
  });
});

describe("council tax across the population", () => {
  const pop = decodePopulation(JSON.parse(readFileSync("public/data/population-2026-27.json", "utf-8")));
  const by: Record<string, { net: number; regional: number; ctrPensioners: number; ctrWorking: number }> = {};
  for (const u of pop.units) {
    if (!u.data.home) continue;
    const res = calculate(u.data, r);
    const n = u.data.region === "london" ? "england" : u.data.region;
    const t = (by[n] ??= { net: 0, regional: 0, ctrPensioners: 0, ctrWorking: 0 });
    t.net += (u.weight * res.councilTax.net) / 1e9;
    if (n === "northern_ireland") t.regional += (u.weight * res.councilTax.net * r.councilTax.niRegionalRate) / (r.councilTax.niRegionalRate + r.councilTax.niDistrictRate) / 1e9;
    if (u.data.adults.every((a) => a.age >= r.ni.statePensionAge)) t.ctrPensioners += (u.weight * res.councilTax.reduction) / 1e9;
    else t.ctrWorking += (u.weight * res.councilTax.reduction) / 1e9;
  }

  it("only the family with the home pays, and every private household has one", () => {
    const payers = pop.units.filter((u) => u.data.home);
    expect(new Set(payers.map((u) => u.household)).size).toBe(payers.length);
    expect(payers.reduce((s, u) => s + u.weight, 0) / 1e6).toBeCloseTo(28.97, 1);
  });

  it("Council Tax Reduction in England matches MHCLG (calibrated): £1.9bn pensioners, £2.6bn working age", () => {
    // MHCLG council taxbase 2025, Tables 3.01 and 3.02, 2025-26, grown 4.9% with Band D to 2026-27.
    expect(by.england!.ctrPensioners / 1.905).toBeCloseTo(1, 1);
    expect(by.england!.ctrWorking / 2.629).toBeCloseTo(1, 1);
  });

  it("Scotland's and Wales's come out within 5% (not calibrated)", () => {
    // Scottish Government £425.1m and Welsh Government £347.4m in 2025-26, grown with each nation's Band D.
    const scotland = (by.scotland!.ctrPensioners + by.scotland!.ctrWorking) / (0.4251 * 1.072);
    const wales = (by.wales!.ctrPensioners + by.wales!.ctrWorking) / (0.3474 * 1.052);
    for (const x of [scotland, wales]) {
      expect(x).toBeGreaterThan(0.95);
      expect(x).toBeLessThan(1.05);
    }
  });

  it("receipts against the OBR's October 2026 forecast: England and Wales 3–4% under, Scotland 9% over", () => {
    // OBR EFO October 2026, Table 5.1 (2026-27): England £46.8bn, Scotland £3.17bn, Wales £2.58bn.
    const ratio = (n: string, obr: number) => by[n]!.net / obr;
    expect(ratio("england", 46.806)).toBeGreaterThan(0.93);
    expect(ratio("england", 46.806)).toBeLessThan(1);
    expect(ratio("wales", 2.578)).toBeGreaterThan(0.95);
    expect(ratio("wales", 2.578)).toBeLessThan(1.03);
    expect(ratio("scotland", 3.170)).toBeGreaterThan(1.05);
    expect(ratio("scotland", 3.170)).toBeLessThan(1.15);
  });

  it("Northern Ireland's regional rate on homes matches the OBR within 5% (£0.52bn)", () => {
    // OBR EFO October 2026, Table 4.2: Northern Ireland domestic rates £0.515bn in 2026-27 (the regional rate).
    expect(by.northern_ireland!.regional / 0.5153).toBeGreaterThan(0.95);
    expect(by.northern_ireland!.regional / 0.5153).toBeLessThan(1.03);
  });
});
