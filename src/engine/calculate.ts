// Works out one household's taxes, benefits and net income for a year under a RuleSet.
// Every line carries its working, in words, so the page can show how each number was reached.
//
// Simplifications (also stated in the rules files):
// - Everything is annual; real income tax and National Insurance work per pay period, Universal
//   Credit per monthly assessment period. Steady income through the year gives the same answer.
// - No rounding to whole pounds or pennies along the way, so results can differ from HMRC and
//   DWP by a few pence.
import type { Band } from "../rules/schema";
import type { Adult, Household } from "./household";
import type { RuleSet } from "./ruleset";

export interface Line {
  label: string;
  /** Pounds a year, or a month where the line is a Universal Credit element. */
  amount: number;
  working: string;
}

export interface AdultResult {
  totalIncome: number;
  adjustedNetIncome: number;
  personalAllowance: number;
  taxableIncome: number;
  incomeTax: number;
  /** Earnings, pensions and property income after pension contributions, and the tax on it (before savings and dividends). */
  nonSavingsIncome: number;
  nonSavingsTax: number;
  savingsTax: number;
  dividendTax: number;
  employeeNI: number;
  selfEmployedNI: number;
  /** Paid by the employer, so not taken from the household's income; needed for costings. */
  employerNI: number;
  employerNIWorking: string;
  lines: Line[];
}

export interface UniversalCreditResult {
  /** Monthly figures. */
  elements: Line[];
  maximum: number;
  earnings: number;
  workAllowance: number;
  taperDeduction: number;
  unearnedIncome: number;
  savingsIncome: number;
  benefitCap: BenefitCapResult;
  award: number;
  /** Why there is no award, when there isn't one for a reason other than income. */
  notEligible?: string;
}

/** Monthly figures. */
export interface BenefitCapResult {
  cap: number;
  /** Capped benefits before the cap: Universal Credit and Child Benefit. */
  benefits: number;
  reduction: number;
  /** Why the cap doesn't apply, if it doesn't. */
  exemption?: string;
  working: string;
}

export interface Result {
  adults: AdultResult[];
  childBenefit: number;
  childBenefitCharge: number;
  universalCredit: UniversalCreditResult;
  grossIncome: number;
  netIncome: number;
  /** The household's lines: income, taxes and benefits, a year. */
  lines: Line[];
}

// One formatter, made once: toLocaleString builds a new one on every call, which made the engine slow.
const money = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gbp = (n: number) => "£" + money.format(n);
const pct = (r: number) => `${+(r * 100).toFixed(2)}%`;

/**
 * Tax on the slice of taxable income running from `start` to `start + amount`, through a schedule of bands.
 * Savings and dividends sit on top of other income, so their slice doesn't start at zero. `rates`, if given,
 * replaces the bands' own rates (dividends use their own rates in the same bands).
 */
export function sliceTax(start: number, amount: number, bands: Band[], rates?: number[]): { tax: number; parts: string[] } {
  let tax = 0;
  const parts: string[] = [];
  bands.forEach((band, i) => {
    const top = bands[i + 1]?.threshold ?? Infinity;
    const slice = Math.min(start + amount, top) - Math.max(start, band.threshold);
    if (slice <= 0) return;
    const rate = rates ? rates[i]! : band.rate;
    tax += slice * rate;
    parts.push(`${pct(rate)} of ${gbp(slice)}`);
  });
  return { tax, parts };
}

/** Tax on an amount through a schedule of bands. */
export function bandTax(amount: number, bands: Band[]): { tax: number; working: string } {
  const { tax, parts } = sliceTax(0, amount, bands);
  return { tax, working: parts.join(" + ") || "nothing taxable" };
}

/** Pay from all jobs. */
const pay = (a: Adult) => a.employment + (a.secondJob ?? 0);

