import { describe, expect, it } from "vitest";
import { ruleSet } from "../src/engine";
import { FORECAST, fiscalPath } from "../src/economy/fiscal";
import { FIRST_FORECAST, HISTORY_SOURCES, MEASURES, baselineSeries, yoursSeries } from "../src/economy/history";
import { applyPolicy } from "../src/policy/policy";
import { reckonerCosts } from "../src/policy/reckoner";
import { sources } from "../src/rules";

const zero = { incomeTax: 0, employeeNI: 0, employerNI: 0, selfEmployedNI: 0, childBenefitCharge: 0, childBenefit: 0, universalCredit: 0 };
const series = (n: string) => FORECAST.series[n]!.values as number[];
const at = (y: string) => FORECAST.years.indexOf(y);
const value = (m: Parameters<typeof baselineSeries>[0], y: string) => baselineSeries(m).find((p) => p.year === y)!.value!;

describe("history", () => {
  it("names known sources and joins the forecast the simulator already uses", () => {
    for (const s of HISTORY_SOURCES) expect(sources[s], s).toBeDefined();
    expect(FIRST_FORECAST).toBe("2026-27");
    // The databank's forecast years are the same forecast: borrowing and the current budget as shares of GDP.
    for (const y of ["2026-27", "2027-28", "2028-29", "2029-30", "2030-31", "2031-32"]) {
      expect(value("borrowing", y)).toBeCloseTo((series("psnb")[at(y)]! / series("gdp")[at(y)]!) * 100, 2);
      expect(value("current_budget_deficit", y)).toBeCloseTo((series("current_budget_deficit")[at(y)]! / series("gdp")[at(y)]!) * 100, 2);
      expect(value("psnd", y)).toBeCloseTo((series("psnd")[at(y)]! / series("gdp_centred")[at(y)]!) * 100, 1); // £bn rounded in Table A.9
    }
  });

  it("2025-26 outturn agrees with the forecast report's Table A.9 (debt 0.2 points higher in the databank)", () => {
    expect(value("borrowing", "2025-26")).toBeCloseTo(4.4, 1);
    expect(value("current_budget_deficit", "2025-26")).toBeCloseTo(1.5, 1);
    expect(Math.abs(value("psnd", "2025-26") - 93.1)).toBeLessThan(0.25);
    // The series reach back: borrowing from 1948-49, net debt from 1974-75, growth from 1956-57.
    expect(baselineSeries("borrowing")[0]!.year).toBe("1948-49");
    expect(baselineSeries("psnd").find((p) => p.value !== null)!.year).toBe("1974-75");
    expect(baselineSeries("real_growth").find((p) => p.value !== null)!.year).toBe("1956-57");
  });

  it("with nothing changed, your budget lies exactly on the forecast", () => {
    const p = fiscalPath(zero, 0, { economy: true });
    for (const m of MEASURES) {
      for (const [y, v] of yoursSeries(m.id, p)) expect(v, `${m.id} ${y}`).toBeCloseTo(value(m.id, y), 9);
    }
  });

  it("a VAT rise shows in tax (hand-worked) and in borrowing, not in spending", () => {
    const r = ruleSet("2026-27");
    const reckoner = reckonerCosts(r, applyPolicy(r, [{ lever: "vat_standard", value: 0.21 }]));
    const p = fiscalPath(zero, 0, { reckoner });
    // 2027-28, the budget's first year: HMRC's £8.8bn, grown a year with the OBR's VAT forecast, as a share of GDP.
    const raised = (8.8 * series("vat")[at("2027-28")]!) / series("vat")[at("2026-27")]!;
    expect(yoursSeries("receipts", p).get("2027-28")).toBeCloseTo(value("receipts", "2027-28") + (raised / series("gdp")[at("2027-28")]!) * 100, 9);
    expect(yoursSeries("borrowing", p).get("2027-28")!).toBeLessThan(value("borrowing", "2027-28"));
    // Spending only moves by the (lower) debt interest.
    const y = p.years.find((x) => x.year === "2027-28")!;
    expect(yoursSeries("spending", p).get("2027-28")).toBeCloseTo(value("spending", "2027-28") + (y.debtInterest / series("gdp")[at("2027-28")]!) * 100, 9);
    expect(y.debtInterest).toBeLessThan(0);
  });
});
