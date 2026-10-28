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

  it("a second job gets its own National Insurance thresholds, but income tax is on the total", () => {
    // Main job £30,000, second job £8,000. Income tax on £38,000: 25,430 × 20% = 5,086.
    // Employee NI: 17,430 × 8% = 1,394.40 on the main job; nothing on the second (under £12,570).
    // As one £38,000 job it would be 25,430 × 8% = 2,034.40.
    // Employer NI: 15% × 25,000 + 15% × 3,000 = 4,200.
    const res = calculate(household({ adults: [adult({ employment: 30000, secondJob: 8000 })] }), r).adults[0]!;
    expect(res.incomeTax).toBeCloseTo(5086, 2);
    expect(res.employeeNI).toBeCloseTo(1394.4, 2);
    expect(res.employerNI).toBeCloseTo(4200, 2);
  });

  it("employers pay nothing for under-21s up to £50,270, then 15%", () => {
    // £30,000 at 19: no employer NI. £60,000 at 20: 15% × 9,730 = 1,459.50. Employee NI is unchanged.
    expect(calculate(household({ adults: [adult({ age: 19, employment: 30000 })] }), r).adults[0]!.employerNI).toBe(0);
    const res = calculate(household({ adults: [adult({ age: 20, employment: 60000 })] }), r).adults[0]!;
    expect(res.employerNI).toBeCloseTo(1459.5, 2);
    expect(res.employeeNI).toBeCloseTo(3210.6, 2);
  });

  it("a worker over State Pension age pays no employee NI, but the employer still pays", () => {
    const res = calculate(household({ adults: [adult({ age: 67, employment: 30000 })] }), r);
    expect(res.adults[0]!.employeeNI).toBe(0);
    expect(res.adults[0]!.employerNI).toBeCloseTo(3750, 2);
  });
});

