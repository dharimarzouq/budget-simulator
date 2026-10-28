// How far to trust a costing.
//
// The confidence grade follows the project's scheme (CLAUDE.md): A official costing, B our microsimulation,
// C international evidence, D informed guess. Everything the page costs today is B: our own microsimulation.
//
// Separately, how well each lever's costing checks against published figures (COSTING.md: HMRC's ready reckoner
// and the population checks). A policy takes its weakest lever's check.
//   close   within about 6% of HMRC's own costing
//   fair    within about 15%, or HMRC's figure inside our range, or no direct check but the totals it rests on match
//   gap     a known gap with published figures: treat as rough
import type { Policy } from "./policy";
import { REMOVAL } from "./removals";

export type Grade = "A" | "B" | "C" | "D";
export const GRADE_MEANING: Record<Grade, string> = {
  A: "An official costing (OBR or HMRC).",
  B: "Our own microsimulation of made-up households weighted to published totals.",
  C: "Based on international evidence.",
  D: "An informed guess.",
};
/** The confidence grade of a costing from this page. */
export const COSTING_GRADE: Grade = "B";

export type Check = "close" | "fair" | "gap";
export const CHECK_MEANING: Record<Check, string> = {
  close: "Checked: within about 6% of HMRC's own costing.",
  fair: "Checked within about 15%, or HMRC's figure is inside our range, or there's no direct check but the totals it rests on match.",
  gap: "A known gap with published figures. Treat as rough.",
};
export const CHECK_LABEL: Record<Check, string> = { close: "close", fair: "fair", gap: "known gap" };

const c = (check: Check, why: string) => ({ check, why });

const CHECKS: Record<string, { check: Check; why: string }> = {
  it_basic: c("fair", "About 10% below HMRC's ready reckoner, static or with behaviour."),
  it_higher: c("fair", "With behaviour, 30% below HMRC, but HMRC's figure is inside our range; HMRC's own evidence suggests responses as big as ours."),
  it_additional: c("fair", "With behaviour, within 3–12% of HMRC, but the range is very wide."),
  it_pa: c("fair", "Within 1–8% of HMRC, depending on the size of the change."),
  it_basic_band: c("close", "Within 2–7% of HMRC."),
  it_additional_threshold: c("fair", "No direct check; the additional rate costing it rests on is within 9% of HMRC."),
  it_taper: c("fair", "No direct check; income tax and taxpayers by income match HMRC's 2026-27 figures."),
  it_dividend_ordinary: c("fair", "No direct check; tax on dividends matches HMRC's 2026-27 figures within 4% for each type of taxpayer."),
  it_dividend_upper: c("fair", "No direct check; tax on dividends matches HMRC's 2026-27 figures within 4% for each type of taxpayer."),
  it_dividend_additional: c("fair", "No direct check; tax on dividends matches HMRC's 2026-27 figures within 4% for each type of taxpayer."),
  it_dividend_allowance: c("fair", "No direct check; tax on dividends matches HMRC's 2026-27 figures within 4% for each type of taxpayer."),
  it_psa_basic: c("fair", "No direct check; tax on savings for basic and higher-rate taxpayers is within 2% of HMRC's."),
  it_psa_higher: c("fair", "No direct check; tax on savings for basic and higher-rate taxpayers is within 2% of HMRC's."),
  it_savings_starting: c("fair", "No direct check; tax on savings for basic and higher-rate taxpayers is within 2% of HMRC's."),
  sc_starter: c("fair", "No ready reckoner check; Scottish income tax is 3.3% over the Scottish Fiscal Commission's forecast."),
  sc_basic: c("fair", "No ready reckoner check; Scottish income tax is 3.3% over the Scottish Fiscal Commission's forecast."),
  sc_intermediate: c("fair", "No ready reckoner check; Scottish income tax is 3.3% over the Scottish Fiscal Commission's forecast."),
  sc_higher: c("fair", "No ready reckoner check; Scottish income tax is 3.3% over the Scottish Fiscal Commission's forecast."),
  sc_advanced: c("fair", "No ready reckoner check; Scottish income tax is 3.3% over the Scottish Fiscal Commission's forecast."),
  sc_top: c("fair", "No ready reckoner check; Scottish income tax is 3.3% over the Scottish Fiscal Commission's forecast."),
  ni_main: c("gap", "About 15% above HMRC; employee NICs are 8% over the OBR's forecast, for reasons only payroll data could settle."),
  ni_additional: c("gap", "About 50% above HMRC's figure."),
  ni_employer: c("close", "Within 3% of HMRC."),
  ni_pt: c("fair", "9% above HMRC."),
  ni_st: c("fair", "13% above HMRC."),
  ni_uel: c("close", "Within 3–6% of HMRC."),
  ni_c4_main: c("gap", "28% below HMRC's ready reckoner, though consistent with HMRC's profit statistics, and self-employed NICs come within 6% of the OBR's total."),
  ni_c4_additional: c("gap", "25–30% above HMRC."),
  ni_lpl: c("close", "Within 6% of HMRC."),
  ni_upl: c("gap", "25% below HMRC (a very small amount)."),
  uc_two_child_limit: c("fair", "About 10% above the OBR's costing of removing it."),
  cb_eldest: c("close", "Within 2% of HMRC."),
  cb_other: c("close", "Within 6% of HMRC."),
  cb_charge_threshold: c("gap", "The charge comes out 18–20% above HMRC's figures, uprated."),
  cb_charge_width: c("gap", "The charge comes out 18–20% above HMRC's figures, uprated."),
};

const REMOVED = c("gap", "Removing something altogether is far bigger than the small changes HMRC's ready reckoner checks. The static figure is mechanical; how people respond to a change this big is the least certain part.");

const UC_DEFAULT =c("fair", "No direct check of this change; Universal Credit spending matches the OBR within 1% and DWP's caseloads closely.");

export function leverCheck(lever: string): { check: Check; why: string } {
  if (REMOVAL[lever]) return REMOVED;
  return CHECKS[lever] ?? (lever.startsWith("uc_") ? UC_DEFAULT : c("gap", "Not checked."));
}

/** The weakest check among the policy's changes ("close" if nothing changed). */
export function policyCheck(policy: Policy): Check {
  const order: Check[] = ["close", "fair", "gap"];
  return policy.reduce<Check>((worst, ch) => (order.indexOf(leverCheck(ch.lever).check) > order.indexOf(worst) ? leverCheck(ch.lever).check : worst), "close");
}
