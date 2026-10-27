// Our engine against PolicyEngine UK, household by household and line by line.
// PolicyEngine's answers are saved in fixtures/policyengine.json by tools/policyengine_compare.py.
// A mismatch fails the test unless it is listed in fixtures/known-differences.json with a reason.
import { describe, expect, it } from "vitest";
import { adult, calculate, child, household, ruleSet, type Household } from "../src/engine";
import households from "./fixtures/households.json";
import pe from "./fixtures/policyengine.json";
import known from "./fixtures/known-differences.json";

const r = ruleSet("2026-27");
type Fixture = (typeof households.households)[number];
type PE = Record<string, number>;

function toHousehold(f: Fixture): Household {
  const x = f as Fixture & Partial<Household>;
  return household({
    region: x.region ?? "england",
    adults: f.adults.map((a) => adult(a as object)) as Household["adults"],
    children: (x.children ?? []).map((c) => child(c as object)),
    rentMonthly: x.rentMonthly ?? 0,
    childcareMonthly: x.childcareMonthly ?? 0,
    savings: x.savings ?? 0,
  });
}

// What we compare, and how close counts as the same (pounds a year).
const LINES: { name: string; tolerance: number; ours: (res: ReturnType<typeof calculate>) => number; theirs: (p: PE) => number }[] = [
  // PolicyEngine counts the Child Benefit charge as part of income tax; we show it separately.
  { name: "income tax", tolerance: 1, ours: (s) => s.adults.reduce((t, a) => t + a.incomeTax, 0) + s.childBenefitCharge, theirs: (p) => p.income_tax! },
  { name: "employee NI", tolerance: 2, ours: (s) => s.adults.reduce((t, a) => t + a.employeeNI, 0), theirs: (p) => p.ni_employee! },
  { name: "self-employed NI", tolerance: 1, ours: (s) => s.adults.reduce((t, a) => t + a.selfEmployedNI, 0), theirs: (p) => p.ni_self_employed! },
  { name: "employer NI", tolerance: 1, ours: (s) => s.adults.reduce((t, a) => t + a.employerNI, 0), theirs: (p) => p.ni_class_1_employer! },
  { name: "Child Benefit", tolerance: 1, ours: (s) => s.childBenefit, theirs: (p) => p.child_benefit! },
  { name: "Child Benefit charge", tolerance: 1, ours: (s) => s.childBenefitCharge, theirs: (p) => p.CB_HITC! },
  { name: "Universal Credit", tolerance: 1, ours: (s) => s.universalCredit.award * 12, theirs: (p) => p.universal_credit! },
  { name: "UC maximum", tolerance: 1, ours: (s) => s.universalCredit.maximum * 12, theirs: (p) => p.uc_maximum_amount! },
  // PolicyEngine's net income also takes off the TV licence and adds Scottish Child Payment and the Winter Fuel
  // Payment, none of which we model yet. The tolerance allows for PolicyEngine using weekly NI thresholds
  // (£12,584 a year rather than £12,570).
  {
    name: "net income",
    tolerance: 3,
    ours: (s) => s.netIncome,
    theirs: (p) => p.household_net_income! + p.tv_licence! - p.scottish_child_payment! - p.winter_fuel_allowance!,
  },
];

const knownDiffs = known.differences as Record<string, Record<string, string>>;
const results = pe.results as Record<string, PE>;

describe(`matches PolicyEngine UK ${pe.policyengine_uk_version}`, () => {
  for (const f of households.households) {
    const theirs = results[f.id];
    it(`${f.id}: ${f.about}`, () => {
      expect(theirs, "no PolicyEngine result; re-run tools/policyengine_compare.py").toBeDefined();
      const ours = calculate(toHousehold(f), r);
      const mismatches: string[] = [];
      for (const line of LINES) {
        const a = line.ours(ours);
        const b = line.theirs(theirs!);
        const explained = knownDiffs[f.id]?.[line.name] ?? knownDiffs["*"]?.[line.name];
        if (Math.abs(a - b) > line.tolerance && !explained) mismatches.push(`${line.name}: ours ${a.toFixed(2)}, PolicyEngine ${b.toFixed(2)}`);
      }
      expect(mismatches).toEqual([]);
    });
  }
});