describe("savings, dividends and property income", () => {
  const tax = (a: Parameters<typeof adult>[0], region: "england" | "scotland" = "england") =>
    calculate(household({ region, adults: [adult(a)] }), r).adults[0]!.incomeTax;

  it("GOV.UK's example: £16,000 wages and £200 interest, all interest covered by the starting rate", () => {
    // Wages use the allowance, leaving £3,430 taxable; the £5,000 starting band shrinks to £1,570, which covers the £200.
    expect(tax({ employment: 16000, savingsInterest: 200 })).toBeCloseTo(686, 2);
  });

  it("GOV.UK's example: a basic rate taxpayer with £1,300 interest pays 20% on £300", () => {
    // £30,000 wages: 3,486 on wages, then £1,000 savings allowance, then £300 × 20% = 60.
    expect(tax({ employment: 30000, savingsInterest: 1300 })).toBeCloseTo(3546, 2);
  });

  it("a higher rate taxpayer gets a £500 savings allowance and pays 40% on the rest", () => {
    // £60,000 wages (11,432) + £1,000 interest: £500 tax-free, £500 × 40% = 200.
    expect(tax({ employment: 60000, savingsInterest: 1000 })).toBeCloseTo(11632, 2);
  });

  it("the starting rate for savings covers interest when other income is low", () => {
    // £14,000 pension: 1,430 taxable (286 tax). Starting band 5,000 - 1,430 = 3,570, plus £1,000 allowance, covers £4,000.
    expect(tax({ age: 70, pension: 14000, savingsInterest: 4000 })).toBeCloseTo(286, 2);
  });

  it("dividends: £500 allowance, then 10.75% in the basic rate band", () => {
    // £30,000 wages (3,486) + £10,000 dividends: £9,500 × 10.75% = 1,021.25.
    expect(tax({ employment: 30000, dividends: 10000 })).toBeCloseTo(4507.25, 2);
  });

  it("dividends straddling the higher rate threshold are split between 10.75% and 35.75%", () => {
    // £45,000 wages: 32,430 taxable (6,486). Dividends start at 32,430; £500 allowance takes them to 32,930.
    // 4,770 × 10.75% = 512.775 up to 37,700, then 4,730 × 35.75% = 1,690.975.
    expect(tax({ employment: 45000, dividends: 10000 })).toBeCloseTo(6486 + 512.775 + 1690.975, 2);
  });

  it("with only dividends, the personal allowance covers them first", () => {
    // £15,000 dividends: 2,430 above the allowance, £500 tax-free, 1,930 × 10.75% = 207.475.
    expect(tax({ dividends: 15000 })).toBeCloseTo(207.475, 3);
  });

  it("dividends count towards the £100,000 allowance taper", () => {
    // £100,000 wages + £20,000 dividends: income £120,000, allowance cut to £2,570.
    // Wages: 97,430 taxable: 7,540 + 59,730 × 40% = 31,432. Dividends: £500 free, then 19,500 × 35.75% = 6,971.25.
    expect(tax({ employment: 100000, dividends: 20000 })).toBeCloseTo(38403.25, 2);
  });

  it("Scotland: wages use Scottish bands, dividends use UK bands on top", () => {
    // £50,000 wages: 8,982.05 (Scottish). Dividends from 37,430 + £500 allowance = 37,930, above the UK basic
    // rate limit of 37,700, so 4,500 × 35.75% = 1,608.75.
    expect(tax({ employment: 50000, dividends: 5000 }, "scotland")).toBeCloseTo(8982.05 + 1608.75, 2);
  });

  it("property income is taxed like earnings, including at Scottish rates", () => {
    // £20,000 rent profit in Scotland: 7,430 taxable: 3,967 × 19% + 3,463 × 20% = 753.73 + 692.60.
    expect(tax({ propertyIncome: 20000 }, "scotland")).toBeCloseTo(1446.33, 2);
  });

  it("none of these attract National Insurance", () => {
    const res = calculate(household({ adults: [adult({ propertyIncome: 30000, savingsInterest: 5000, dividends: 20000 })] }), r).adults[0]!;
    expect(res.employeeNI + res.selfEmployedNI + res.employerNI).toBe(0);
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

describe("benefit cap", () => {
  // Lone parent, two children, not working, £700 rent, outside London.
  // UC before the cap: 424.90 + 2 × 303.94 + 700 = 1,732.78. Child Benefit: 2,337.40 / 12 = 194.7833.
  // Together 1,927.5633, which is 92.5633 over the £1,835 monthly cap (£22,020 a year).
  const capped = household({ adults: [adult()], children: [child({ age: 4 }), child({ age: 8 })], rentMonthly: 700 });

  it("takes the excess off Universal Credit", () => {
    const uc = calculate(capped, r).universalCredit;
    expect(uc.benefitCap.reduction).toBeCloseTo(92.5633, 3);
    expect(uc.award).toBeCloseTo(1640.2167, 3);
  });

  it("is higher in London, so this household isn't capped there", () => {
    expect(calculate({ ...capped, region: "london" }, r).universalCredit.benefitCap.reduction).toBe(0);
  });

  it("doesn't apply with earnings of 16 hours at the National Living Wage (£881.23 a month after tax)", () => {
    // £12,000 a year: no tax or NI, so £1,000 a month.
    const res = calculate({ ...capped, adults: [adult({ employment: 12000 })], rentMonthly: 1400 }, r).universalCredit;
    expect(res.benefitCap.reduction).toBe(0);
    expect(res.benefitCap.exemption).toMatch(/National Living Wage/);
  });

  it("doesn't apply with a health element, carer element or disabled child", () => {
    for (const h of [
      { ...capped, adults: [adult({ health: "lcwra" as const })] as [ReturnType<typeof adult>] },
      { ...capped, adults: [adult({ carer: true })] as [ReturnType<typeof adult>] },
      { ...capped, children: [child({ disability: "lower" }), child()] },
    ]) {
      expect(calculate(h, r).universalCredit.benefitCap.reduction).toBe(0);
    }
  });

  it("protects the childcare element", () => {
    // £5,000 pay (£416.67 a month, under the work allowance, so no taper), childcare £500 (element 85% = 425),
    // rent £1,200. Maximum 424.90 + 607.88 + 1,200 + 425 = 2,657.78. Plus Child Benefit 194.7833 = 2,852.5633,
    // 1,017.5633 over the cap. Less the 425 childcare element: reduction 592.5633.
    const h = { ...capped, adults: [adult({ employment: 5000 })] as [ReturnType<typeof adult>], rentMonthly: 1200, childcareMonthly: 500 };
    const uc = calculate(h, r).universalCredit;
    expect(uc.benefitCap.reduction).toBeCloseTo(592.5633, 3);
    expect(uc.award).toBeCloseTo(2657.78 - 592.5633, 3);
  });

  it("single adults without children have the lower cap", () => {
    // 424.90 + 1,100 rent = 1,524.90, over the £1,229.42 single cap by 295.48.
    const uc = calculate(household({ adults: [adult()], rentMonthly: 1100 }), r).universalCredit;
    expect(uc.benefitCap.reduction).toBeCloseTo(1524.9 - 14753 / 12, 3);
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
