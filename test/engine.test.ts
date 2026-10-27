// Households worked out by hand from the 2026-27 rules. The arithmetic for each is in the comment,
// so a failure can be checked without running anything.
import { describe, expect, it } from "vitest";
import { adult, calculate, child, household, marginalRate, ruleSet } from "../src/engine";

const r = ruleSet("2026-27");

describe("income tax and National Insurance", () => {
  it("£30,000 employee in England", () => {
    // Tax: (30,000 - 12,570) × 20% = 3,486. NI: 17,430 × 8% = 1,394.40. Employer NI: 25,000 × 15% = 3,750.
    const res = calculate(household({ adults: [adult({ employment: 30000 })] }), r);
    expect(res.adults[0]!.incomeTax).toBeCloseTo(3486, 2);
    expect(res.adults[0]!.employeeNI).toBeCloseTo(1394.4, 2);
    expect(res.adults[0]!.employerNI).toBeCloseTo(3750, 2);
    expect(res.universalCredit.award).toBe(0);
    expect(res.netIncome).toBeCloseTo(25119.6, 2);
  });

  it("£60,000 employee in England", () => {
    // Tax: 37,700 × 20% + 9,730 × 40% = 7,540 + 3,892 = 11,432. NI: 37,700 × 8% + 9,730 × 2% = 3,016 + 194.60.
    const res = calculate(household({ adults: [adult({ employment: 60000 })] }), r);
    expect(res.adults[0]!.incomeTax).toBeCloseTo(11432, 2);
    expect(res.adults[0]!.employeeNI).toBeCloseTo(3210.6, 2);
  });

  it("£110,000: the personal allowance is cut to £7,570", () => {
    // Allowance: 12,570 - (10,000 / 2) = 7,570. Taxable 102,430: 7,540 + 64,730 × 40% = 33,432.
    const res = calculate(household({ adults: [adult({ employment: 110000 })] }), r);
    expect(res.adults[0]!.personalAllowance).toBeCloseTo(7570, 2);
    expect(res.adults[0]!.incomeTax).toBeCloseTo(33432, 2);
  });

  it("£130,000: no personal allowance left", () => {
    // Taxable 130,000: 37,700 × 20% + 87,440 × 40% + 4,860 × 45% = 7,540 + 34,976 + 2,187 = 44,703.
    const res = calculate(household({ adults: [adult({ employment: 130000 })] }), r);
    expect(res.adults[0]!.personalAllowance).toBe(0);
    expect(res.adults[0]!.incomeTax).toBeCloseTo(44703, 2);
  });

  it("£50,000 in Scotland", () => {
    // Taxable 37,430: 3,967 × 19% + 12,989 × 20% + 14,136 × 21% + 6,338 × 42%
    // = 753.73 + 2,597.80 + 2,968.56 + 2,661.96 = 8,982.05.
    const res = calculate(household({ region: "scotland", adults: [adult({ employment: 50000 })] }), r);
    expect(res.adults[0]!.incomeTax).toBeCloseTo(8982.05, 2);
  });

  it("pension contributions cut income tax but not National Insurance", () => {
    // Pay 60,000, contributions 10,000: taxable 37,430 × 20% = 7,486. NI still on 60,000: 3,210.60.
    const res = calculate(household({ adults: [adult({ employment: 60000, pensionContributions: 10000 })] }), r);
    expect(res.adults[0]!.incomeTax).toBeCloseTo(7486, 2);
    expect(res.adults[0]!.employeeNI).toBeCloseTo(3210.6, 2);
    expect(res.netIncome).toBeCloseTo(60000 - 7486 - 3210.6 - 10000, 2);
  });

  it("£30,000 self-employed", () => {
    // Class 4: 17,430 × 6% = 1,045.80. No employer NI.
    const res = calculate(household({ adults: [adult({ selfEmployment: 30000 })] }), r);
    expect(res.adults[0]!.selfEmployedNI).toBeCloseTo(1045.8, 2);
    expect(res.adults[0]!.employerNI).toBe(0);
  });

  it("pensioner couple: no NI, no Universal Credit", () => {
    // Each: (20,000 - 12,570) × 20% = 1,486.
    const a = adult({ age: 70, pension: 20000 });
    const res = calculate(household({ adults: [a, { ...a }] }), r);
    expect(res.adults.map((x) => x.incomeTax)).toEqual([1486, 1486].map((x) => expect.closeTo(x, 2)));
    expect(res.adults[0]!.employeeNI).toBe(0);
    expect(res.universalCredit.award).toBe(0);
    expect(res.universalCredit.notEligible).toMatch(/Pension Credit/);
  });

  it("a worker over State Pension age pays no employee NI, but the employer still pays", () => {
    const res = calculate(household({ adults: [adult({ age: 67, employment: 30000 })] }), r);
    expect(res.adults[0]!.employeeNI).toBe(0);
    expect(res.adults[0]!.employerNI).toBeCloseTo(3750, 2);
  });
});