/** `allowanceGiven` is personal allowance transferred to a partner (Marriage Allowance). */
function adultTax(a: Adult, h: Household, r: RuleSet, allowanceGiven = 0): AdultResult {
  const it = r.incomeTax;
  const ni = r.ni;
  const lines: Line[] = [];

  // Income is taxed in the legal order: non-savings income, then savings interest, then dividends.
  const property = a.propertyIncome ?? 0;
  const deductions = a.otherDeductions ?? 0;
  const totalIncome = pay(a) + a.selfEmployment + a.pension + property + (a.savingsInterest ?? 0) + (a.dividends ?? 0);
  // Other deductions come off non-savings income first, then savings interest, then dividends.
  const beforeDeductions = Math.max(0, pay(a) + a.selfEmployment + a.pension + property - a.pensionContributions);
  const nonSavings = Math.max(0, beforeDeductions - deductions);
  let deductionsLeft = Math.max(0, deductions - beforeDeductions);
  const savings = Math.max(0, (a.savingsInterest ?? 0) - deductionsLeft);
  deductionsLeft = Math.max(0, deductionsLeft - (a.savingsInterest ?? 0));
  const dividends = Math.max(0, (a.dividends ?? 0) - deductionsLeft);
  const adjustedNetIncome = nonSavings + savings + dividends;
  const allowanceLost = Math.min(it.personalAllowance, it.taperRate * Math.max(0, adjustedNetIncome - it.taperThreshold));
  const personalAllowance = Math.max(0, it.personalAllowance - allowanceLost - allowanceGiven);

  // The personal allowance is used against non-savings income first, then savings, then dividends.
  let allowanceLeft = personalAllowance;
  const nsTaxable = Math.max(0, nonSavings - allowanceLeft);
  allowanceLeft = Math.max(0, allowanceLeft - nonSavings);
  const sTaxable = Math.max(0, savings - allowanceLeft);
  allowanceLeft = Math.max(0, allowanceLeft - savings);
  const dTaxable = Math.max(0, dividends - allowanceLeft);
  const taxableIncome = nsTaxable + sTaxable + dTaxable;

  const regionBands = h.region === "scotland" ? it.bands.scotland : h.region === "wales" ? it.bands.wales : it.bands.ruk;
  const ns = sliceTax(0, nsTaxable, regionBands);

  // Savings and dividends use UK rates and bands everywhere, stacked on top of non-savings income.
  const uk = it.bands.ruk;
  const savingsAllowance = taxableIncome > uk[2]!.threshold ? it.savingsAllowance.additional : taxableIncome > uk[1]!.threshold ? it.savingsAllowance.higher : it.savingsAllowance.basic;
  const startingBand = Math.max(0, it.savingsStartingBand - nsTaxable);
  const savingsNil = Math.min(sTaxable, startingBand + savingsAllowance); // taxed at 0%, but still uses up the band
  const sv = sliceTax(nsTaxable + savingsNil, sTaxable - savingsNil, uk);
  const dividendNil = Math.min(dTaxable, it.dividendAllowance);
  const dv = sliceTax(nsTaxable + sTaxable + dividendNil, dTaxable - dividendNil, uk, it.dividendRates);
  const taxBeforeReductions = ns.tax + sv.tax + dv.tax;
  const reductions = Math.min(a.taxReductions ?? 0, taxBeforeReductions);
  const incomeTax = taxBeforeReductions - reductions;

  const pieces = [`earnings, pensions and property: ${ns.parts.join(" + ") || "nothing taxable"}`];
  if (savings) pieces.push(`savings interest: ${gbp(savingsNil)} at 0% (starting rate and savings allowance)` + (sv.parts.length ? `, then ${sv.parts.join(" + ")}` : ""));
  if (dividends) pieces.push(`dividends: ${gbp(dividendNil)} at 0% (dividend allowance)` + (dv.parts.length ? `, then ${dv.parts.join(" + ")}` : ""));
  lines.push({
    label: "Income tax",
    amount: taxBeforeReductions,
    working:
      `Income ${gbp(totalIncome)}` +
      (a.pensionContributions ? ` less pension contributions ${gbp(a.pensionContributions)}` : "") +
      (deductions ? ` less other deductions ${gbp(deductions)}` : "") +
      ` less personal allowance ${gbp(personalAllowance)}` +
      (allowanceLost ? ` (cut by ${gbp(allowanceLost)} because income is over ${gbp(it.taperThreshold)})` : "") +
      (allowanceGiven ? ` (after transferring ${gbp(allowanceGiven)} to their partner as Marriage Allowance)` : "") +
      ` leaves ${gbp(taxableIncome)} taxable. ${pieces.join("; ")}.`,
  });
  if (reductions) {
    lines.push({ label: "Tax reductions", amount: -reductions, working: "Reliefs given as a cut in the tax bill (such as EIS, SEIS and VCT relief, or relief for tax paid abroad), up to the tax due." });
  }

  const overPensionAge = a.age >= ni.statePensionAge;
  let employeeNI = 0;
  let selfEmployedNI = 0;
  // Class 1 is worked out on each job separately, each with its own thresholds.
  const jobs = [a.employment, a.secondJob].filter((p) => p > 0);
  const jobName = (i: number) => (jobs.length > 1 ? (i === 0 ? "main job: " : "second job: ") : "");
  if (overPensionAge) {
    if (pay(a) || a.selfEmployment) {
      lines.push({ label: "National Insurance", amount: 0, working: `None: at or over State Pension age (${ni.statePensionAge}).` });
    }
  } else {
    const parts = jobs.map((p, i) => {
      const main = Math.max(0, Math.min(p, ni.upperEarningsLimit) - ni.primaryThreshold);
      const above = Math.max(0, p - ni.upperEarningsLimit);
      employeeNI += main * ni.mainRate + above * ni.additionalRate;
      if (!main) return jobName(i) + `nothing, as pay is under ${gbp(ni.primaryThreshold)}`;
      return jobName(i) + `${pct(ni.mainRate)} of ${gbp(main)} (pay between ${gbp(ni.primaryThreshold)} and ${gbp(ni.upperEarningsLimit)})` +
        (above ? ` + ${pct(ni.additionalRate)} of ${gbp(above)} above that` : "");
    });
    if (jobs.length) {
      lines.push({ label: "Employee National Insurance", amount: employeeNI, working: parts.join("; ") + ". Pension contributions don't reduce it." });
    }
    const mainP = Math.max(0, Math.min(a.selfEmployment, ni.upperProfitsLimit) - ni.lowerProfitsLimit);
    const aboveP = Math.max(0, a.selfEmployment - ni.upperProfitsLimit);
    selfEmployedNI = mainP * ni.class4MainRate + aboveP * ni.class4AdditionalRate;
    if (a.selfEmployment) {
      lines.push({
        label: "Self-employed National Insurance (Class 4)",
        amount: selfEmployedNI,
        working: `${pct(ni.class4MainRate)} of ${gbp(mainP)} (profits between ${gbp(ni.lowerProfitsLimit)} and ${gbp(ni.upperProfitsLimit)})` +
          (aboveP ? ` + ${pct(ni.class4AdditionalRate)} of ${gbp(aboveP)} above that` : "") + ".",
      });
    }
  }
  // Employers pay nothing on under-21s' pay up to the upper secondary threshold.
  const employerFrom = a.age < 21 ? Math.max(ni.secondaryThreshold, ni.under21UpperSecondaryThreshold) : ni.secondaryThreshold;
  const employerNI = jobs.reduce((s, p) => s + Math.max(0, p - employerFrom) * ni.secondaryRate, 0);
  const employerNIWorking =
    `${pct(ni.secondaryRate)} of pay above ${gbp(employerFrom)}` + (jobs.length > 1 ? " in each job" : "") +
    (a.age < 21 ? " (the zero rate for employees under 21 covers pay up to that)" : "") +
    ". Not taken from pay, but part of what the job costs.";

  return {
    totalIncome, adjustedNetIncome, personalAllowance, taxableIncome, incomeTax,
    nonSavingsIncome: nonSavings, nonSavingsTax: ns.tax, savingsTax: sv.tax, dividendTax: dv.tax,
    employeeNI, selfEmployedNI, employerNI, employerNIWorking, lines,
  };
}

