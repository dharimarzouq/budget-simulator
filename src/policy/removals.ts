// Removing a tax, allowance or charge altogether. A removal is a change like a lever setting ({ lever: "no_higher",
// value: true } in a policy), but it's applied after every lever, so it can tie one rate to another: with the higher
// rate removed, income above the basic rate band is taxed at whatever the basic rate is set to. Each removal names
// the lever row that carries its button and the levers that no longer mean anything once it's gone.
import type { RuleSet } from "../engine";

export interface Removal {
  id: string;
  /** The lever whose row carries the Remove button. */
  lever: string;
  label: string;
  /** What removing it does, in plain words. */
  means: string;
  /** Levers that no longer mean anything once this is removed (hidden on the page, dropped from the policy). */
  hides: string[];
  apply(r: RuleSet): void;
}

const ruk = (r: RuleSet) => [r.incomeTax.bands.ruk, r.incomeTax.bands.wales];
const scot = (r: RuleSet) => r.incomeTax.bands.scotland;

// In the order they're applied: a band merges into the one below after that one has been settled.
export const REMOVALS: Removal[] = [
  {
    id: "no_higher", lever: "it_higher", label: "Higher rate", hides: ["it_basic_band"],
    means: "Income above the basic rate band is taxed at the basic rate (England, Wales and Northern Ireland). Dividend rates are separate.",
    apply: (r) => ruk(r).forEach((b) => (b[1]!.rate = b[0]!.rate)),
  },
  {
    id: "no_additional", lever: "it_additional", label: "Additional rate", hides: ["it_additional_threshold"],
    means: "Top incomes are taxed at the higher rate (or the basic rate, if that's gone too).",
    apply: (r) => ruk(r).forEach((b) => (b[2]!.rate = b[1]!.rate)),
  },
  {
    id: "no_pa", lever: "it_pa", label: "Personal allowance", hides: ["it_taper"],
    means: "Income tax from the first pound, across the UK. Marriage Allowance goes with it.",
    apply: (r) => void (r.incomeTax.personalAllowance = 0),
  },
  {
    id: "no_taper", lever: "it_taper", label: "Personal allowance taper", hides: [],
    means: "Everyone keeps the full personal allowance, however much they earn.",
    apply: (r) => void (r.incomeTax.taperRate = 0),
  },
  {
    id: "no_dividend_tax", lever: "it_dividend_ordinary", label: "Dividend tax", hides: ["it_dividend_upper", "it_dividend_additional", "it_dividend_allowance"],
    means: "Dividends are untaxed, though they still count towards income for bands and allowances.",
    apply: (r) => void (r.incomeTax.dividendRates = [0, 0, 0]),
  },
  {
    id: "no_savings_allowances", lever: "it_psa_basic", label: "Savings allowances", hides: ["it_psa_higher", "it_savings_starting"],
    means: "No personal savings allowance or starting rate for savings: savings interest outside ISAs is taxed like other income.",
    apply: (r) => {
      r.incomeTax.savingsAllowance = { basic: 0, higher: 0, additional: 0 };
      r.incomeTax.savingsStartingBand = 0;
    },
  },
  {
    id: "no_sc_intermediate", lever: "sc_intermediate", label: "Scottish intermediate rate", hides: [],
    means: "The intermediate band is taxed at the Scottish basic rate.",
    apply: (r) => void (scot(r)[2]!.rate = scot(r)[1]!.rate),
  },
  {
    id: "no_sc_advanced", lever: "sc_advanced", label: "Scottish advanced rate", hides: [],
    means: "The advanced band is taxed at the Scottish higher rate.",
    apply: (r) => void (scot(r)[4]!.rate = scot(r)[3]!.rate),
  },
  {
    id: "no_sc_top", lever: "sc_top", label: "Scottish top rate", hides: [],
    means: "The top band is taxed at the advanced rate (or the higher rate, if that's gone too).",
    apply: (r) => void (scot(r)[5]!.rate = scot(r)[4]!.rate),
  },
  {
    id: "no_sc_starter", lever: "sc_starter", label: "Scottish starter rate", hides: [],
    means: "The starter band is taxed at the Scottish basic rate.",
    apply: (r) => void (scot(r)[0]!.rate = scot(r)[1]!.rate),
  },
  {
    id: "no_ni_employee", lever: "ni_main", label: "Employee National Insurance", hides: ["ni_additional", "ni_pt", "ni_uel"],
    means: "Employees pay no National Insurance on their pay.",
    apply: (r) => {
      r.ni.mainRate = 0;
      r.ni.additionalRate = 0;
    },
  },
  {
    id: "no_ni_employer", lever: "ni_employer", label: "Employer National Insurance", hides: ["ni_st"],
    means: "Employers pay no National Insurance; the Employment Allowance and apprentice relief go with it.",
    apply: (r) => {
      r.ni.secondaryRate = 0;
      r.ni.employmentAllowanceCost = 0;
      r.ni.apprenticeReliefCost = 0;
    },
  },
  {
    id: "no_ni_self", lever: "ni_c4_main", label: "Self-employed National Insurance", hides: ["ni_c4_additional", "ni_lpl", "ni_upl"],
    means: "The self-employed pay no National Insurance on their profits.",
    apply: (r) => {
      r.ni.class4MainRate = 0;
      r.ni.class4AdditionalRate = 0;
    },
  },
  {
    id: "no_benefit_cap", lever: "uc_cap_family", label: "Benefit cap", hides: ["uc_cap_single", "uc_cap_london_family", "uc_cap_london_single"],
    means: "No limit on the total benefits a household out of work can get.",
    apply: (r) => {
      r.uc.capFamily = r.uc.capSingle = r.uc.capLondonFamily = r.uc.capLondonSingle = Infinity;
    },
  },
  {
    id: "no_cb_charge", lever: "cb_charge_threshold", label: "High Income Child Benefit Charge", hides: ["cb_charge_width"],
    means: "Nobody pays Child Benefit back, however much they earn.",
    apply: (r) => void (r.childBenefit.chargeThreshold = Infinity),
  },
];

export const REMOVAL = Object.fromEntries(REMOVALS.map((x) => [x.id, x])) as Record<string, Removal>;
/** The removal whose button sits on a lever's row, if any. */
export const REMOVAL_FOR = Object.fromEntries(REMOVALS.map((x) => [x.lever, x])) as Record<string, Removal>;
