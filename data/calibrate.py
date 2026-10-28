"""Step 5c: adjust the seed's weights so its totals match the published tables.

Usage: .venv/Scripts/python.exe -I data/calibrate.py
Reads data/build/seed.json and data/build/seed_results.csv (from tools/run_population.mjs).
Writes data/build/population.json (the seed with new weights) and data/build/calibration_report.csv.

Method, in plain terms: each household's weight (how many real households it stands for) is
scaled up or down. We search for the scaling that makes the weighted totals as close as possible
to every target at once, while keeping each household's scaling as close to 1 as possible, and never
below 1/10 or above 10. Targets disagree slightly with each other (a survey and admin data never
match exactly), so we minimise the misses rather than force an exact fit, and report every miss.

A household's units (benefit units) share one weight, so a household is never split.
"""

import json
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import optimize, sparse

HERE = Path(__file__).resolve().parent
T = HERE / "targets"
BUILD = HERE / "build"

EARNINGS_2023_24 = 169.0 / 148.36  # OBR average weekly earnings index to 2026-27 (EFO March 2026, table 1.6)
EARNINGS_2024_25 = 169.0 / 156.623
# Interest and dividends are uprated separately (see data/build_seed.py for why and how these were set).
OTHER_UPRATING = {"property": EARNINGS_2023_24, "interest": 1.60, "dividends": 1.03}
MAX_SCALE = 10.0
REGULARISE = 0.02  # how strongly weights are kept near their starting values


@dataclass
class Target:
    group: str
    name: str
    value: float
    row: np.ndarray  # contribution of each household
    importance: float = 1.0
    floor: float = 0.0  # smallest value used when turning misses into percentages


def norm_region(s: str) -> str:
    """One spelling for each region across sources (the FRS says "East", HMRC and DWP "East of England")."""
    name = re.sub(r"\s*\(.*\)$", "", s).lower()
    return "east of england" if name == "east" else name


def load():
    seed = json.loads((BUILD / "seed.json").read_text(encoding="utf-8"))
    units = pd.DataFrame([{
        "id": u["id"], "household": u["household"], "unit": u["unit"], "weight": u["weight"],
        "region": norm_region(u["regionDetail"]), "tenure": u["tenure"], "composition": u["composition"],
        "adults": len(u["data"]["adults"]), "kids": len(u["data"]["children"]),
        "health": any(a["health"] != "none" for a in u["data"]["adults"]),
        "carer": any(a["carer"] and a["health"] == "none" for a in u["data"]["adults"]),
        "disabled_child": any(c["disability"] != "none" for c in u["data"]["children"]),
        "claims_cb": u["data"].get("claimsChildBenefit", True),
        "cb_opted_out": u["data"].get("childBenefitStatus") == "opted_out",
        "rent": u["data"]["rentMonthly"],
        "outside": u.get("outside", False),
    } for u in seed["units"]])
    res = pd.read_csv(BUILD / "seed_results.csv")
    units = units.merge(res, on="id", validate="one_to_one")
    tax = res.set_index("id")[["adult0_tax", "adult1_tax"]]
    adults = pd.DataFrame([{
        "household": u["household"], "region": norm_region(u["regionDetail"]), "age": a["age"], "outside": u.get("outside", False),
        "income_tax": tax.at[u["id"], f"adult{i}_tax"],
        "main_job": a["employment"], "second_job": a.get("secondJob", 0.0),
        "employment": a["employment"] + a.get("secondJob", 0.0), "self_employment": a["selfEmployment"], "pension": a["pension"],
        "property": a.get("propertyIncome", 0.0), "interest": a.get("savingsInterest", 0.0), "dividends": a.get("dividends", 0.0),
        "pension_contributions": a.get("pensionContributions", 0.0),
        "other_deductions": a.get("otherDeductions", 0.0),
    } for u in seed["units"] for i, a in enumerate(u["data"]["adults"])])
    adults["other"] = adults[["property", "interest", "dividends"]].sum(axis=1)
    # Total income as HMRC defines it for its bands, including property, savings and dividend income.
    adults["total"] = adults[["employment", "self_employment", "pension", "other"]].sum(axis=1)
    return seed, units, adults


