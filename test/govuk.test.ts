// Our engine against worked examples and stated rates published on gov.uk by HMRC and DWP.
// Each example quotes its page (read 30 October 2026). A mismatch is a bug until explained; the explained
// ones are at the bottom, with the reason. Examples for earlier years run on a copy of the 2026-27 rules
// with that year's figures put in, so they test the method rather than this year's numbers.
import { describe, expect, it } from "vitest";
import { adult, calculate, child, household, ruleSet } from "../src/engine";

const r = ruleSet("2026-27");

describe("HMRC worked examples on gov.uk", () => {
  it("dividends, 2026-27 (gov.uk/tax-on-dividends)", () => {
    // "You get £3,000 in dividends and earn £29,570 in wages in the 2026 to 2027 tax year." Taxable £20,000:
    // 20% on £17,000 of wages, nothing on £500 of dividends (the allowance), 10.75% on £2,500 of dividends.
    const a = calculate(household({ adults: [adult({ employment: 29570, dividends: 3000 })] }), r).adults[0]!;
    expect(a.taxableIncome).toBeCloseTo(20000, 2);
    expect(a.nonSavingsTax).toBeCloseTo(17000 * 0.2, 2);
    expect(a.dividendTax).toBeCloseTo(2500 * 0.1075, 2);
  });

  it("the starting rate for savings (gov.uk/apply-tax-free-interest-on-savings/how-much-is-tax-free)", () => {
    // "You earn £16,000 of wages and £200 interest on your savings." £3,430 of wages over the allowance leaves
    // £1,570 of the £5,000 starting rate, so "you will not have to pay tax on your £200 savings interest".
    const a = calculate(household({ adults: [adult({ employment: 16000, savingsInterest: 200 })] }), r).adults[0]!;
    expect(a.savingsTax).toBe(0);
    expect(a.incomeTax).toBeCloseTo(3430 * 0.2, 2);
  });

  it("the Personal Savings Allowance for a basic rate taxpayer (same page)", () => {
    // "£1,300 in savings interest ... Your Personal Savings Allowance is £1,000 because you're a basic rate
    // taxpayer": £300 at 20%, "tax due on your savings interest is £60". The page doesn't give other income;
    // £30,000 of pay (our choice) makes a basic rate taxpayer with the starting rate used up.
    const a = calculate(household({ adults: [adult({ employment: 30000, savingsInterest: 1300 })] }), r).adults[0]!;
    expect(a.savingsTax).toBeCloseTo(60, 2);
  });

  it("Marriage Allowance (gov.uk/marriage-allowance)", () => {
    // "Your income is £11,500 ... Your partner's income is £20,000". After the £1,260 transfer you pay tax on £190
    // and your partner on £6,170, "which saves you £214 in tax" (tax on £7,430 before, £6,360 after).
    const res = calculate(household({ adults: [adult({ employment: 11500 }), adult({ employment: 20000 })] }), r);
    expect(res.adults[0]!.incomeTax).toBeCloseTo(190 * 0.2, 2);
    expect(res.adults[1]!.incomeTax).toBeCloseTo(6170 * 0.2, 2);
    expect(7430 * 0.2 - (res.adults[0]!.incomeTax + res.adults[1]!.incomeTax)).toBeCloseTo(214, 2);
  });

  it("High Income Child Benefit Charge, 2024-25 onwards (HMRC PAYE manual, PAYE14015)", () => {
    // "income of £68,000 ... Child Benefit for one child of £1,331.20" (£25.60 a week, the 2024-25 rate):
    // (£68,000 - £60,000) / £200 = 40%. The manual then says the charge is £453; see the explained differences.
    const r2425 = ruleSet("2026-27");
    r2425.childBenefit.eldestWeekly = 25.6;
    const res = calculate(household({ adults: [adult({ employment: 68000 }), adult()], children: [child()] }), r2425);
    expect(res.childBenefit).toBeCloseTo(1331.2, 2);
    expect(res.childBenefitCharge).toBeCloseTo(0.4 * 1331.2, 2);
  });

  it("High Income Child Benefit Charge, up to 2023-24 (same page)", () => {
    // "income of £54,000": (£54,000 - £50,000) / £100 = 40%, under the old £50,000 threshold and 1% per £100.
    const old = ruleSet("2026-27");
    old.childBenefit.chargeThreshold = 50000;
    old.childBenefit.chargeTaperWidth = 10000;
    const res = calculate(household({ adults: [adult({ employment: 54000 }), adult()], children: [child(), child()] }), old);
    expect(res.childBenefitCharge / res.childBenefit).toBeCloseTo(0.4, 10);
  });
});

