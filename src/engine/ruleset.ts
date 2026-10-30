// The rules as plain numbers the engine can use. A policy change is a function that takes
// a RuleSet and returns a changed copy, so the engine never reads the YAML directly.
import { param } from "../rules";
import type { Band } from "../rules/schema";

export interface RuleSet {
  year: string;
  incomeTax: {
    personalAllowance: number;
    taperThreshold: number;
    taperRate: number;
    marriageAllowanceTransfer: number;
    bands: { ruk: Band[]; wales: Band[]; scotland: Band[] };
    savingsStartingBand: number;
    savingsAllowance: { basic: number; higher: number; additional: number };
    dividendAllowance: number;
    /** Dividend rates in the UK basic, higher and additional rate bands. */
    dividendRates: [number, number, number];
  };
  ni: {
    statePensionAge: number;
    primaryThreshold: number;
    upperEarningsLimit: number;
    mainRate: number;
    additionalRate: number;
    secondaryThreshold: number;
    secondaryRate: number;
    under21UpperSecondaryThreshold: number;
    /** Lump sums taken off population totals (not per household). */
    employmentAllowanceCost: number;
    apprenticeReliefCost: number;
    lowerProfitsLimit: number;
    upperProfitsLimit: number;
    class4MainRate: number;
    class4AdditionalRate: number;
  };
  childBenefit: {
    eldestWeekly: number;
    otherWeekly: number;
    chargeThreshold: number;
    chargeTaperWidth: number;
  };
  /**
   * Taxes the household calculation doesn't model, costed from HMRC's ready reckoner (src/policy/reckoner.ts). The
   * rates are today's; the "change" fields are changes from today's rates (zero in the rules), for duties where HMRC
   * costs a change rather than a rate.
   */
  otherTaxes: {
    vatStandard: number;
    vatReduced: number;
    corporationTax: number;
    cgtLower: number;
    cgtHigher: number;
    cgtAllowance: number;
    cgtBadr: number;
    ihtRate: number;
    ihtNilRateBand: number;
    ihtResidenceNilRateBand: number;
    sdlt2: number;
    sdlt5: number;
    sdlt10: number;
    sdlt12: number;
    sdltAdditional: number;
    sdltNonResident: number;
    iptStandard: number;
    iptHigher: number;
    /** Changes, as a share of today's duty rates (0.01 is 1% higher). */
    fuelDutyChange: number;
    beerCiderDutyChange: number;
    wineDutyChange: number;
    spiritsDutyChange: number;
    tobaccoDutyChange: number;
    /** Changes in £: vehicle excise duty (£5 a year a car, £1 a motorbike, per HMRC's line) and air passenger duty's reduced rate. */
    vedChange: number;
    apdReducedChange: number;
  };
  /**
   * Spending changes, by lever id (src/policy/spending.ts): departments' budgets in £bn a year more than planned, and
   * benefits outside the household model as a share of the forecast. Empty in the rules; never read by the engine.
   */
  spending: Record<string, number>;
  /** Used only for behavioural costings, never by the household calculation. */
  behaviour: {
    taxableIncomeElasticity: Band[];
    rangeLow: number;
    rangeHigh: number;
  };
  councilTax: {
    /** Average Band D, a year, by FRS region name (England's nine regions, Wales, Scotland). */
    bandD: Record<string, number>;
    /** Each band as a share of Band D: England and Wales, and Scotland. */
    ratios: Record<string, number>;
    scotlandRatios: Record<string, number>;
    singlePersonDiscount: number;
    niRegionalRate: number;
    niDistrictRate: number;
    niCapitalValueCap: number;
    niLonePensionerAllowance: number;
    ctr: {
      /** Weekly applicable amounts, pensioner scheme: higher for those who reached pension age before April 2021. */
      pensionerSingleBefore2021: number;
      pensionerCoupleBefore2021: number;
      pensionerSingle: number;
      pensionerCouple: number;
      child: number;
      familyPremium: number;
      taper: number;
      capitalLimit: number;
      pensionerTakeUp: number;
      englandWorkingAgeMax: number;
    };
  };
  uc: {
    // Monthly amounts
    singleUnder25: number;
    single25Plus: number;
    coupleBothUnder25: number;
    couple25Plus: number;
    childFirstPre2017: number;
    child: number;
    twoChildLimit: boolean;
    disabledChildLower: number;
    disabledChildHigher: number;
    lcwra: number;
    lcwraProtected: number;
    carer: number;
    childcareShare: number;
    childcareMaxOne: number;
    childcareMaxTwoPlus: number;
    workAllowanceHigher: number;
    workAllowanceLower: number;
    taperRate: number;
    capitalDisregard: number;
    capitalUpperLimit: number;
    tariffPer250: number;
    // Benefit cap: yearly amounts, and the earnings that exempt a household
    capLondonFamily: number;
    capLondonSingle: number;
    capFamily: number;
    capSingle: number;
    capEarningsHours: number;
    nationalLivingWage: number;
  };
}

