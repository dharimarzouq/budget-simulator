"""Run the test households through PolicyEngine UK and save its answers for the comparison test.

Usage (from the project folder, after setting up .venv-pe as in tools/README.md):
    .venv-pe/Scripts/python.exe -I tools/policyengine_compare.py

Reads test/fixtures/households.json, writes test/fixtures/policyengine.json.
Things we don't model yet are switched off in PolicyEngine where it has a switch
(Council Tax, Pension Credit, Carer's Allowance, childcare schemes), so differences
point at real rule differences. Rents are social rents so no Local Housing Allowance
cap applies, matching our engine for now.
"""

import json
import sys
from importlib.metadata import version
from pathlib import Path

from policyengine_uk import Simulation

ROOT = Path(__file__).resolve().parent.parent
YEAR = 2026  # PolicyEngine's 2026 is the 2026-27 tax year

REGIONS = {
    "london": "LONDON",
    "england": "NORTH_WEST",  # outside London, so the lower benefit cap applies
    "wales": "WALES",
    "scotland": "SCOTLAND",
    "northern_ireland": "NORTHERN_IRELAND",
}

ADULT = {"age": 35, "employment": 0, "selfEmployment": 0, "pension": 0, "pensionContributions": 0, "health": "none", "carer": False,
         "propertyIncome": 0, "savingsInterest": 0, "dividends": 0}
CHILD = {"age": 5, "bornBefore2017": False, "disability": "none"}


def situation(h: dict) -> dict:
    people, adults, children = {}, [], []
    for i, a in enumerate(h["adults"]):
        a = {**ADULT, **a}
        name = f"adult{i}"
        adults.append(name)
        people[name] = {
            "age": {YEAR: a["age"]},
            "employment_income": {YEAR: a["employment"]},
            "self_employment_income": {YEAR: a["selfEmployment"]},
            "private_pension_income": {YEAR: a["pension"]},
            "employee_pension_contributions": {YEAR: a["pensionContributions"]},
            "property_income": {YEAR: a["propertyIncome"]},
            "savings_interest_income": {YEAR: a["savingsInterest"]},
            "dividend_income": {YEAR: a["dividends"]},
            "uc_limited_capability_for_WRA": {YEAR: a["health"] != "none"},
            "is_carer_for_benefits": {YEAR: a["carer"]},
            "would_claim_carers_allowance": {YEAR: False},
            "would_claim_marriage_allowance": {YEAR: h.get("claimsMarriageAllowance", True)},
        }
    childcare = h.get("childcareMonthly", 0) * 12
    for i, c in enumerate(h.get("children", [])):
        c = {**CHILD, **c}
        name = f"child{i}"
        children.append(name)
        age = c["age"]
        if c["bornBefore2017"] and age < 10:
            age = 10  # make sure the birth year falls before April 2017
        people[name] = {
            "age": {YEAR: age},
            "is_disabled_for_benefits": {YEAR: c["disability"] != "none"},
            "meets_uc_higher_disabled_child_condition": {YEAR: c["disability"] == "higher"},
            # The disabled child addition needs a disability benefit; DLA care component stands in for it.
            "dla_sc_category": {YEAR: {"none": "NONE", "lower": "LOWER", "higher": "HIGHER"}[c["disability"]]},
            "childcare_expenses": {YEAR: childcare if i == 0 else 0},
            "would_claim_scp": {YEAR: True},
        }
    health = [{**ADULT, **a}["health"] for a in h["adults"]]
    rent = h.get("rentMonthly", 0) * 12
    return {
        "people": people,
        "benunits": {
            "benunit": {
                "members": adults + children,
                "is_married": {YEAR: len(adults) == 2},  # our engine treats every couple as married (see income_tax.yaml)
                "would_claim_uc": {YEAR: True},
                "would_claim_child_benefit": {YEAR: True},
                "would_claim_uc_childcare": {YEAR: True},
                "would_claim_pc": {YEAR: False},
                "would_claim_council_tax_reduction": {YEAR: False},
                "would_claim_tfc": {YEAR: False},
                "would_claim_extended_childcare": {YEAR: False},
                "would_claim_universal_childcare": {YEAR: False},
                "would_claim_targeted_childcare": {YEAR: False},
                "uc_receives_new_claimant_health_element": {YEAR: "lcwra" in health and "lcwra_protected" not in health},
            }
        },
        "households": {
            "household": {
                "members": adults + children,
                "region": {YEAR: REGIONS[h.get("region", "england")]},
                "tenure_type": {YEAR: "RENT_FROM_COUNCIL" if rent else "OWNED_OUTRIGHT"},
                "rent": {YEAR: rent},
                "council_tax": {YEAR: 0},
                "savings": {YEAR: h.get("savings", 0)},
            }
        },
    }


PERSON_SUMS = ["income_tax", "ni_employee", "ni_self_employed", "ni_class_1_employer", "CB_HITC", "scottish_child_payment", "winter_fuel_allowance", "dla"]
BENUNIT = [
    "child_benefit", "universal_credit", "uc_maximum_amount", "uc_standard_allowance", "uc_child_element",
    "uc_disability_elements", "uc_LCWRA_element", "uc_carer_element", "uc_housing_costs_element",
    "uc_childcare_element", "uc_work_allowance", "uc_earned_income", "uc_unearned_income", "benefit_cap_reduction",
]


def main() -> None:
    households = json.loads((ROOT / "test/fixtures/households.json").read_text(encoding="utf-8"))["households"]
    results = {}
    for h in households:
        sim = Simulation(situation=situation(h))
        out = {}
        for v in PERSON_SUMS:
            out[v] = round(float(sim.calculate(v, YEAR).sum()), 2)
        for v in BENUNIT:
            out[v] = round(float(sim.calculate(v, YEAR)[0]), 2)
        for v in ["household_net_income", "tv_licence"]:
            out[v] = round(float(sim.calculate(v, YEAR)[0]), 2)
        results[h["id"]] = out
        print(f"{h['id']:28} net {out['household_net_income']:>12,.2f}  UC {out['universal_credit']:>10,.2f}", file=sys.stderr)
    payload = {
        "_about": "PolicyEngine UK's answers for test/fixtures/households.json, tax year 2026-27, pounds a year. Made by tools/policyengine_compare.py.",
        "policyengine_uk_version": version("policyengine-uk"),
        "year": YEAR,
        "results": results,
    }
    (ROOT / "test/fixtures/policyengine.json").write_text(json.dumps(payload, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