describe("DWP worked examples: Advice for decision making, chapter E2 (2026-27 rates)", () => {
  // https://assets.publishing.service.gov.uk/media/6a0474b6ee62840dba48a1eb/adme2.pdf. Pay in these examples is
  // below the tax and National Insurance thresholds, so a year's pay of 12 times the month gives the same earnings.

  it("Bella: single, 26, no work allowance (E2201)", () => {
    // "£424.90 standard allowance - 55% x (70 + 70 + 70 + 70 + 70 earned incomes) ... = £232.40."
    const res = calculate(household({ adults: [adult({ age: 26, employment: 350 * 12 })] }), r);
    expect(res.universalCredit.maximum).toBeCloseTo(424.9, 2);
    expect(res.universalCredit.award).toBeCloseTo(232.4, 2);
  });

  it("Roy: a couple with a child and £100 rent, lower work allowance (E2205, example 1)", () => {
    // Maximum £1,070.91 (£666.97 standard allowance and child element, £100 housing). "55% of £33 (£460 - £427)
    // = £18.15 - Roy has a UC award of £1052.76".
    const res = calculate(household({ adults: [adult({ employment: 460 * 12 }), adult()], children: [child()], rentMonthly: 100 }), r);
    expect(res.universalCredit.maximum).toBeCloseTo(1070.91, 2);
    expect(res.universalCredit.award).toBeCloseTo(1052.76, 2);
  });

  it("Ben: pay under the work allowance takes nothing off (E2205, example 2)", () => {
    // Maximum £1,150.91 with £180 rent; pay of £300 is under the £427 work allowance, so the award is £1,150.91.
    const res = calculate(household({ adults: [adult({ employment: 300 * 12 }), adult()], children: [child()], rentMonthly: 180 }), r);
    expect(res.universalCredit.maximum).toBeCloseTo(1150.91, 2);
    expect(res.universalCredit.award).toBeCloseTo(1150.91, 2);
  });
});

describe("2026-27 rates and thresholds as gov.uk states them", () => {
  it("income tax in England, Wales and Northern Ireland (gov.uk/income-tax-rates)", () => {
    // Allowance £12,570; 20% to £50,270; 40% to £125,140; 45% above; the allowance falls £1 for every £2 over
    // £100,000, reaching zero at £125,140.
    const tax = (pay: number) => calculate(household({ adults: [adult({ employment: pay })] }), r).adults[0]!;
    expect(tax(50270).incomeTax).toBeCloseTo(37700 * 0.2, 2);
    expect(tax(100000).personalAllowance).toBe(12570);
    expect(tax(125140).personalAllowance).toBe(0);
    expect(tax(150000).incomeTax).toBeCloseTo(37700 * 0.2 + (125140 - 37700) * 0.4 + (150000 - 125140) * 0.45, 2);
  });

  it("Scottish income tax (gov.uk/scottish-income-tax)", () => {
    // Starter 19% from £12,571, basic 20% from £16,538, intermediate 21% from £29,527, higher 42% from £43,663,
    // advanced 45% from £75,001, top 48% over £125,140. As slices of taxable income: 3,967 / 12,989 / 14,136 /
    // 31,338 / 62,710, then the rest.
    const tax = (pay: number) => calculate(household({ region: "scotland", adults: [adult({ employment: pay })] }), r).adults[0]!.incomeTax;
    const lower = 3967 * 0.19 + 12989 * 0.2 + 14136 * 0.21;
    // £80,000: taxable £67,430, so £31,338 at 42% and £5,000 at 45%.
    expect(tax(80000)).toBeCloseTo(lower + 31338 * 0.42 + 5000 * 0.45, 2);
    // £150,000: no allowance, so taxable £150,000: £62,710 at 45% and £24,860 at 48%.
    expect(tax(150000)).toBeCloseTo(lower + 31338 * 0.42 + 62710 * 0.45 + 24860 * 0.48, 2);
  });

  it("National Insurance (gov.uk/national-insurance/how-much-you-pay)", () => {
    // Employees 8% on £1,048 to £4,189 a month and 2% above (the page rounds £12,570 and £50,270 a year to whole
    // pounds a month); self-employed 6% on profits £12,570 to £50,270 and 2% above.
    expect(Math.round(r.ni.primaryThreshold / 12)).toBe(1048);
    expect(Math.round(r.ni.upperEarningsLimit / 12)).toBe(4189);
    const a = calculate(household({ adults: [adult({ employment: 60000 })] }), r).adults[0]!;
    expect(a.employeeNI).toBeCloseTo(37700 * 0.08 + 9730 * 0.02, 2);
    const s = calculate(household({ adults: [adult({ selfEmployment: 60000 })] }), r).adults[0]!;
    expect(s.selfEmployedNI).toBeCloseTo(37700 * 0.06 + 9730 * 0.02, 2);
  });

  it("Universal Credit work allowances and taper (gov.uk/universal-credit/how-your-wages-affect-your-payments)", () => {
    // "£427 a month" with help with housing costs, "£710 a month" without; payment "goes down by 55p" per £1.
    expect(r.uc.workAllowanceLower).toBe(427);
    expect(r.uc.workAllowanceHigher).toBe(710);
    expect(r.uc.taperRate).toBe(0.55);
  });

  it("the benefit cap (gov.uk/benefit-cap/benefit-cap-amounts)", () => {
    // A month: £1,835 couples and single parents, £1,229.42 single adults; in Greater London £2,110.25 and £1,413.92.
    // Our rules hold the yearly figures, which gov.uk's monthly ones round from.
    expect(r.uc.capFamily / 12).toBeCloseTo(1835, 2);
    expect(r.uc.capSingle / 12).toBeCloseTo(1229.42, 1);
    expect(r.uc.capLondonFamily / 12).toBeCloseTo(2110.25, 2);
    expect(r.uc.capLondonSingle / 12).toBeCloseTo(1413.92, 1);
  });
});

describe("explained differences", () => {
  it("HMRC's £453 Child Benefit charge (PAYE14015) is a slip in the manual: 40% of £1,331.20 is £532.48", () => {
    // The manual's own working says 40% of £1,331.20. Its older example also gives £700 for 40% of £1,752
    // (£700.80): rounded down to whole pounds, as tax bills are. We keep the pence, a difference under £1.
    expect(0.4 * 1331.2).toBeCloseTo(532.48, 2);
    expect(Math.floor(0.4 * 1752)).toBe(700);
  });
});