def household_row(frame: pd.DataFrame, values: np.ndarray, n: int) -> np.ndarray:
    """Sum per-unit (or per-person) values into one number per household."""
    return np.bincount(frame["household"].to_numpy(), weights=values, minlength=n)


def build_targets(units: pd.DataFrame, adults: pd.DataFrame, n: int) -> list[Target]:
    targets: list[Target] = []
    first = units[units["unit"] == 0]

    # --- FRS 2024-25: household counts by region, children and tenure -----------------------
    frs = pd.read_csv(T / "frs_households_region_composition_tenure_2024-25.csv")
    frs.columns = ["region", "kids", "tenure", "households"]
    with_kids_hh = household_row(units, (units["kids"] > 0).astype(float).to_numpy(), n) > 0
    for r in frs.itertuples():
        mask = (first["region"] == norm_region(r.region)) & (first["tenure"] == r.tenure)
        row = household_row(first, mask.astype(float).to_numpy(), n) * ((with_kids_hh) == ("with children" in r.kids and "without" not in r.kids))
        targets.append(Target("FRS households by region, children, tenure", f"{norm_region(r.region)} / {r.kids} / {r.tenure}", r.households, row, 0.5, 20_000))

    # --- FRS 2024-25: household counts by gross income band and composition -----------------
    inc = pd.read_csv(T / "frs_households_income_detailed_composition_2024-25.csv")
    inc.columns = ["band", "composition", "households"]
    hh_income = household_row(units, (units["gross"] + units["child_benefit"] + units["uc_award_month"] * 12).to_numpy(), n)
    hh_comp = first.set_index("household")["composition"].reindex(range(n)).to_numpy()
    for r in inc.itertuples():
        nums = [float(x.replace(",", "")) for x in re.findall(r"£([\d,]+)", r.band)]
        lo, hi = (0.0, nums[0]) if r.band.lower().startswith("under") else (nums[0], np.inf) if "or more" in r.band else (nums[0], nums[1])
        lo, hi = lo * 52 * EARNINGS_2024_25, hi * 52 * EARNINGS_2024_25
        row = ((hh_income >= lo) & (hh_income < hi) & (hh_comp == r.composition)).astype(float)
        targets.append(Target("FRS households by gross income and composition", f"{r.band} / {r.composition}", r.households, row, 0.5, 50_000))

    # --- HMRC SPI 2023-24: people and income by income band (UK) and by region ---------------
    spi = pd.read_csv(T / "hmrc_income_by_region_band_2023_24.csv")
    uk = spi[(spi["region"] == "United Kingdom") & (spi["band_lower"] != "all")].copy()
    uk["lo"] = uk["band_lower"].astype(float)
    other_by_band = pd.read_csv(T / "hmrc_property_interest_dividends_by_band_2023_24.csv").set_index("band_lower")
    pensions_by_band = pd.read_csv(T / "hmrc_pension_contributions_by_band_2023_24.csv").set_index("band_lower")
    edges = sorted(uk["lo"]) + [np.inf]
    for r in uk.itertuples():
        if r.lo < 15_000:
            continue  # the bottom band moves with the frozen personal allowance; left out
        hi = edges[edges.index(r.lo) + 1]
        inb = ((adults["total"] >= r.lo * EARNINGS_2023_24) & (adults["total"] < hi * EARNINGS_2023_24)).to_numpy()
        label = f"£{int(r.lo):,}+"
        g = "HMRC people and income by income band"
        # Low weight: uprating 2023-24 band edges with earnings ignores frozen thresholds pulling people into tax.
        # HMRC's own 2026-27 projections by band (below) take priority.
        targets.append(Target(g, f"{label} people", r.taxpayers_k * 1e3, household_row(adults, inb.astype(float), n), 0.3, 50_000))
        se_people = ((adults["self_employment"] > 0).to_numpy() & inb).astype(float)
        if pd.notna(r.self_employment_people_k):
            targets.append(Target(g, f"{label} self-employed people", r.self_employment_people_k * 1e3, household_row(adults, se_people, n), 1, 50_000))
        for col, amount in [("employment", r.employment_gbp_m), ("self_employment", r.self_employment_gbp_m), ("pension", r.pension_gbp_m)]:
            if pd.notna(amount):
                # Self-employed profits keep full weight: unlike head-counts, they aren't distorted much by frozen thresholds.
                targets.append(Target(g, f"{label} {col}", amount * 1e6 * EARNINGS_2023_24,
                                      household_row(adults, inb * adults[col].to_numpy(), n), 1 if col == "self_employment" else 0.3, 2e9))
        # Table 3.8: pension contributions deducted before tax (net pay and relief at source).
        pcr = pensions_by_band.loc[r.band_lower]
        targets.append(Target("HMRC pension contributions by income band", f"{label} pension contributions",
                              (pcr.net_pay_gbp_m + pcr.relief_at_source_gbp_m) * 1e6 * EARNINGS_2023_24,
                              household_row(adults, inb * adults["pension_contributions"].to_numpy(), n), 1, 1e9))
        targets.append(Target("HMRC other deductions by income band", f"{label} other deductions",
                              pcr.other_deductions_gbp_m * 1e6 * EARNINGS_2023_24,
                              household_row(adults, inb * adults["other_deductions"].to_numpy(), n), 1, 2e8))
        # Table 3.7: property (with HMRC's small "other income"), interest and dividends: amounts and people.
        o = other_by_band.loc[r.band_lower]
        g2 = "HMRC property, interest and dividends by income band"
        for col, people, amount in [("property", o.property_people_k + o.other_people_k, o.property_gbp_m + o.other_gbp_m),
                                    ("interest", o.interest_people_k, o.interest_gbp_m), ("dividends", o.dividends_people_k, o.dividends_gbp_m)]:
            targets.append(Target(g2, f"{label} {col}", amount * 1e6 * OTHER_UPRATING[col], household_row(adults, inb * adults[col].to_numpy(), n), 1, 1e9))
            targets.append(Target(g2, f"{label} {col} people", people * 1e3, household_row(adults, (inb & (adults[col] > 0).to_numpy()).astype(float), n), 0.5, 50_000))
    # HMRC Income Tax liabilities statistics (July 2026), Table 2.5: projected taxpayers and total income by
    # range of total income, for 2026-27 itself, so no uprating. Taxpayers are taken as people above the
    # personal allowance.
    r25 = pd.read_csv(T / "hmrc_income_tax_by_range_2026_27.csv")
    r25 = r25[r25["band_lower"] != "all"].copy()
    r25["lo"] = r25["band_lower"].astype(float)
    edges25 = list(r25["lo"]) + [np.inf]
    payer = (adults["income_tax"] > 0).to_numpy()  # HMRC's tables count only people who actually owe tax
    for i, row in enumerate(r25.itertuples()):
        inb = ((adults["total"] >= row.lo) & (adults["total"] < edges25[i + 1])).to_numpy() & payer
        label = f"£{int(row.lo):,}+"
        g = "HMRC 2026-27 taxpayers and income by range"
        # Weighted up: HMRC's own projection for this exact year is the most direct source for who pays tax.
        targets.append(Target(g, f"{label} taxpayers", row.taxpayers_k * 1e3, household_row(adults, inb.astype(float), n), 2, 50_000))
        targets.append(Target(g, f"{label} total income", row.total_income_gbp_m * 1e6, household_row(adults, inb * adults["total"].to_numpy(), n), 2, 2e9))
    # OBR: employees in 2026-27 (EFO March 2026, table 1.6), any age 16+, including those past State Pension age.
    # People outside private households are in HMRC's counts but not in the household surveys (FRS, LFS), so
    # they're left out of those targets. (The payroll count, 30.3 million in September 2026, is a single month;
    # more people than that are paid at some point in a year, so it isn't a like-for-like target.)
    inside = (~adults["outside"]).to_numpy()
    targets.append(Target("OBR employees", "employees 2026-27", 29.825e6,
                          household_row(adults, ((adults["employment"] > 0).to_numpy() & inside).astype(float), n), 2, 1e6))
    # OBR: wages and salaries in 2026-27 (EFO March 2026, table 1.6), from the national accounts. In 2023-24 they
    # (£1,108bn) were close to HMRC's taxable pay (£1,080bn for taxpayers, plus pay below the personal allowance),
    # so they stand in for total taxable pay, everyone included.
    targets.append(Target("OBR wages and salaries", "all pay 2026-27", 1298.5e9,
                          household_row(adults, adults["employment"].to_numpy(), n), 2, 1e10))
    # FRS 2024-25: adults by age band (the survey's adults include some 16-17 year-olds; ours start at 18).
    fa = pd.read_csv(T / "frs_adults_age_employment_2024-25.csv")
    fa.columns = ["age", "status", "adults"]
    for band, g in fa.groupby("age"):
        nums = [int(x) for x in re.findall(r"\d+", band)]
        lo, hi = (16, 24) if band.startswith("16") else (nums[0], 200) if "over" in band else (nums[0], nums[1])
        inb = ((adults["age"] >= lo) & (adults["age"] <= hi)).to_numpy() & inside
        targets.append(Target("FRS adults by age", band, g["adults"].sum(), household_row(adults, inb.astype(float), n), 1, 500_000))
    # HMRC's costs of the NICs thresholds (tax relief statistics, January 2026; 2025-26, same thresholds and
    # rates as 2026-27). Each job gets its own thresholds, so these pin down the number of jobs and low pay.
    below = lambda limit: np.minimum(adults["main_job"], limit) + np.minimum(adults["second_job"], limit)
    under_spa = (adults["age"] < 66).to_numpy()
    targets.append(Target("HMRC NICs threshold costs", "primary threshold (employees)", 30.4e9,
                          household_row(adults, 0.08 * below(12_570).to_numpy() * under_spa, n), 1, 1e9))
    targets.append(Target("HMRC NICs threshold costs", "secondary threshold (employers)", 24.4e9,
                          household_row(adults, 0.15 * below(5_000).to_numpy(), n), 1, 1e9))
    # HMRC's ready reckoner (June 2025), 2026-27: 1 percentage point on the employer rate raises £11,150m, so the pay
    # it applies to is £1,115bn (above the secondary threshold; above the upper secondary threshold for under-21s).
    # The employee main rate's figure (£5,350m) isn't used: it implies less employee NICs than the OBR forecasts
    # (about £47bn against £51.5bn), so it can't be a plain static base.
    jobs = [adults["main_job"].to_numpy(), adults["second_job"].to_numpy()]
    st = np.where(adults["age"].to_numpy() < 21, 50_270, 5_000)
    employer_base = sum(np.maximum(j - st, 0) for j in jobs)
    targets.append(Target("HMRC NICs pay base (ready reckoner)", "employer rate base", 1115e9, household_row(adults, employer_base, n), 1, 1e10))
    # SPI 2023-24 by region (Table 3.11) and by age (Table 3.2). Used for their shares only: each is scaled so it adds
    # up to HMRC's 2026-27 projection of all taxpayers and their total income (Table 2.5), which already allows for
    # frozen thresholds bringing more people into tax.
    all25 = pd.read_csv(T / "hmrc_income_tax_by_range_2026_27.csv").set_index("band_lower").loc["all"]
    uk_all = spi[(spi["region"] == "United Kingdom") & (spi["band_lower"] == "all")].iloc[0]
    people_scale = all25.taxpayers_k / uk_all.taxpayers_k
    income_scale = all25.total_income_gbp_m / uk_all.total_income_gbp_m
    regional = spi[(spi["band_lower"] == "all") & (spi["region"] != "United Kingdom") & ~spi["region"].isin(["England"])]
    for r in regional.itertuples():
        mask = (adults["region"] == norm_region(r.region)).to_numpy()
        g = "HMRC taxpayers and income by region"
        targets.append(Target(g, f"{r.region} taxpayers", r.taxpayers_k * 1e3 * people_scale, household_row(adults, (mask & payer).astype(float), n), 1, 100_000))
        targets.append(Target(g, f"{r.region} income", r.total_income_gbp_m * 1e6 * income_scale,
                              household_row(adults, mask * payer * adults["total"].to_numpy(), n), 1, 5e9))
    # SPI 2023-24, Table 3.10: taxpayers with self-employment income by range of that income, ranges and amounts uprated
    # with earnings. These pin down the profits Class 4 applies to.
    se = pd.read_csv(T / "hmrc_self_employment_by_range_2023_24.csv")
    se = se[(se["band_lower"] != "all") & (se["band_lower"] != "0")].copy()
    se["lo"] = se["band_lower"].astype(float)
    se_edges = list(se["lo"]) + [np.inf]
    profits = adults["self_employment"].to_numpy()
    for i, r in enumerate(se.itertuples()):
        inb = (profits >= r.lo * EARNINGS_2023_24) & (profits < se_edges[i + 1] * EARNINGS_2023_24) & payer
        g = "HMRC self-employed taxpayers by range of profits"
        targets.append(Target(g, f"£{int(r.lo):,}+ people", r.people_k * 1e3, household_row(adults, inb.astype(float), n), 0.5, 50_000))
        targets.append(Target(g, f"£{int(r.lo):,}+ profits", r.amount_gbp_m * 1e6 * EARNINGS_2023_24, household_row(adults, inb * profits, n), 1, 1e9))
    # Same table, by region and band: how income is spread within each region (Scotland's rates make this matter
    # for tax). Band edges uprated with earnings, as for the UK bands above, and the same low weight, because
    # uprating 2023-24 bands misses frozen thresholds.
    by_band = spi[(spi["band_lower"] != "all") & ~spi["region"].isin(["United Kingdom", "England"])].copy()
    by_band["lo"] = by_band["band_lower"].astype(float)
    for reg, g in by_band.groupby("region"):
        mask = (adults["region"] == norm_region(reg)).to_numpy() & payer
        los = sorted(g["lo"]) + [np.inf]
        for r in g.itertuples():
            if r.lo < 15_000:
                continue  # the bottom band moves with the frozen personal allowance
            hi = los[los.index(r.lo) + 1]
            inb = mask & (adults["total"] >= r.lo * EARNINGS_2023_24).to_numpy() & (adults["total"] < hi * EARNINGS_2023_24).to_numpy()
            g2 = "HMRC taxpayers and income by region and band"
            targets.append(Target(g2, f"{reg} £{int(r.lo):,}+ taxpayers", r.taxpayers_k * 1e3, household_row(adults, inb.astype(float), n), 0.3, 30_000))
            targets.append(Target(g2, f"{reg} £{int(r.lo):,}+ income", r.total_income_gbp_m * 1e6 * EARNINGS_2023_24, household_row(adults, inb * adults["total"].to_numpy(), n), 0.3, 1e9))
    by_age = pd.read_csv(T / "hmrc_income_by_age_2023_24.csv")
    by_age = by_age[by_age["age_range"] != "Totals"]
    for r in by_age.itertuples():
        nums = [int(x) for x in re.findall(r"\d+", r.age_range)]
        lo, hi = (0, 19) if r.age_range.startswith("Under") else (75, 200) if "over" in r.age_range else (nums[0], nums[1])
        inb = ((adults["age"] >= lo) & (adults["age"] <= hi)).to_numpy() & payer
        targets.append(Target("HMRC taxpayers by age", f"{r.age_range} taxpayers", r.taxpayers_k * 1e3 * people_scale,
                              household_row(adults, inb.astype(float), n), 1, 200_000))
        targets.append(Target("HMRC taxpayers by age", f"{r.age_range} income", r.taxpayers_k * 1e3 * r.mean_income_gbp * income_scale,
                              household_row(adults, inb * adults["total"].to_numpy(), n), 0.5, 1e10))

    # --- DWP Universal Credit households, May 2026 (Great Britain) ---------------------------
    on_uc = (units["uc_award_month"] > 0) & (units["region"] != "northern ireland")
    fam = np.where(units["adults"] == 1, "Single", "Couple") + np.where(units["kids"] > 0, ", with children", ", no children")
    tenure = np.select(
        [units["rent"] <= 0, units["tenure"] == "Social rented", units["tenure"] == "Private rented"],
        ["No Housing Entitlement", "Social Rented Sector", "Private Rented Sector"], "Other or unknown")
    award_year = units["uc_award_month"].to_numpy() * 12

    def uc_target(group, name, mask, households, mean=None, floor=20_000):
        m = (on_uc & mask).to_numpy() if hasattr(mask, "to_numpy") else on_uc.to_numpy() & mask
        targets.append(Target(group, f"{name} households", households, household_row(units, m.astype(float), n), 1, floor))
        if mean is not None:
            targets.append(Target(group, f"{name} spending", households * mean * 12, household_row(units, m * award_year, n), 1, floor * 12_000))

    t = pd.read_csv(T / "uc_households_family_tenure_2026_05.csv")
    for r in t[~t["Family Type"].str.startswith("Unknown") & (t["Housing Entitlement - Tenure"] != "Other or unknown")].itertuples():
        uc_target("UC households and spending by family type and tenure", f"{r[1]} / {r[2]}", (fam == r[1]) & (tenure == r[2]), r.households, r.mean_award_gbp_month)
    t = pd.read_csv(T / "uc_households_family_health_carer_2026_05.csv")
    t = t[~t["Family Type"].str.startswith("Unknown")]
    t["health"] = t.iloc[:, 1].isin(["LCWRA", "LCW", "LCW or LCWRA"])
    for (f, h), g in t.groupby(["Family Type", "health"]):
        uc_target("UC households by family type and health condition", f"{f} / {'health element' if h else 'no health element'}",
                  (fam == f) & (units["health"] == h), g["households"].sum())
    for f, g in t[t.iloc[:, 2] == "Yes"].groupby("Family Type"):
        uc_target("UC households with a carer element", f, (fam == f) & units["carer"], g["households"].sum())
    t = pd.read_csv(T / "uc_households_family_children_2026_05.csv")
    t = t[t["Family Type"].str.contains("with children") & t["households"].gt(0)]
    for r in t.itertuples():
        k = 5 if r[2] == "5 or more" else int(r[2]) if str(r[2]).isdigit() else None
        if k is None:
            continue
        kmask = (units["kids"] >= 5) if k == 5 else (units["kids"] == k)
        uc_target("UC households by family type and number of children", f"{r[1]} / {r[2]} children", (fam == r[1]) & kmask, r.households)
    t = pd.read_csv(T / "uc_households_disabled_child_2026_05.csv")
    for r in t[t["Family Type"].str.contains("with children")].itertuples():
        uc_target("UC households with a disabled child", f"{r[1]} / {r[2]}", (fam == r[1]) & (units["disabled_child"] == (r[2] == "Yes")), r.households)
    t = pd.read_csv(T / "uc_households_region_family_2026_05.csv")
    t.columns = ["region", "family", "households", "mean"]
    t = t[~t["region"].isin(["Total", "Unknown"]) & ~t["family"].str.startswith("Unknown")]
    for r in t.itertuples():
        uc_target("UC households by region and family type", f"{r.region} / {r.family}", (units["region"] == r.region.lower()) & (fam == r.family), r.households)

    # --- HMRC Child Benefit, August 2025 -------------------------------------------------------
    cb = pd.read_csv(T / "hmrc_child_benefit_families_by_size_2025_08.csv").iloc[-1]
    paid = (units["child_benefit"] > 0).to_numpy()
    for k, col in [(1, "Families: One child"), (2, "Families: Two children"), (3, "Families: Three children"), (4, "Families: Four children")]:
        targets.append(Target("Child Benefit families by size", f"{k} children", float(cb[col]), household_row(units, (paid & (units["kids"] == k).to_numpy()).astype(float), n), 2, 50_000))
    five = float(cb["Families: Five to Nine children [note 3]"]) + float(cb["Families: Ten or more children [note 3]"])
    targets.append(Target("Child Benefit families by size", "5+ children", five, household_row(units, (paid & (units["kids"] >= 5).to_numpy()).astype(float), n), 2, 50_000))

    # HMRC liabilities 2026-27, Table 2.6: income tax by source. Moderate weight, so total income tax still
    # works partly as a check.
    t26 = pd.read_csv(T / "hmrc_income_tax_by_source_2026_27.csv")
    for kind, column in [("earnings", "non_savings_tax"), ("savings", "savings_tax"), ("dividends", "dividend_tax")]:
        value = pd.to_numeric(t26[t26["line"].str.startswith(f"Income Tax on {kind}")]["all_taxpayers"]).sum() * 1e6
        targets.append(Target("HMRC 2026-27 income tax by source", kind, value, household_row(units, units[column].to_numpy(), n), 1, 1e9))
    # Scottish Fiscal Commission, January 2026: Scottish income tax on non-savings, non-dividend income in 2026-27,
    # £21,508m. The official forecast for this exact year; Scotland's own rates make it a separate check on how
    # income is spread there.
    scottish = (units["region"] == "scotland").to_numpy()
    targets.append(Target("SFC Scottish income tax forecast", "non-savings, non-dividend 2026-27", 21.508e9,
                          household_row(units, scottish * units["non_savings_tax"].to_numpy(), n), 1, 1e9))
    opted = pd.read_csv(T / "hmrc_child_benefit_opted_out_children_by_age_region_2025_08.csv").iloc[0, 1]
    targets.append(Target("Child Benefit opt-outs", "children in opted-out families", float(opted),
                          household_row(units, (units["cb_opted_out"] * units["kids"]).astype(float).to_numpy(), n), 1, 100_000))
    # HBAI 2024-25: all children, including those in families not claiming Child Benefit. People outside private
    # households have no children, so they don't affect it.
    hbai = pd.read_csv(T / "hbai_income_by_person_type_2024-25.csv").set_index("Type of Individual by Age Category")
    targets.append(Target("HBAI children", "children", float(hbai.at["Child", "households"]),
                          household_row(units, units["kids"].astype(float).to_numpy(), n), 1, 500_000))
    targets.append(Target("Child Benefit charge", "revenue (2024-25, provisional)", 360e6, household_row(units, units["child_benefit_charge"].to_numpy(), n), 0.3, 100e6))
    return targets


