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
    bands: { ruk: Band[]; wales: Band[]; scotland: Band[] };
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
      bands: { ruk: b("income_tax", "bands_ruk"), wales: b("income_tax", "bands_wales"), scotland: b("income_tax", "bands_scotland") },
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
