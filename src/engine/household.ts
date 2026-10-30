// What the engine needs to know about a household. Money is in pounds a year unless the
// name says monthly.

/** London is separate from the rest of England because some rules, like the benefit cap, differ there. */
export type Region = "london" | "england" | "wales" | "scotland" | "northern_ireland";

export interface Adult {
  age: number;
  employment: number; // gross pay from the main job
  /** Gross pay from a second job. National Insurance thresholds apply to each job separately. */
  secondJob: number;
  selfEmployment: number; // taxable profits
  pension: number; // State Pension plus private and workplace pensions being paid out
  /** Net rental profit, and other miscellaneous taxable income. Taxed like earnings in 2026-27. */
  propertyIncome: number;
  /** Interest on savings outside ISAs. */
  savingsInterest: number;
  /** Dividends outside ISAs and pensions. */
  dividends: number;
  /** Employee pension contributions under a net pay arrangement: no income tax, but still National Insurance. */
  pensionContributions: number;
  /** Other deductions from income before tax: trading and property losses, qualifying interest, and similar
   * reliefs (HMRC's "other interest, charges and deductions"). */
  otherDeductions?: number;
  /** Reliefs given as a cut in the tax bill rather than in income: EIS, SEIS and VCT relief, relief for tax paid
   * abroad, married couple's allowance and similar. Can't take tax below zero. (Marriage Allowance is worked out
   * separately.) */
  taxReductions?: number;
  /** Universal Credit health element: none, the new-claim rate, or the protected rate. */
  health: "none" | "lcwra" | "lcwra_protected";
  /** Cares for someone at least 35 hours a week. */
  carer: boolean;
}

export interface Child {
  age: number;
  bornBefore2017: boolean; // born before 6 April 2017
  /** Universal Credit disabled child addition. Either rate means the child gets a disability benefit such as DLA. */
  disability: "none" | "lower" | "higher";
}

export type CouncilTaxBand = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I";

/** The home, for council tax (or Northern Ireland's rates). Given to the family liable for the bill only. */
export interface Dwelling {
  /** One of the 12 UK regions, FRS spelling ("North East", ..., "Northern Ireland"): England's Band D varies by region. */
  area: string;
  /** No band in Northern Ireland. */
  band?: CouncilTaxBand;
  /** Northern Ireland: the capital value at 1 January 2005 that rates are charged on. */
  capitalValue?: number;
  /** Adults living in the home, in every family: one alone gets the single person discount. */
  adultsInHome: number;
  /** A fixed number from 0 to 1 for the household, compared with take-up rates to decide whether it claims Council Tax Reduction. */
  takeUpDraw?: number;
}

export interface Household {
  region: Region;
  /** The home, if this family pays the council tax on it. Without one, no council tax is worked out. */
  home?: Dwelling;
  adults: [Adult] | [Adult, Adult];
  children: Child[];
  rentMonthly: number;
  childcareMonthly: number;
  savings: number;
  /** Whether the household claims the benefits it's entitled to. Defaults to yes. */
  claimsUniversalCredit?: boolean;
  claimsChildBenefit?: boolean;
  /** Whether a couple claims Marriage Allowance when it would help (only married couples and civil partners can). */
  claimsMarriageAllowance?: boolean;
}

export function adult(overrides: Partial<Adult> = {}): Adult {
  return { age: 35, employment: 0, secondJob: 0, selfEmployment: 0, pension: 0, propertyIncome: 0, savingsInterest: 0, dividends: 0, pensionContributions: 0, health: "none", carer: false, ...overrides };
}

export function child(overrides: Partial<Child> = {}): Child {
  return { age: 5, bornBefore2017: false, disability: "none", ...overrides };
}

export function household(overrides: Partial<Household> = {}): Household {
  return { region: "england", adults: [adult()], children: [], rentMonthly: 0, childcareMonthly: 0, savings: 0, ...overrides };
}