function childBenefit(h: Household, r: RuleSet): Line {
  const n = h.children.length;
  if (!n || h.claimsChildBenefit === false) return { label: "Child Benefit", amount: 0, working: n ? "Not claimed." : "No children." };
  const cb = r.childBenefit;
  const weekly = cb.eldestWeekly + (n - 1) * cb.otherWeekly;
  return {
    label: "Child Benefit",
    amount: weekly * 52,
    working: `${gbp(cb.eldestWeekly)} a week for the eldest` + (n > 1 ? ` + ${n - 1} × ${gbp(cb.otherWeekly)}` : "") + ` = ${gbp(weekly)} a week, × 52 weeks.`,
  };
}

function childBenefitCharge(benefit: number, adults: AdultResult[], r: RuleSet): Line {
  // Charged on whichever partner has the higher adjusted net income.
  const top = Math.max(...adults.map((a) => a.adjustedNetIncome));
  const cb = r.childBenefit;
  const excess = Math.max(0, top - cb.chargeThreshold);
  // 1% for every whole £200 (with the 2026-27 width of £20,000), up to 100%. With no width at all, the whole of it
  // as soon as income is over the threshold.
  const percent = excess <= 0 ? 0 : cb.chargeTaperWidth > 0 ? Math.min(100, Math.floor(excess / (cb.chargeTaperWidth / 100))) : 100;
  const amount = (benefit * percent) / 100;
  const working = !benefit
    ? "No Child Benefit received."
    : !Number.isFinite(cb.chargeThreshold)
      ? "No charge: it has been removed."
      : excess
      ? `Higher earner's adjusted net income ${gbp(top)} is ${gbp(excess)} over ${gbp(cb.chargeThreshold)}: ${percent}% of Child Benefit` +
        (cb.chargeTaperWidth > 0 ? ` (1% per £${cb.chargeTaperWidth / 100}).` : " (no taper: all of it once over the threshold).")
      : `Higher earner's adjusted net income ${gbp(top)} is not over ${gbp(cb.chargeThreshold)}.`;
  return { label: "High Income Child Benefit Charge", amount, working };
}

