// The levers a user can pull. Each one reads and writes one or more values in a RuleSet, so a policy
// is just a list of lever settings and the engine never changes. Where a lever moves several values
// at once (e.g. the basic rate in England, Wales and Northern Ireland), it says so in its note.
import type { RuleSet } from "../engine";
import { DEPARTMENTS, planFor } from "./spending";

/**
 * "change_share" is a change from today's rates as a share of them (0.01 is 1% higher), and "change_gbp" a change in
 * pounds, for duties where HMRC costs a change rather than a rate: both can go below zero.
 */
export type LeverUnit = "rate" | "gbp" | "gbp_per_year" | "gbp_per_month" | "gbp_per_week" | "flag" | "change_share" | "change_gbp" | "change_bn";
export type LeverValue = number | boolean;

export interface Lever {
  id: string;
  group:
    | "Income tax" | "Income tax (Scotland)" | "National Insurance" | "Universal Credit" | "Child Benefit"
    | "VAT and duties" | "Business and wealth taxes" | "Stamp duty"
    | "Day-to-day spending" | "Investment spending" | "Benefits outside the household model";
  /** For changes that can go either way: how far the slider reaches each side of no change. */
  limit?: number;
  label: string;
  unit: LeverUnit;
  /** A sensible step for controls; rates are fractions, so 0.01 is one percentage point. */
  step: number;
  get(r: RuleSet): LeverValue;
  set(r: RuleSet, v: LeverValue): void;
  note?: string;
}