def solve(targets: list[Target], w0: np.ndarray):
    A = sparse.csr_matrix(np.vstack([t.row for t in targets]))
    tv = np.array([t.value for t in targets])
    scale = np.maximum(np.abs(tv), [t.floor for t in targets])
    imp = np.array([t.importance for t in targets])
    reg = REGULARISE * len(targets) / len(w0)

    def f(x):
        w = w0 * np.exp(x)
        miss = (A @ w - tv) / scale
        loss = np.sum(imp * miss**2) + reg * np.sum(x**2)
        grad = (A.T @ (2 * imp * miss / scale)) * w + 2 * reg * x
        return loss, grad

    bound = np.log(MAX_SCALE)
    out = optimize.minimize(f, np.zeros(len(w0)), jac=True, method="L-BFGS-B", bounds=[(-bound, bound)] * len(w0),
                            options={"maxiter": 3000, "maxfun": 6000})
    return w0 * np.exp(out.x), out


def report(targets, w0, w):
    rows = []
    for t in targets:
        before, after = float(t.row @ w0), float(t.row @ w)
        rows.append({"group": t.group, "target": t.name, "published": t.value, "before": before, "after": after,
                     "miss_before_pct": 100 * (before - t.value) / max(abs(t.value), t.floor),
                     "miss_after_pct": 100 * (after - t.value) / max(abs(t.value), t.floor)})
    return pd.DataFrame(rows)


