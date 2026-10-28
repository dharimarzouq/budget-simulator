import { describe, expect, it } from "vitest";
import { checkRules, param, rules } from "../src/rules";
import type { RulesFile } from "../src/rules/schema";

const Y = "2026-27";
const num = (area: string, name: string) => param(Y, area, name).value as number;
const bands = (area: string, name: string) => param(Y, area, name).bands!;

describe("rules files", () => {
  it("loads all five areas for 2026-27 (four of rules, plus behaviour for costings)", () => {
    expect(Object.keys(rules).sort()).toEqual([
      "2026-27/behaviour",
      "2026-27/child_benefit",
      "2026-27/income_tax",
      "2026-27/national_insurance",
      "2026-27/universal_credit",
    ]);
  });

  it("every parameter is complete and cites a known source", () => {
    expect(checkRules()).toEqual([]);
  });

  it("the checker catches the mistakes it should", () => {
    const bad: Record<string, RulesFile> = {
      "2026-27/example": {
        year: "2025-26",
        area: "example",
        label: "Example",
        parameters: {
          noSource: { label: "x", unit: "rate", value: 0.2, source: "" },
          unknownSource: { label: "x", unit: "rate", value: 0.2, source: "nowhere" },
          rateTooBig: { label: "x", unit: "rate", value: 20, source: "s" },
          both: { label: "x", unit: "gbp_per_year", value: 1, bands: [{ threshold: 0, rate: 0.1 }], source: "s" },
          unordered: { label: "x", unit: "gbp_per_year", bands: [{ threshold: 0, rate: 0.2 }, { threshold: 0, rate: 0.4 }], source: "s" },
        },
      },
    };
    const problems = checkRules(bad, { s: { title: "", publisher: "", url: "", licence: "", accessed: "" } });
    expect(problems).toEqual([
      "2026-27/example: year says 2025-26, folder says 2026-27",
      "2026-27/example.noSource: missing source",
      "2026-27/example.unknownSource: source nowhere is not in sources.yaml",
      "2026-27/example.rateTooBig: a rate must be between 0 and 1",
      "2026-27/example.both: needs exactly one of value or bands",
      "2026-27/example.unordered: band 2: thresholds must increase",
    ]);
  });

  it("a misspelt parameter throws rather than reading as zero", () => {
    expect(() => param(Y, "income_tax", "personal_alowance")).toThrow();
  });
});

// Cross-checks against figures the official sources state in other ways.
describe("2026-27 values agree with each other", () => {
  it("the personal allowance is fully withdrawn exactly where the additional rate starts (£125,140)", () => {
    const pa = num("income_tax", "personal_allowance");
    const end = num("income_tax", "personal_allowance_taper_threshold") + pa / num("income_tax", "personal_allowance_taper_rate");
    expect(end).toBe(125140);
    expect(bands("income_tax", "bands_ruk").at(-1)!.threshold).toBe(125140);
  });

  it("the higher rate starts at £50,270 of income, the same as the NI upper earnings limit", () => {
    const pa = num("income_tax", "personal_allowance");
    expect(pa + bands("income_tax", "bands_ruk")[1]!.threshold).toBe(num("national_insurance", "class1_upper_earnings_limit"));
  });

  it("Scotland: higher rate from £43,663 and advanced rate from £75,001 with a full allowance", () => {
    const pa = num("income_tax", "personal_allowance");
    const scot = bands("income_tax", "bands_scotland");
    expect(pa + scot[3]!.threshold + 1).toBe(43663);
    expect(pa + scot[4]!.threshold + 1).toBe(75001);
  });

  it("employee NI starts where income tax does", () => {
    expect(num("national_insurance", "class1_primary_threshold")).toBe(num("income_tax", "personal_allowance"));
    expect(num("national_insurance", "class4_lower_profits_limit")).toBe(num("income_tax", "personal_allowance"));
  });

  it("the Child Benefit charge reaches 100% at £80,000", () => {
    expect(num("child_benefit", "hicbc_threshold") + num("child_benefit", "hicbc_taper_width")).toBe(80000);
  });

  it("the two-child limit is off from April 2026", () => {
    expect(param(Y, "universal_credit", "two_child_limit").value).toBe(false);
  });
});