function universalCredit(h: Household, adults: AdultResult[], childBenefitYear: number, r: RuleSet): UniversalCreditResult {
  const uc = r.uc;
  const empty = (notEligible: string): UniversalCreditResult => ({
    elements: [], maximum: 0, earnings: 0, workAllowance: 0, taperDeduction: 0, unearnedIncome: 0, savingsIncome: 0,
    benefitCap: { cap: 0, benefits: 0, reduction: 0, exemption: "No Universal Credit.", working: "No Universal Credit, so nothing to cap." },
    award: 0, notEligible,
  });
  if (h.claimsUniversalCredit === false) return empty("Not claimed.");
  if (h.adults.every((a) => a.age >= r.ni.statePensionAge)) {
    return empty("Over State Pension age: Pension Credit would apply instead, which isn't modelled yet.");
  }
  if (h.savings > uc.capitalUpperLimit) return empty(`Savings of ${gbp(h.savings)} are over the ${gbp(uc.capitalUpperLimit)} limit.`);

  const elements: Line[] = [];
  const couple = h.adults.length === 2;
  const allUnder25 = h.adults.every((a) => a.age < 25);
  const standard = couple ? (allUnder25 ? uc.coupleBothUnder25 : uc.couple25Plus) : allUnder25 ? uc.singleUnder25 : uc.single25Plus;
  elements.push({
    label: "Standard allowance",
    amount: standard,
    working: `${couple ? "Couple" : "Single"}, ${allUnder25 ? (couple ? "both under 25" : "under 25") : couple ? "one or both 25 or over" : "25 or over"}.`,
  });

  const kids = h.children;
  if (kids.length) {
    const pre2017 = kids.filter((c) => c.bornBefore2017).length;
    // Under the two-child limit, children born before 6 April 2017 always count; later ones only up to two in total.
    const counted = uc.twoChildLimit ? Math.min(kids.length, Math.max(2, pre2017)) : kids.length;
    const first = pre2017 ? uc.childFirstPre2017 : uc.child;
    elements.push({
      label: "Child element",
      amount: first + (counted - 1) * uc.child,
      working:
        `${pre2017 ? `First child born before April 2017: ${gbp(uc.childFirstPre2017)}` : `${gbp(uc.child)} for the first child`}` +
        (counted > 1 ? ` + ${counted - 1} × ${gbp(uc.child)}` : "") +
        (counted < kids.length ? `. ${kids.length - counted} child(ren) not counted under the two-child limit.` : "."),
    });
    const lower = kids.filter((c) => c.disability === "lower").length;
    const higher = kids.filter((c) => c.disability === "higher").length;
    if (lower || higher) {
      elements.push({
        label: "Disabled child addition",
        amount: lower * uc.disabledChildLower + higher * uc.disabledChildHigher,
        working: [lower && `${lower} × ${gbp(uc.disabledChildLower)} (lower)`, higher && `${higher} × ${gbp(uc.disabledChildHigher)} (higher)`].filter(Boolean).join(" + ") + ".",
      });
    }
  }

  // One health element per household, even if both partners qualify.
  const health = h.adults.some((a) => a.health === "lcwra_protected") ? "lcwra_protected" : h.adults.some((a) => a.health === "lcwra") ? "lcwra" : null;
  if (health) {
    elements.push({
      label: "Health element (LCWRA)",
      amount: health === "lcwra_protected" ? uc.lcwraProtected : uc.lcwra,
      working: health === "lcwra_protected" ? "Protected rate: claimed before April 2026, severe conditions, or terminally ill." : "Rate for new claims from April 2026.",
    });
  }
  // A carer element for each carer, but not for someone who also gets the health element.
  const carers = h.adults.filter((a) => a.carer && a.health === "none").length;
  if (carers) elements.push({ label: "Carer element", amount: carers * uc.carer, working: `${carers} × ${gbp(uc.carer)}.` });

  if (h.rentMonthly > 0) {
    elements.push({ label: "Housing element", amount: h.rentMonthly, working: "Rent as entered. Local Housing Allowance caps aren't applied yet." });
  }

  const allWorking = h.adults.every((a) => pay(a) + a.selfEmployment > 0);
  if (kids.length && h.childcareMonthly > 0 && allWorking) {
    const cap = kids.length > 1 ? uc.childcareMaxTwoPlus : uc.childcareMaxOne;
    const share = h.childcareMonthly * uc.childcareShare;
    elements.push({
      label: "Childcare element",
      amount: Math.min(share, cap),
      working: `${pct(uc.childcareShare)} of ${gbp(h.childcareMonthly)} = ${gbp(share)}` + (share > cap ? `, capped at ${gbp(cap)}.` : "."),
    });
  }

  const maximum = elements.reduce((s, e) => s + e.amount, 0);

  // Earnings count after income tax, National Insurance and pension contributions. Where someone also
  // has pension or property income, the tax on non-savings income is split between them in proportion
  // (a simplification). Property, savings and dividend income don't count as income for Universal Credit:
  // the property and savings themselves count as capital, which isn't modelled beyond the savings entered.
  const earnings = h.adults.reduce((sum, a, i) => {
    const res = adults[i]!;
    const earned = pay(a) + a.selfEmployment - a.pensionContributions;
    const taxShare = res.nonSavingsIncome > 0 ? Math.max(0, earned) / res.nonSavingsIncome : 0;
    return sum + (earned - res.nonSavingsTax * taxShare - res.employeeNI - res.selfEmployedNI) / 12;
  }, 0);
  // Pension income counts in full, before tax (DWP Advice for Decision Making H5004).
  const unearnedIncome = h.adults.reduce((s, a) => s + a.pension, 0) / 12;
  const savingsIncome = h.savings > uc.capitalDisregard ? Math.ceil((h.savings - uc.capitalDisregard) / 250) * uc.tariffPer250 : 0;

  const getsWorkAllowance = kids.length > 0 || health !== null;
  const workAllowance = getsWorkAllowance ? (h.rentMonthly > 0 ? uc.workAllowanceLower : uc.workAllowanceHigher) : 0;
  const taperDeduction = uc.taperRate * Math.max(0, earnings - workAllowance);
  let award = Math.max(0, maximum - taperDeduction - unearnedIncome - savingsIncome);
  const childcare = elements.find((e) => e.label === "Childcare element")?.amount ?? 0;
  const benefitCap = applyBenefitCap(h, r, { award, childBenefitMonthly: childBenefitYear / 12, earnings, health: health !== null, carers, childcare });
  award = Math.max(0, award - benefitCap.reduction);
  if (award < 0.01) award = 0;

  return { elements, maximum, earnings, workAllowance, taperDeduction, unearnedIncome, savingsIncome, benefitCap, award };
}

