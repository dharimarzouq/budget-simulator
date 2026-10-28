// The levers a user can pull. Each one reads and writes one or more values in a RuleSet, so a policy
// is just a list of lever settings and the engine never changes. Where a lever moves several values
// at once (e.g. the basic rate in England, Wales and Northern Ireland), it says so in its note.
import type { RuleSet } from "../engine";

export type LeverUnit = "rate" | "gbp_per_year" | "gbp_per_month" | "gbp_per_week" | "flag";
export type LeverValue = number | boolean;

export interface Lever {
  id: string;
  group: "Income tax" | "Income tax (Scotland)" | "National Insurance" | "Universal Credit" | "Child Benefit";
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
];

export const LEVER = Object.fromEntries(LEVERS.map((l) => [l.id, l])) as Record<string, Lever>;