describe("Child Benefit and the charge", () => {
  it("two children, one earner on £70,000: half the Child Benefit is charged back", () => {
    // Child Benefit: (27.05 + 17.90) × 52 = 2,337.40. 10,000 over £60,000 = 50 × £200, so 50%: 1,168.70.
    const res = calculate(household({ adults: [adult({ employment: 70000 })], children: [child(), child()] }), r);
    expect(res.childBenefit).toBeCloseTo(2337.4, 2);
    expect(res.childBenefitCharge).toBeCloseTo(1168.7, 2);
  });

  it("the charge uses the higher earner in a couple, not the household total", () => {
    // 55,000 + 55,000: neither is over £60,000, so no charge.
    const res = calculate(household({ adults: [adult({ employment: 55000 }), adult({ employment: 55000 })], children: [child()] }), r);
    expect(res.childBenefitCharge).toBe(0);
  });

  it("all of it is charged back at £80,000", () => {
    const res = calculate(household({ adults: [adult({ employment: 85000 })], children: [child()] }), r);
    expect(res.childBenefitCharge).toBeCloseTo(res.childBenefit, 2);
  });
});

describe("Universal Credit", () => {
  const singleParent = household({
    adults: [adult({ age: 30, employment: 15000 })],
    children: [child({ age: 6 })],
    rentMonthly: 800,
  });

  it("single parent, one child, £15,000 pay, £800 rent", () => {
    // Tax 486, NI 194.40, so net earnings 14,319.60 a year = 1,193.30 a month.
    // Maximum: 424.90 + 303.94 + 800 = 1,528.84. Work allowance (with housing) 427.
    // Taper: 55% × (1,193.30 - 427) = 421.465. Award: 1,107.375 a month.
    const res = calculate(singleParent, r);
    expect(res.universalCredit.maximum).toBeCloseTo(1528.84, 2);
    expect(res.universalCredit.earnings).toBeCloseTo(1193.3, 2);
    expect(res.universalCredit.workAllowance).toBe(427);
    expect(res.universalCredit.award).toBeCloseTo(1107.375, 3);
    // Net: 15,000 - 486 - 194.40 + 1,406.60 Child Benefit + 13,288.50 UC = 29,014.70.
    expect(res.netIncome).toBeCloseTo(29014.7, 2);
  });

  it("their marginal rate is 67.6%: 20% tax + 8% NI, then 55% of what's left", () => {
    // 1 - 0.72 × 0.45 = 0.676.
    expect(marginalRate(singleParent, r)).toBeCloseTo(0.676, 6);
  });

  it("the first child born before April 2017 gets the higher amount", () => {
    const res = calculate({ ...singleParent, children: [child({ bornBefore2017: true, age: 10 }), child()] }, r);
    const el = res.universalCredit.elements.find((e) => e.label === "Child element")!;
    expect(el.amount).toBeCloseTo(351.88 + 303.94, 2);
  });

  it("three children: all counted now, two if the limit were brought back", () => {
    const three = { ...singleParent, children: [child(), child(), child()] };
    const el = (rules: typeof r) => calculate(three, rules).universalCredit.elements.find((e) => e.label === "Child element")!.amount;
    expect(el(r)).toBeCloseTo(3 * 303.94, 2);
    expect(el({ ...r, uc: { ...r.uc, twoChildLimit: true } })).toBeCloseTo(2 * 303.94, 2);
  });

  it("no work allowance without children or a health condition", () => {
    const res = calculate(household({ adults: [adult({ employment: 8000 })], rentMonthly: 600 }), r);
    expect(res.universalCredit.workAllowance).toBe(0);
  });

  it("one health element per couple, and no carer element for the same person", () => {
    const res = calculate(household({ adults: [adult({ health: "lcwra", carer: true }), adult({ health: "lcwra" })] }), r);
    const labels = res.universalCredit.elements.map((e) => e.label);
    expect(labels.filter((l) => l.startsWith("Health"))).toHaveLength(1);
    expect(labels).not.toContain("Carer element");
  });

  it("childcare: 85% of costs, capped, only when every adult works", () => {
    // 85% × 1,500 = 1,275, capped at 1,071.09 for one child.
    const res = calculate({ ...singleParent, childcareMonthly: 1500 }, r);
    expect(res.universalCredit.elements.find((e) => e.label === "Childcare element")!.amount).toBeCloseTo(1071.09, 2);
    const couple = calculate({ ...singleParent, adults: [adult({ employment: 15000 }), adult()], childcareMonthly: 1500 }, r);
    expect(couple.universalCredit.elements.find((e) => e.label === "Childcare element")).toBeUndefined();
  });

  it("savings: £4.35 a month for each £250 (or part) over £6,000; nothing over £16,000", () => {
    // 7,001: 1,001 over = 5 × £250 (rounded up) = 21.75.
    expect(calculate({ ...singleParent, savings: 7001 }, r).universalCredit.savingsIncome).toBeCloseTo(21.75, 2);
    expect(calculate({ ...singleParent, savings: 16001 }, r).universalCredit.award).toBe(0);
  });

  it("pension income is deducted in full, before tax", () => {
    const res = calculate(household({ adults: [adult({ age: 60, pension: 6000 })], rentMonthly: 500 }), r);
    expect(res.universalCredit.unearnedIncome).toBeCloseTo(500, 2);
  });
});

describe("marginal rates", () => {
  it("62% between £100,000 and £125,140: 40% tax, 20% from the lost allowance, 2% NI", () => {
    expect(marginalRate(household({ adults: [adult({ employment: 110000 })] }), r)).toBeCloseTo(0.62, 6);
  });

  it("the Child Benefit charge adds to the rate between £60,000 and £80,000", () => {
    // Two children: 2,337.40 over £20,000 is 11.687% on top of 40% + 2%. Measured over one £200 step.
    const h = household({ adults: [adult({ employment: 70000 })], children: [child(), child()] });
    expect(marginalRate(h, r, 0, 200)).toBeCloseTo(0.4 + 0.02 + 2337.4 / 20000, 6);
  });
});