/** Universal Credit Regulations 2013 regs 79 to 83. Monthly amounts. */
function applyBenefitCap(
  h: Household,
  r: RuleSet,
  x: { award: number; childBenefitMonthly: number; earnings: number; health: boolean; carers: number; childcare: number },
): BenefitCapResult {
  const uc = r.uc;
  const family = h.adults.length === 2 || h.children.length > 0;
  const london = h.region === "london";
  const cap = (london ? (family ? uc.capLondonFamily : uc.capLondonSingle) : family ? uc.capFamily : uc.capSingle) / 12;
  const benefits = x.award + x.childBenefitMonthly;
  const earningsThreshold = (uc.capEarningsHours * uc.nationalLivingWage * 52) / 12;

  const exemption = x.health
    ? "Doesn't apply: the award includes the health element."
    : x.carers
      ? "Doesn't apply: the award includes the carer element."
      : h.children.some((c) => c.disability !== "none")
        ? "Doesn't apply: a child gets a disability benefit (needed for the disabled child addition)."
        : x.earnings >= earningsThreshold
          ? `Doesn't apply: earnings after tax of ${gbp(x.earnings)} a month are at least ${uc.capEarningsHours} hours a week at the National Living Wage (${gbp(earningsThreshold)}).`
          : undefined;
  const capName = `${london ? "London" : "outside London"}, ${family ? "couple or with children" : "single, no children"}`;
  if (!Number.isFinite(cap)) return { cap, benefits, reduction: 0, working: "No benefit cap: it has been removed." };
  if (exemption) return { cap, benefits, reduction: 0, exemption, working: exemption };

  const excess = Math.max(0, benefits - cap);
  // The childcare element is protected: it comes off the reduction.
  const reduction = Math.min(x.award, Math.max(0, excess - x.childcare));
  const working = excess
    ? `Universal Credit plus Child Benefit is ${gbp(benefits)} a month, ${gbp(excess)} over the cap of ${gbp(cap)} (${capName})` +
      (x.childcare ? `, less the childcare element of ${gbp(x.childcare)}, which is protected` : "") + "."
    : `Universal Credit plus Child Benefit is ${gbp(benefits)} a month, within the cap of ${gbp(cap)} (${capName}).`;
  return { cap, benefits, reduction, working };
}

