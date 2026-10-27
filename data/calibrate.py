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
        "rent": u["data"]["rentMonthly"],
    } for u in seed["units"]])
    res = pd.read_csv(BUILD / "seed_results.csv")
    units = units.merge(res, on="id", validate="one_to_one")
    adults = pd.DataFrame([{
        "household": u["household"], "region": norm_region(u["regionDetail"]), "age": a["age"],
        "main_job": a["employment"], "second_job": a.get("secondJob", 0.0),
        "employment": a["employment"] + a.get("secondJob", 0.0), "self_employment": a["selfEmployment"], "pension": a["pension"],
        "other": u.get("otherIncome", [0.0] * len(u["data"]["adults"]))[i],
    } for u in seed["units"] for i, a in enumerate(u["data"]["adults"])])
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
    edges = sorted(uk["lo"]) + [np.inf]
    for r in uk.itertuples():
        if r.lo < 15_000:
            continue  # the bottom band moves with the frozen personal allowance; left out
        hi = edges[edges.index(r.lo) + 1]
        inb = ((adults["total"] >= r.lo * EARNINGS_2023_24) & (adults["total"] < hi * EARNINGS_2023_24)).to_numpy()
        label = f"£{int(r.lo):,}+"
        g = "HMRC people and income by income band"
        targets.append(Target(g, f"{label} people", r.taxpayers_k * 1e3, household_row(adults, inb.astype(float), n), 1, 50_000))
        for col, amount in [("employment", r.employment_gbp_m), ("self_employment", r.self_employment_gbp_m), ("pension", r.pension_gbp_m), ("other", r.other_gbp_m)]:
            if pd.notna(amount):
                targets.append(Target(g, f"{label} {col}", amount * 1e6 * EARNINGS_2023_24,
                                      household_row(adults, inb * adults[col].to_numpy(), n), 1, 2e9))
    # OBR: employees in 2026-27 (EFO March 2026, table 1.6), any age 16+, including those past State Pension age.
    targets.append(Target("OBR employees", "employees 2026-27", 29.825e6,
                          household_row(adults, (adults["employment"] > 0).astype(float).to_numpy(), n), 1, 1e6))
    # FRS 2024-25: adults by age band (the survey's adults include some 16-17 year-olds; ours start at 18).
    fa = pd.read_csv(T / "frs_adults_age_employment_2024-25.csv")
    fa.columns = ["age", "status", "adults"]
    for band, g in fa.groupby("age"):
        nums = [int(x) for x in re.findall(r"\d+", band)]
        lo, hi = (16, 24) if band.startswith("16") else (nums[0], 200) if "over" in band else (nums[0], nums[1])
        inb = ((adults["age"] >= lo) & (adults["age"] <= hi)).astype(float).to_numpy()
        targets.append(Target("FRS adults by age", band, g["adults"].sum(), household_row(adults, inb, n), 1, 500_000))
    # HMRC's costs of the NICs thresholds (tax relief statistics, January 2026; 2025-26, same thresholds and
    # rates as 2026-27). Each job gets its own thresholds, so these pin down the number of jobs and low pay.
    below = lambda limit: np.minimum(adults["main_job"], limit) + np.minimum(adults["second_job"], limit)
    under_spa = (adults["age"] < 66).to_numpy()
    targets.append(Target("HMRC NICs threshold costs", "primary threshold (employees)", 30.4e9,
                          household_row(adults, 0.08 * below(12_570).to_numpy() * under_spa, n), 1, 1e9))
    targets.append(Target("HMRC NICs threshold costs", "secondary threshold (employers)", 24.4e9,
                          household_row(adults, 0.15 * below(5_000).to_numpy(), n), 1, 1e9))
    regional = spi[(spi["band_lower"] == "all") & (spi["region"] != "United Kingdom") & ~spi["region"].isin(["England"])]
    taxpayer = (adults["total"] >= 12_570).to_numpy()
    for r in regional.itertuples():
        mask = (adults["region"] == norm_region(r.region)).to_numpy()
        g = "HMRC taxpayers and income by region"
        targets.append(Target(g, f"{r.region} taxpayers", r.taxpayers_k * 1e3, household_row(adults, (mask & taxpayer).astype(float), n), 1, 100_000))
        targets.append(Target(g, f"{r.region} income", r.total_income_gbp_m * 1e6 * EARNINGS_2023_24,
                              household_row(adults, mask * taxpayer * adults["total"].to_numpy(), n), 0.5, 5e9))

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
        targets.append(Target("Child Benefit families by size", f"{k} children", float(cb[col]), household_row(units, (paid & (units["kids"] == k).to_numpy()).astype(float), n), 1, 50_000))
    five = float(cb["Families: Five to Nine children [note 3]"]) + float(cb["Families: Ten or more children [note 3]"])
    targets.append(Target("Child Benefit families by size", "5+ children", five, household_row(units, (paid & (units["kids"] >= 5).to_numpy()).astype(float), n), 1, 50_000))
    opted = pd.read_csv(T / "hmrc_child_benefit_opted_out_children_by_age_region_2025_08.csv").iloc[0, 1]
    targets.append(Target("Child Benefit opt-outs", "children in opted-out families", float(opted),
                          household_row(units, ((~units["claims_cb"]) * units["kids"]).astype(float).to_numpy(), n), 1, 100_000))
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