def main() -> None:
    seed, units, adults = load()
    n = int(units["household"].max()) + 1
    w0 = units[units["unit"] == 0].set_index("household")["weight"].reindex(range(n)).to_numpy()
    targets = build_targets(units, adults, n)
    w, out = solve(targets, w0)
    rep = report(targets, w0, w)
    rep.to_csv(BUILD / "calibration_report.csv", index=False)

    summary = rep.assign(abs_before=rep["miss_before_pct"].abs(), abs_after=rep["miss_after_pct"].abs()).groupby("group").agg(
        targets=("target", "size"), median_miss_before=("abs_before", "median"), median_miss_after=("abs_after", "median"),
        worst_after=("abs_after", "max"))
    pd.set_option("display.width", 200)
    print(summary.round(1).to_string())
    ratio = w / w0
    print(f"\n{len(targets)} targets, {n:,} households. Solver: {out.message} after {out.nit} steps.")
    print(f"Weight changes: median ×{np.median(ratio):.2f}, 5th–95th percentile ×{np.percentile(ratio, 5):.2f}–×{np.percentile(ratio, 95):.2f}, "
          f"at the ×{MAX_SCALE:g} limits: {int(np.sum(ratio > MAX_SCALE * 0.999) + np.sum(ratio < 1 / MAX_SCALE * 1.001))}")

    by_hh = dict(enumerate(w))
    for u in seed["units"]:
        u["weight"] = float(by_hh[u["household"]])
    seed["_about"] = "Calibrated synthetic population. Made-up households, not real people. See POPULATION.md."
    (BUILD / "population.json").write_text(json.dumps(seed), encoding="utf-8")


if __name__ == "__main__":
    main()