/**
 * Marriage Allowance (Income Tax Act 2007 ss55A to 55E). A partner with income below the personal allowance can
 * transfer part of it to a partner who pays no more than the basic rate (no more than the intermediate rate in
 * Scotland). The receiving partner's tax falls by the amount transferred at the basic rate (taken as the starter rate
 * in Scotland). Claimed only when it leaves the couple better off.
 */
function marriageAllowance(h: Household, r: RuleSet, adults: AdultResult[]): AdultResult[] {
  if (h.adults.length !== 2 || h.claimsMarriageAllowance === false) return adults;
  const it = r.incomeTax;
  const bands = h.region === "scotland" ? it.bands.scotland : h.region === "wales" ? it.bands.wales : it.bands.ruk;
  const higherFrom = bands.find((b) => b.rate >= 0.4)?.threshold ?? Infinity;
  const reliefRate = bands[0]!.rate;
  let best = adults;
  let bestGain = 0;
  for (const i of [0, 1]) {
    const from = adults[i]!;
    const to = adults[1 - i]!;
    if (from.adjustedNetIncome >= it.personalAllowance || to.incomeTax <= 0 || to.taxableIncome > higherFrom) continue;
    const fromAfter = adultTax(h.adults[i]!, h, r, it.marriageAllowanceTransfer);
    const relief = Math.min(reliefRate * it.marriageAllowanceTransfer, to.incomeTax);
    const gain = relief - (fromAfter.incomeTax - from.incomeTax);
    if (gain <= bestGain) continue;
    bestGain = gain;
    const toAfter: AdultResult = {
      ...to,
      incomeTax: to.incomeTax - relief,
      nonSavingsTax: Math.max(0, to.nonSavingsTax - relief),
      lines: [...to.lines, {
        label: "Marriage Allowance",
        amount: -relief,
        working: `Partner transfers ${gbp(it.marriageAllowanceTransfer)} of personal allowance; tax cut by ${pct(reliefRate)} of it, up to the tax due.`,
      }],
    };
    best = i === 0 ? [fromAfter, toAfter] : [toAfter, fromAfter];
  }
  return best;
}