/** FRS region names against the rules file's Band D parameters. */
const BAND_D: Record<string, string> = {
  "North East": "band_d_north_east", "North West": "band_d_north_west", "Yorkshire and The Humber": "band_d_yorkshire",
  "East Midlands": "band_d_east_midlands", "West Midlands": "band_d_west_midlands", East: "band_d_east", London: "band_d_london",
  "South East": "band_d_south_east", "South West": "band_d_south_west", Wales: "band_d_wales", Scotland: "band_d_scotland",
};

export function ruleSet(year: string): RuleSet {
  const n = (area: string, name: string) => {
    const v = param(year, area, name).value;
    if (typeof v !== "number") throw new Error(`${year}/${area}.${name} is not a number`);
    return v;
  };
  const b = (area: string, name: string) => {
    const bands = param(year, area, name).bands;
    if (!bands) throw new Error(`${year}/${area}.${name} has no bands`);
    return bands.map((x) => ({ ...x }));
  };
  const flag = (area: string, name: string) => param(year, area, name).value === true;

  return {
    year,
    incomeTax: {
      personalAllowance: n("income_tax", "personal_allowance"),
      taperThreshold: n("income_tax", "personal_allowance_taper_threshold"),
      taperRate: n("income_tax", "personal_allowance_taper_rate"),
      marriageAllowanceTransfer: n("income_tax", "marriage_allowance_transfer"),
      bands: { ruk: b("income_tax", "bands_ruk"), wales: b("income_tax", "bands_wales"), scotland: b("income_tax", "bands_scotland") },
      savingsStartingBand: n("income_tax", "savings_starting_rate_band"),
      savingsAllowance: {
        basic: n("income_tax", "personal_savings_allowance_basic"),
        higher: n("income_tax", "personal_savings_allowance_higher"),
        additional: n("income_tax", "personal_savings_allowance_additional"),
      },
      dividendAllowance: n("income_tax", "dividend_allowance"),
      dividendRates: [n("income_tax", "dividend_ordinary_rate"), n("income_tax", "dividend_upper_rate"), n("income_tax", "dividend_additional_rate")],
    },
    ni: {
      statePensionAge: n("national_insurance", "state_pension_age"),
      primaryThreshold: n("national_insurance", "class1_primary_threshold"),
      upperEarningsLimit: n("national_insurance", "class1_upper_earnings_limit"),
      mainRate: n("national_insurance", "class1_main_rate"),
      additionalRate: n("national_insurance", "class1_additional_rate"),
      secondaryThreshold: n("national_insurance", "class1_secondary_threshold"),
      secondaryRate: n("national_insurance", "class1_secondary_rate"),
      under21UpperSecondaryThreshold: n("national_insurance", "class1_secondary_under21_upper_threshold"),
      employmentAllowanceCost: n("national_insurance", "employment_allowance_cost"),
      apprenticeReliefCost: n("national_insurance", "apprentice_relief_cost"),
      lowerProfitsLimit: n("national_insurance", "class4_lower_profits_limit"),
      upperProfitsLimit: n("national_insurance", "class4_upper_profits_limit"),
      class4MainRate: n("national_insurance", "class4_main_rate"),
      class4AdditionalRate: n("national_insurance", "class4_additional_rate"),
    },
    childBenefit: {
      eldestWeekly: n("child_benefit", "eldest_child_weekly"),
      otherWeekly: n("child_benefit", "other_child_weekly"),
      chargeThreshold: n("child_benefit", "hicbc_threshold"),
      chargeTaperWidth: n("child_benefit", "hicbc_taper_width"),
    },
    otherTaxes: {
      vatStandard: n("other_taxes", "vat_standard_rate"),
      vatReduced: n("other_taxes", "vat_reduced_rate"),
      corporationTax: n("other_taxes", "corporation_tax_main_rate"),
      cgtLower: n("other_taxes", "cgt_lower_rate"),
      cgtHigher: n("other_taxes", "cgt_higher_rate"),
      cgtAllowance: n("other_taxes", "cgt_annual_exempt_amount"),
      cgtBadr: n("other_taxes", "cgt_badr_rate"),
      ihtRate: n("other_taxes", "iht_rate"),
      ihtNilRateBand: n("other_taxes", "iht_nil_rate_band"),
      ihtResidenceNilRateBand: n("other_taxes", "iht_residence_nil_rate_band"),
      sdlt2: n("other_taxes", "sdlt_residential_rate_2"),
      sdlt5: n("other_taxes", "sdlt_residential_rate_5"),
      sdlt10: n("other_taxes", "sdlt_residential_rate_10"),
      sdlt12: n("other_taxes", "sdlt_residential_rate_12"),
      sdltAdditional: n("other_taxes", "sdlt_additional_dwellings"),
      sdltNonResident: n("other_taxes", "sdlt_non_resident"),
      iptStandard: n("other_taxes", "ipt_standard_rate"),
      iptHigher: n("other_taxes", "ipt_higher_rate"),
      fuelDutyChange: 0,
      beerCiderDutyChange: 0,
      wineDutyChange: 0,
      spiritsDutyChange: 0,
      tobaccoDutyChange: 0,
      vedChange: 0,
      apdReducedChange: 0,
    },
    spending: {},
    behaviour: {
      taxableIncomeElasticity: b("behaviour", "taxable_income_elasticity"),
      rangeLow: n("behaviour", "elasticity_range_low"),
      rangeHigh: n("behaviour", "elasticity_range_high"),
    },
    councilTax: {
      bandD: Object.fromEntries(Object.entries(BAND_D).map(([area, name]) => [area, n("council_tax", name)])),
      ratios: Object.fromEntries("ABCDEFGHI".split("").map((b) => [b, n("council_tax", `ratio_${b.toLowerCase()}`)])),
      scotlandRatios: Object.fromEntries("ABCDEFGH".split("").map((b) => [b, n("council_tax", "EFGH".includes(b) ? `scotland_ratio_${b.toLowerCase()}` : `ratio_${b.toLowerCase()}`)])),
      singlePersonDiscount: n("council_tax", "single_person_discount"),
      niRegionalRate: n("council_tax", "ni_regional_rate"),
      niDistrictRate: n("council_tax", "ni_district_rate"),
      niCapitalValueCap: n("council_tax", "ni_capital_value_cap"),
      niLonePensionerAllowance: n("council_tax", "ni_lone_pensioner_allowance"),
      ctr: {
        pensionerSingleBefore2021: n("council_tax", "ctr_pensioner_single_before_2021"),
        pensionerCoupleBefore2021: n("council_tax", "ctr_pensioner_couple_before_2021"),
        pensionerSingle: n("council_tax", "ctr_pensioner_single"),
        pensionerCouple: n("council_tax", "ctr_pensioner_couple"),
        child: n("council_tax", "ctr_child"),
        familyPremium: n("council_tax", "ctr_family_premium"),
        taper: n("council_tax", "ctr_taper"),
        capitalLimit: n("council_tax", "ctr_capital_limit"),
        pensionerTakeUp: n("council_tax", "ctr_pensioner_take_up"),
        englandWorkingAgeMax: n("council_tax", "ctr_england_working_age_max"),
      },
    },
    uc: {
      singleUnder25: n("universal_credit", "standard_allowance_single_under_25"),
      single25Plus: n("universal_credit", "standard_allowance_single_25_plus"),
      coupleBothUnder25: n("universal_credit", "standard_allowance_couple_both_under_25"),
      couple25Plus: n("universal_credit", "standard_allowance_couple_25_plus"),
      childFirstPre2017: n("universal_credit", "child_element_first_pre_2017"),
      child: n("universal_credit", "child_element"),
      twoChildLimit: flag("universal_credit", "two_child_limit"),
      disabledChildLower: n("universal_credit", "disabled_child_lower"),
      disabledChildHigher: n("universal_credit", "disabled_child_higher"),
      lcwra: n("universal_credit", "lcwra_element"),
      lcwraProtected: n("universal_credit", "lcwra_element_protected"),
      carer: n("universal_credit", "carer_element"),
      childcareShare: n("universal_credit", "childcare_share"),
      childcareMaxOne: n("universal_credit", "childcare_max_one_child"),
      childcareMaxTwoPlus: n("universal_credit", "childcare_max_two_plus"),
      workAllowanceHigher: n("universal_credit", "work_allowance_higher"),
      workAllowanceLower: n("universal_credit", "work_allowance_lower"),
      taperRate: n("universal_credit", "taper_rate"),
      capitalDisregard: n("universal_credit", "capital_disregard"),
      capitalUpperLimit: n("universal_credit", "capital_upper_limit"),
      tariffPer250: n("universal_credit", "capital_tariff_income"),
      capLondonFamily: n("universal_credit", "benefit_cap_london_family"),
      capLondonSingle: n("universal_credit", "benefit_cap_london_single"),
      capFamily: n("universal_credit", "benefit_cap_family"),
      capSingle: n("universal_credit", "benefit_cap_single"),
      capEarningsHours: n("universal_credit", "benefit_cap_earnings_hours"),
      nationalLivingWage: n("universal_credit", "national_living_wage"),
    },
  };
}