const num = (v: LeverValue) => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Expected a number, got ${v}`);
  return v;
};

// England, Wales and NI share these band rates and limits: the UK Parliament sets them (Wales's 10p is
// devolved, but a change to the UK rate moves the Welsh rate too).
const ruk = (r: RuleSet) => [r.incomeTax.bands.ruk, r.incomeTax.bands.wales];

function rukBandRate(id: string, label: string, band: number): Lever {
  return {
    id, group: "Income tax", label, unit: "rate", step: 0.01,
    get: (r) => r.incomeTax.bands.ruk[band]!.rate,
    set: (r, v) => ruk(r).forEach((b) => (b[band]!.rate = num(v))),
    note: "England, Wales and Northern Ireland. Scotland sets its own rates.",
  };
}

function scotRate(id: string, label: string, band: number): Lever {
  return {
    id, group: "Income tax (Scotland)", label, unit: "rate", step: 0.01,
    get: (r) => r.incomeTax.bands.scotland[band]!.rate,
    set: (r, v) => void (r.incomeTax.bands.scotland[band]!.rate = num(v)),
    note: "Set by the Scottish Parliament.",
  };
}

function value<K extends keyof RuleSet>(
  id: string, group: Lever["group"], label: string, unit: LeverUnit, step: number, area: K, key: keyof RuleSet[K], note?: string,
): Lever {
  return {
    id, group, label, unit, step, note,
    get: (r) => r[area][key] as LeverValue,
    set: (r, v) => void ((r[area] as Record<string, LeverValue>)[key as string] = unit === "flag" ? Boolean(v) : num(v)),
  };
}

/** A tax the household model doesn't cover: costed from HMRC's ready reckoner (reckoner.ts), under the same id. */
function other(id: string, group: Lever["group"], label: string, unit: LeverUnit, step: number, key: keyof RuleSet["otherTaxes"], note?: string): Lever {
  return {
    id, group, label, unit, step, note,
    get: (r) => r.otherTaxes[key],
    set: (r, v) => void (r.otherTaxes[key] = num(v)),
  };
}
/** A spending change (spending.ts): £bn a year on a department's budget, or a share of a benefit's forecast. */
function spend(id: string, group: Lever["group"], label: string, unit: LeverUnit, step: number, limit: number, note?: string): Lever {
  return {
    id, group, label, unit, step, limit, note,
    get: (r) => r.spending[id] ?? 0,
    set: (r, v) => void (r.spending[id] = num(v)),
  };
}
const BARNETT_NOTE = "Scotland, Wales and Northern Ireland get their Barnett share of a change on top, for the parts of this budget that are devolved.";
// Each side of no change: 30% of the 2027-28 plan, at least £1bn, in whole £bn.
const reach = (plan: number) => Math.max(1, Math.round(plan * 0.3));

const ONE_SIDED ="HMRC costs only a rise; a cut is costed as the mirror image, which is less certain.";

export const LEVERS: Lever[] = [
  // Income tax
  rukBandRate("it_basic", "Basic rate", 0),
  rukBandRate("it_higher", "Higher rate", 1),
  rukBandRate("it_additional", "Additional rate", 2),
  value("it_pa", "Income tax", "Personal allowance", "gbp_per_year", 100, "incomeTax", "personalAllowance",
    "UK-wide. Doesn't move the National Insurance thresholds, which are separate levers."),
  {
    id: "it_basic_band", group: "Income tax", label: "Basic rate band (taxable income taxed at the basic rate)", unit: "gbp_per_year", step: 100,
    get: (r) => r.incomeTax.bands.ruk[1]!.threshold,
    set: (r, v) => ruk(r).forEach((b) => (b[1]!.threshold = num(v))),
    note: "England, Wales and Northern Ireland. The higher rate starts at this plus the personal allowance.",
  },
  {
    id: "it_additional_threshold", group: "Income tax", label: "Additional rate starts at (taxable income)", unit: "gbp_per_year", step: 1000,
    get: (r) => r.incomeTax.bands.ruk[2]!.threshold,
    set: (r, v) => ruk(r).forEach((b) => (b[2]!.threshold = num(v))),
    note: "England, Wales and Northern Ireland.",
  },
  value("it_taper", "Income tax", "Personal allowance withdrawn above", "gbp_per_year", 1000, "incomeTax", "taperThreshold"),
  ...(["ordinary", "upper", "additional"] as const).map((name, i): Lever => ({
    id: `it_dividend_${name}`, group: "Income tax", label: `Dividend ${name} rate`, unit: "rate", step: 0.01,
    get: (r) => r.incomeTax.dividendRates[i]!,
    set: (r, v) => void (r.incomeTax.dividendRates[i] = num(v)),
    note: "UK-wide, including Scotland.",
  })),
  value("it_dividend_allowance", "Income tax", "Dividend allowance", "gbp_per_year", 100, "incomeTax", "dividendAllowance"),
  {
    id: "it_psa_basic", group: "Income tax", label: "Personal savings allowance, basic rate taxpayers", unit: "gbp_per_year", step: 100,
    get: (r) => r.incomeTax.savingsAllowance.basic,
    set: (r, v) => void (r.incomeTax.savingsAllowance.basic = num(v)),
  },
  {
    id: "it_psa_higher", group: "Income tax", label: "Personal savings allowance, higher rate taxpayers", unit: "gbp_per_year", step: 100,
    get: (r) => r.incomeTax.savingsAllowance.higher,
    set: (r, v) => void (r.incomeTax.savingsAllowance.higher = num(v)),
  },
  value("it_savings_starting", "Income tax", "Starting rate for savings band", "gbp_per_year", 500, "incomeTax", "savingsStartingBand"),
  scotRate("sc_starter", "Starter rate", 0),
  scotRate("sc_basic", "Basic rate", 1),
  scotRate("sc_intermediate", "Intermediate rate", 2),
  scotRate("sc_higher", "Higher rate", 3),
  scotRate("sc_advanced", "Advanced rate", 4),
  scotRate("sc_top", "Top rate", 5),

  // National Insurance
  value("ni_main", "National Insurance", "Employee main rate", "rate", 0.01, "ni", "mainRate"),
  value("ni_additional", "National Insurance", "Employee rate above the upper earnings limit", "rate", 0.01, "ni", "additionalRate"),
  value("ni_employer", "National Insurance", "Employer rate", "rate", 0.01, "ni", "secondaryRate"),
  value("ni_pt", "National Insurance", "Employee threshold (primary threshold)", "gbp_per_year", 104, "ni", "primaryThreshold"),
  value("ni_st", "National Insurance", "Employer threshold (secondary threshold)", "gbp_per_year", 104, "ni", "secondaryThreshold"),
  value("ni_uel", "National Insurance", "Upper earnings limit", "gbp_per_year", 520, "ni", "upperEarningsLimit"),
  value("ni_c4_main", "National Insurance", "Self-employed main rate", "rate", 0.01, "ni", "class4MainRate"),
  value("ni_c4_additional", "National Insurance", "Self-employed rate above the upper profits limit", "rate", 0.01, "ni", "class4AdditionalRate"),
  value("ni_lpl", "National Insurance", "Self-employed lower profits limit", "gbp_per_year", 104, "ni", "lowerProfitsLimit"),
  value("ni_upl", "National Insurance", "Self-employed upper profits limit", "gbp_per_year", 520, "ni", "upperProfitsLimit"),

  // Universal Credit (monthly amounts)
  value("uc_single_u25", "Universal Credit", "Standard allowance, single under 25", "gbp_per_month", 5, "uc", "singleUnder25"),
  value("uc_single", "Universal Credit", "Standard allowance, single 25 or over", "gbp_per_month", 5, "uc", "single25Plus"),
  value("uc_couple_u25", "Universal Credit", "Standard allowance, couple both under 25", "gbp_per_month", 5, "uc", "coupleBothUnder25"),
  value("uc_couple", "Universal Credit", "Standard allowance, couple 25 or over", "gbp_per_month", 5, "uc", "couple25Plus"),
  value("uc_child", "Universal Credit", "Child element", "gbp_per_month", 5, "uc", "child"),
  value("uc_child_first", "Universal Credit", "Child element, first child born before April 2017", "gbp_per_month", 5, "uc", "childFirstPre2017"),
  value("uc_two_child_limit", "Universal Credit", "Two-child limit", "flag", 1, "uc", "twoChildLimit",
    "Removed from April 2026. Turning it back on stops the child element for third and later children born after April 2017."),
  value("uc_wa_higher", "Universal Credit", "Work allowance, no housing costs", "gbp_per_month", 10, "uc", "workAllowanceHigher"),
  value("uc_wa_lower", "Universal Credit", "Work allowance, with housing costs", "gbp_per_month", 10, "uc", "workAllowanceLower"),
  value("uc_taper", "Universal Credit", "Taper rate", "rate", 0.01, "uc", "taperRate"),
  value("uc_lcwra", "Universal Credit", "Health element, new claims", "gbp_per_month", 5, "uc", "lcwra"),
  value("uc_lcwra_protected", "Universal Credit", "Health element, protected rate", "gbp_per_month", 5, "uc", "lcwraProtected"),
  value("uc_carer", "Universal Credit", "Carer element", "gbp_per_month", 5, "uc", "carer"),
  value("uc_cap_family", "Universal Credit", "Benefit cap, families (outside London)", "gbp_per_year", 100, "uc", "capFamily"),
  value("uc_cap_single", "Universal Credit", "Benefit cap, single adults (outside London)", "gbp_per_year", 100, "uc", "capSingle"),
  value("uc_cap_london_family", "Universal Credit", "Benefit cap, families (London)", "gbp_per_year", 100, "uc", "capLondonFamily"),
  value("uc_cap_london_single", "Universal Credit", "Benefit cap, single adults (London)", "gbp_per_year", 100, "uc", "capLondonSingle"),

  // Child Benefit (weekly amounts)
  value("cb_eldest", "Child Benefit", "Eldest or only child", "gbp_per_week", 0.05, "childBenefit", "eldestWeekly"),
  value("cb_other", "Child Benefit", "Each other child", "gbp_per_week", 0.05, "childBenefit", "otherWeekly"),
  value("cb_charge_threshold", "Child Benefit", "High Income Child Benefit Charge starts at", "gbp_per_year", 1000, "childBenefit", "chargeThreshold"),
  value("cb_charge_width", "Child Benefit", "Charge reaches 100% this far above the threshold", "gbp_per_year", 1000, "childBenefit", "chargeTaperWidth"),

  // Costed from HMRC's ready reckoner, not the household model.
  other("vat_standard", "VAT and duties", "VAT standard rate", "rate", 0.01, "vatStandard", "Most goods and services."),
  other("vat_reduced", "VAT and duties", "VAT reduced rate", "rate", 0.01, "vatReduced", "Home energy, children's car seats and some others."),
  other("fuel_duty", "VAT and duties", "Fuel duty on petrol and diesel", "change_share", 0.01, "fuelDutyChange", "A change from today's rate, as a share of it."),
  other("beer_cider_duty", "VAT and duties", "Beer and cider duty", "change_share", 0.01, "beerCiderDutyChange", "A change from today's rates, as a share of them."),
  other("wine_duty", "VAT and duties", "Wine duty", "change_share", 0.01, "wineDutyChange", "A change from today's rates, as a share of them."),
  other("spirits_duty", "VAT and duties", "Spirits duty", "change_share", 0.01, "spiritsDutyChange", "A change from today's rates, as a share of them."),
  other("tobacco_duty", "VAT and duties", "Tobacco duty", "change_share", 0.01, "tobaccoDutyChange", "A change from today's rates, as a share of them."),
  other("ved", "VAT and duties", "Vehicle excise duty, change per car a year", "change_gbp", 5, "vedChange", `£1 a year on motorbikes for each £5 on cars, as HMRC costs it. ${ONE_SIDED}`),
  other("apd_reduced", "VAT and duties", "Air passenger duty, reduced rate (short-haul economy), change per passenger", "change_gbp", 1, "apdReducedChange", ONE_SIDED),
  other("ipt_standard", "VAT and duties", "Insurance premium tax, standard rate", "rate", 0.01, "iptStandard"),
  other("ipt_higher", "VAT and duties", "Insurance premium tax, higher rate", "rate", 0.01, "iptHigher", "Travel insurance and some policies sold with appliances and cars."),
  other("corporation_tax", "Business and wealth taxes", "Corporation tax main rate", "rate", 0.01, "corporationTax", `Profits over £250,000. ${ONE_SIDED}`),
  other("cgt_lower", "Business and wealth taxes", "Capital gains tax, basic-rate taxpayers", "rate", 0.01, "cgtLower", `HMRC finds rises raise little or lose money, as people hold on to assets. ${ONE_SIDED}`),
  other("cgt_higher", "Business and wealth taxes", "Capital gains tax, higher-rate taxpayers", "rate", 0.01, "cgtHigher", `HMRC finds rises lose money, as people hold on to assets. ${ONE_SIDED}`),
  other("cgt_allowance", "Business and wealth taxes", "Capital gains tax-free allowance", "gbp_per_year", 500, "cgtAllowance", ONE_SIDED),
  other("cgt_badr", "Business and wealth taxes", "Business Asset Disposal Relief rate", "rate", 0.01, "cgtBadr", `Capital gains tax on selling a business. ${ONE_SIDED}`),
  other("iht_rate", "Business and wealth taxes", "Inheritance tax rate", "rate", 0.01, "ihtRate", ONE_SIDED),
  other("iht_nil_rate_band", "Business and wealth taxes", "Inheritance tax threshold", "gbp", 5000, "ihtNilRateBand", ONE_SIDED),
  other("iht_residence_nil_rate_band", "Business and wealth taxes", "Extra inheritance tax threshold for a home left to children", "gbp", 5000, "ihtResidenceNilRateBand", ONE_SIDED),
  other("sdlt_2", "Stamp duty", "Residential, £125,001 to £250,000", "rate", 0.01, "sdlt2", "England and Northern Ireland; Scotland and Wales have their own taxes."),
  other("sdlt_5", "Stamp duty", "Residential, £250,001 to £925,000", "rate", 0.01, "sdlt5", "England and Northern Ireland."),
  other("sdlt_10", "Stamp duty", "Residential, £925,001 to £1.5 million", "rate", 0.01, "sdlt10", "England and Northern Ireland."),
  other("sdlt_12", "Stamp duty", "Residential, over £1.5 million", "rate", 0.01, "sdlt12", "England and Northern Ireland. HMRC finds a rise here loses money."),
  other("sdlt_additional", "Stamp duty", "Surcharge on additional homes", "rate", 0.01, "sdltAdditional", "England and Northern Ireland. HMRC finds a rise here loses money."),
  other("sdlt_non_resident", "Stamp duty", "Surcharge for non-UK residents", "rate", 0.01, "sdltNonResident", "England and Northern Ireland."),

  // Spending, from April 2027 (spending.ts).
  ...Object.entries(DEPARTMENTS).flatMap(([id, d]): Lever[] => {
    const devolved = Object.values(d.comparability).some((c) => c > 0) ? ` ${BARNETT_NOTE}` : "";
    const plan = (kind: "rdel" | "cdel") => `Planned for 2027-28: £${planFor(id, kind).toFixed(1)}bn.`;
    return [
      spend(`rdel_${id}`, "Day-to-day spending", d.label, "change_bn", 0.1, reach(planFor(id, "rdel")), `${plan("rdel")} More or less than planned, a year.${devolved}`),
      spend(`cdel_${id}`, "Investment spending", d.label, "change_bn", 0.1, reach(planFor(id, "cdel")), `${plan("cdel")} More or less than planned, a year. Doesn't count against the main fiscal rule.${devolved}`),
    ];
  }),
  spend("ame_state_pension", "Benefits outside the household model", "State Pension", "change_share", 0.01, 0.2, "More or less than the OBR forecasts, as a share of it (£159.6bn in 2027-28)."),
  spend("ame_disability", "Benefits outside the household model", "Disability Living Allowance and PIP", "change_share", 0.01, 0.2, "Personal Independence Payment and Disability Living Allowance, as a share of the OBR's forecast."),
  spend("ame_attendance", "Benefits outside the household model", "Attendance Allowance", "change_share", 0.01, 0.2, "As a share of the OBR's forecast."),
  spend("ame_pension_credit", "Benefits outside the household model", "Pension Credit", "change_share", 0.01, 0.2, "As a share of the OBR's forecast."),
  spend("ame_housing_benefit", "Benefits outside the household model", "Housing Benefit", "change_share", 0.01, 0.2, "As a share of the OBR's forecast."),
  spend("ame_carers", "Benefits outside the household model", "Carer's Allowance", "change_share", 0.01, 0.2, "As a share of the OBR's forecast."),
];

export const LEVER = Object.fromEntries(LEVERS.map((l) => [l.id, l])) as Record<string, Lever>;