export function calculate(h: Household, r: RuleSet): Result {
  const adults = marriageAllowance(h, r, h.adults.map((a) => adultTax(a, h, r)));
  const cb = childBenefit(h, r);
  const charge = childBenefitCharge(cb.amount, adults, r);
  const uc = universalCredit(h, adults, cb.amount, r);
  const ucYear = uc.award * 12;

  const grossIncome = h.adults.reduce((s, a) => s + pay(a) + a.selfEmployment + a.pension + (a.propertyIncome ?? 0) + (a.savingsInterest ?? 0) + (a.dividends ?? 0), 0);
  const sum = (f: (a: AdultResult) => number) => adults.reduce((s, a) => s + f(a), 0);
  const incomeTax = sum((a) => a.incomeTax);
  const ni = sum((a) => a.employeeNI + a.selfEmployedNI);
  const pensionContributions = h.adults.reduce((s, a) => s + a.pensionContributions, 0);

  const netIncome = grossIncome + cb.amount + ucYear - incomeTax - ni - charge.amount - pensionContributions;

  const lines: Line[] = [
    { label: "Gross income", amount: grossIncome, working: "Earnings, self-employment profits, pensions, property income, savings interest and dividends, before tax." },
    { label: "Income tax", amount: -incomeTax, working: "See each adult." },
    { label: "National Insurance", amount: -ni, working: "See each adult." },
  ];
  if (pensionContributions) lines.push({ label: "Pension contributions", amount: -pensionContributions, working: "Paid into a pension, so not available to spend now." });
  if (cb.amount) lines.push(cb);
  if (charge.amount) lines.push({ ...charge, amount: -charge.amount });
  lines.push({
    label: "Universal Credit",
    amount: ucYear,
    working: uc.notEligible ??
      `Maximum ${gbp(uc.maximum)} a month, less ${pct(r.uc.taperRate)} of earnings over the work allowance (${gbp(uc.taperDeduction)})` +
      (uc.unearnedIncome ? `, less pension income ${gbp(uc.unearnedIncome)}` : "") +
      (uc.savingsIncome ? `, less assumed income from savings ${gbp(uc.savingsIncome)}` : "") +
      (uc.benefitCap.reduction ? `, less ${gbp(uc.benefitCap.reduction)} for the benefit cap` : "") +
      ` = ${gbp(uc.award)} a month, × 12.`,
  });

  return { adults, childBenefit: cb.amount, childBenefitCharge: charge.amount, universalCredit: uc, grossIncome, netIncome, lines };
}

/**
 * Share of an extra amount of pay that the household loses to tax and withdrawn benefits.
 * Measured over a step (default £1,000) because some rules move in whole steps, such as
 * the Child Benefit charge per £200. Any multiple of £200 gives a steady figure from any
 * starting point; smaller steps would flicker between 0 and a spike.
 */
export function marginalRate(h: Household, r: RuleSet, adultIndex = 0, step = 1000, kind: "employment" | "selfEmployment" = "employment"): number {
  const base = calculate(h, r).netIncome;
  const adults = h.adults.map((a, i) => (i === adultIndex ? { ...a, [kind]: a[kind] + step } : a)) as Household["adults"];
  const more = calculate({ ...h, adults }, r).netIncome;
  return 1 - (more - base) / step;
}
