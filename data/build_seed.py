"""Build the seed population: made-up households spread across every kind of household the UK has,
with starting weights. Step 5c then adjusts the weights so totals match the published tables.

Usage: .venv/Scripts/python.exe -I data/build_seed.py   (after build_targets.py and pull_statxplore.py)
Writes data/build/seed.json. Deterministic: the same inputs give the same households.

The seed only needs to cover the range of real households, not match totals; calibration does that.
Where it uses a guess rather than a published number, the guess is in ASSUMPTIONS below and is
reported in POPULATION.md. Money is 2026-27 pounds.
"""

import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
TARGETS = HERE / "targets"
BUILD = HERE / "build"

N_HOUSEHOLDS = 30_000
MIN_PER_CELL = 40
SEED = 2026

# Uprating to 2026-27, from the OBR March 2026 EFO detailed forecast tables (economy).
EARNINGS_2024_25_TO_2026_27 = 169.0 / 156.623  # average weekly earnings index, table 1.6
EARNINGS_2023_24_TO_2026_27 = 169.0 / 148.36
EARNINGS_2025_26_TO_2026_27 = 169.0 / 163.804  # ASHE 2026's annual pay is for the year to April 2026
# Interest and dividends don't grow with earnings. HMRC projects tax on savings up 48% from 2023-24 to 2026-27
# (more interest, frozen allowances) and on dividends up 25% (mostly the April 2026 rate rise). These factors are
# set so the population's tax on each comes out near HMRC's 2026-27 projections (Income Tax liabilities, Table 2.6).
INTEREST_2023_24_TO_2026_27 = 1.60
DIVIDENDS_2023_24_TO_2026_27 = 1.03
OTHER_UPRATING = {"property": EARNINGS_2023_24_TO_2026_27, "interest": INTEREST_2023_24_TO_2026_27, "dividends": DIVIDENDS_2023_24_TO_2026_27}
RENT_GROWTH = {"Private rented": 1.04 * 1.04, "Social rented": 1.039 * 1.05}  # table 1.18, 2025-26 and 2026-27
NEW_STATE_PENSION = 241.30 * 52  # full rate 2026-27, DWP benefit and pension rates
OLD_STATE_PENSION = 184.90 * 52  # basic State Pension 2026-27, same source

ASSUMPTIONS = {
    # Working-age adults' status (full- or part-time employee or self-employed, unemployed, sick, caring, student,
    # retired...) follows the FRS for their tenure and age band. Pay and profits within each status:
    # Full- and part-time employees' pay is drawn from ASHE 2026 by age group (see Builder.ashe_pay); the only guess
    # is the shape below the 10th percentile, a straight line down from this fraction of it.
    "ashe_bottom_fraction": 0.5,
    "pt_profit_median": 8_000,  # part-time self-employed
    # Side self-employment for employees and pensioners: HMRC counts more people with self-employment income in
    # each band than have it as their main job, with smaller profits each.
    "share_side_self_employment": 0.07,
    "side_profit_median": 4_000,
    "side_profit_sigma": 1.0,
    "pt_profit_sigma": 1.0,
    "share_sick_health_element": 0.85,  # permanently sick or disabled: Universal Credit health element if they claim
    "share_temp_sick_health_element": 0.3,
    "share_unemployed_health_element": 0.1,
    "share_family_carer": 0.25,  # looking after family or home: caring for someone 35+ hours a week
    "share_inactive_carer": 0.15,
    "retired_early_pension_median": 12_000,  # retired under State Pension age: private pension
    "share_parent_carer_disabled_child": 0.6,  # parents of a disabled child, not in well-paid work, who get the carer element
    "share_partner_carer": 0.5,  # partners of someone with the health element, not in well-paid work
    # People HMRC counts as taxpayers but who aren't in private households (students in halls, armed forces in
    # barracks, people here or working for only part of the year, non-residents with UK income). Single adults,
    # in no household-based target; calibration sizes the group against HMRC's taxpayer counts.
    "outside_seeds": 2_000,
    "outside_start_total": 2_500_000,  # starting guess for how many people; calibration can scale it up to 10x or down
    "outside_pay_median": 16_000,  # lowered from £24,000: they're mostly part-year workers, and at £24,000 the population's total pay overshot the national accounts
    "outside_pay_sigma": 0.6,
    "share_employees_second_job": 0.045,  # ONS: about 1.29m people (3.7% of the employed) had a second job in 2026; 6% gave 1.7m after calibration
    "second_job_median": 5_000,
    "second_job_sigma": 0.9,
    "profit_median": 20_000,  # full-time self-employed; HMRC shows most self-employed pay tax (mean profit about £29,000)
    "profit_sigma": 1.0,
    # Self-employed drawn from a Pareto tail, so very high profits exist. Heavier than before (2%, 1.5): HMRC's 11,000
    # self-employed people with over £1m (£22bn of profits, mostly partners in large firms) were 95% short in the seed.
    "profit_top_tail_share": 0.03,
    "profit_top_tail_min": 80_000,
    "profit_top_tail_alpha": 1.2,
    "share_pensioners_new_state_pension": 0.6,  # rest on the old basic pension
    "share_pensioners_working": 0.2,  # pensioners under 75 with a job; set so their NICs exemption comes near HMRC's £1.2bn
    "pensioner_pay_median": 13_000,  # lowered from £18,000 so their NICs exemption matches HMRC's £1.2bn cost
    "pensioner_pay_sigma": 0.9,
    "share_pensioners_private_pension": 0.65,
    # Raised from £7,000, with a thinner top tail: before calibration, pension income in HMRC's £20,000-£50,000 bands
    # came out 20-40% under HMRC's and far over it above £70,000. £10,000 overshot pensioners' median income in HBAI by 7%.
    "private_pension_median": 8_500,
    "private_pension_sigma": 0.9,
    "private_pension_top_tail_share": 0.02,
    "private_pension_top_tail_min": 50_000,
    "private_pension_top_tail_alpha": 2.5,
    "share_health_protected": 0.9,  # health element claimed before April 2026, so the higher rate
    "share_working_carer": 0.03,  # carers can work and still get the carer element
    "share_children_disabled": 0.12,  # DWP shows 19% of lone parents on UC have a disabled child
    "share_disabled_higher": 0.3,
    "rent_sigma": 0.35,  # spread of rents around the regional mean
    "share_under5_with_childcare": 0.35,  # households with a child under 5 and all adults working
    "childcare_median_month": 700,
    # Property, savings interest and dividends: who has each, and how much on average, follow HMRC's Table 3.7
    # by income band. These are the spreads around those averages.
    "pension_contribution_sigma": 0.8,  # spread of pension contributions around HMRC's band average
    "property_sigma": 0.8,
    "interest_sigma": 2.2,  # widened from 1.5: tax on savings came out 39% under HMRC's, so interest is more concentrated
    "dividends_sigma": 1.5,  # narrowed from 1.8: tax on dividends came out 13% over
    "share_pensioner_couples_both": 0.7,  # pensioner couples where both are over State Pension age
    "share_large_households_two_extra": 0.4,  # households of 3+ adults with 4+ adults
    "share_extra_adults_older": 0.05,  # other extra adults who are older relatives (grandparents are set from the FRS)
    "uc_take_up": 0.85,
    # Child Benefit. HMRC counts families who claimed and then opted out of payment; many higher earners never
    # claimed at all, and they're in neither HMRC count. HBAI's 14.7m children against 11.7m paid and 1.0m opted
    # out leaves about 2m children in families not claiming. Calibration balances these against the opt-out count,
    # the charge's revenue and HBAI's children.
    "cb_opted_out_60k_80k": 0.3,  # families whose higher earner is in the charge's range
    "cb_never_claimed_60k_80k": 0.3,
    "cb_opted_out_over_80k": 0.45,
    "cb_never_claimed_over_80k": 0.45,
    "cb_never_claimed_other": 0.04,  # other families (e.g. not eligible because of immigration status, or never applied)
    # Parents' ages follow their children's: the oldest child's age plus the parent's age at that birth. ONS births
    # statistics put average ages at birth at about 31 for mothers and 34 for fathers; this is for either parent.
    "parent_age_at_birth_mean": 31.5,
    "parent_age_at_birth_sigma": 5.5,
}
A = ASSUMPTIONS


def region_name(label: str) -> str:
    return re.sub(r"\s*\(.*\)$", "", label)


def engine_region(name: str) -> str:
    return {"London": "london", "Wales": "wales", "Scotland": "scotland", "Northern Ireland": "northern_ireland"}.get(name, "england")


def band_bounds(label: str) -> tuple[float, float]:
    """Lower and upper pounds from an FRS band label such as '£1,500 but less than £3,000'."""
    nums = [float(n.replace(",", "")) for n in re.findall(r"£([\d,]+)", label)]
    if not nums:
        return (0.0, 0.0)  # "No savings" and similar
    if "less than" in label.lower() and len(nums) == 1:
        return (0.0, nums[0])
    if "or more" in label.lower():
        return (nums[0], nums[0] * 2)
    return (nums[0], nums[1])


def median_from_bands(lows: list[float], counts: list[float]) -> float:
    """The median of a banded distribution, interpolating within the band that holds it."""
    edges = list(lows) + [lows[-1] * 2]
    half, run = sum(counts) / 2, 0.0
    for lo, hi, c in zip(edges, edges[1:], counts):
        if run + c >= half:
            return lo + (hi - lo) * (half - run) / c
        run += c
    return edges[-1]


class Builder:
    def __init__(self, free_age_p: np.ndarray | None = None):
        self.rng = np.random.default_rng(SEED)
        self.age_log: list[tuple[int, float, str]] = []  # (age, starting weight, how the age was set), for the second pass
        self.weight = 1.0
        cells = pd.read_csv(TARGETS / "frs_households_region_composition_tenure_2024-25.csv")
        cells.columns = ["region", "kids", "tenure", "households"]
        self.cells = cells[cells["households"] > 0]
        # FRS 2024-25: share of each kind of household with at least one adult over State Pension age.
        pen = pd.read_csv(TARGETS / "frs_households_pensioners_detailed_composition_2024-25.csv")
        pen.columns = ["pensioners", "composition", "households"]
        self.p_pensioner = {
            comp: g.loc[~g["pensioners"].str.contains("No ", case=False), "households"].sum() / g["households"].sum()
            for comp, g in pen.groupby("composition")
        }
        rents = pd.read_csv(TARGETS / "frs_households_rent_region_tenure_2024-25.csv")
        rents.columns = ["region", "tenure", "households", "rent_week"]
        self.rent = {(region_name(r.region), r.tenure): r.rent_week for r in rents.itertuples()}
        sav = pd.read_csv(TARGETS / "frs_households_savings_composition_2024-25.csv")
        sav.columns = ["band", "kids", "households"]
        self.savings = {kids: g for kids, g in sav.groupby("kids")}
        cbf = pd.read_csv(TARGETS / "hmrc_child_benefit_families_by_size_2025_08.csv").iloc[-1]
        sizes = {1: "Families: One child", 2: "Families: Two children", 3: "Families: Three children",
                 4: "Families: Four children", 5: "Families: Five to Nine children [note 3]"}
        counts = np.array([float(cbf[c]) for c in sizes.values()])
        self.kids_p = counts / counts.sum()
        # FRS 2024-25: working-age adults' employment status by tenure and age band.
        ft = pd.read_csv(TARGETS / "frs_adults_tenure_age_employment_2024-25.csv")
        ft.columns = ["tenure", "age", "status", "adults"]
        self.status_dist = {}
        for (tenure, band), g in ft.groupby(["tenure", "age"]):
            g = g[g["adults"] > 0]
            self.status_dist[(tenure, band)] = (list(g["status"]), (g["adults"] / g["adults"].sum()).to_numpy())
        # Household composition given tenure (FRS 2024-25).
        ct = pd.read_csv(TARGETS / "frs_households_composition_tenure_2024-25.csv")
        ct.columns = ["composition", "tenure", "households"]
        self.comp_by_tenure = {t: g.set_index("composition")["households"] for t, g in ct.groupby("tenure")}
        # FRS 2024-25 adults by age band, for working-age adults' ages (18-65).
        fa = pd.read_csv(TARGETS / "frs_adults_age_employment_2024-25.csv")
        fa.columns = ["age", "status", "adults"]
        bands = fa.groupby("age")["adults"].sum()
        spans = {"16 to 24 (adult)": (18, 24), "25 to 34": (25, 34), "35 to 44": (35, 44), "45 to 54": (45, 54), "55 to 59": (55, 59), "60 to 64": (60, 65)}
        self.age_bands = [spans[b] for b in spans]
        w = np.array([bands[b] for b in spans])
        self.frs_age_counts = w
        # Adults whose age isn't set by anything else (not parents, not pensioners): on the second pass, the share in
        # each band is what's left of the FRS's count once parents and others are placed.
        self.age_band_p = free_age_p if free_age_p is not None else w / w.sum()
        # Pensioners' ages from the same FRS table (its 65-74 band includes 65-year-olds, below State Pension age).
        self.pensioner_age_bands = [(66, 74), (75, 84), (85, 95)]
        pw = np.array([bands["65 to 74"] * 0.9, bands["75 to 84"], bands["85 or over"]])
        self.pensioner_age_p = pw / pw.sum()
        # Children's ages: HMRC's count of children in paid Child Benefit families by single year of age.
        ca = pd.read_csv(TARGETS / "hmrc_child_benefit_children_by_age_region_2025_08.csv")
        ca = ca[ca.iloc[:, 0].astype(str).str.fullmatch(r"\d+")]
        self.child_ages = ca.iloc[:, 0].astype(int).to_numpy()
        self.child_age_p = (ca.iloc[:, 1] / ca.iloc[:, 1].sum()).to_numpy()
        # Employees' pay: ASHE 2026 annual pay by age group, full- and part-time (Table 6.7a), uprated one year.
        # Between percentiles, pay is interpolated; above the 90th, a Pareto tail sized so the group's mean matches.
        ashe = pd.read_csv(TARGETS / "ons_ashe_annual_pay_by_age_2026.csv").dropna(subset=["p10", "p90", "mean"])
        ashe = ashe[ashe["age"] != "All employees"]
        pcts = [10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90]
        self.ashe = {}
        for r in ashe.itertuples():
            vals = np.array([getattr(r, f"p{p}") for p in pcts]) * EARNINGS_2025_26_TO_2026_27
            us = np.array([0.0] + [p / 100 for p in pcts])
            qs = np.concatenate([[vals[0] * A["ashe_bottom_fraction"]], vals])
            below_90 = float(np.sum((qs[1:] + qs[:-1]) / 2 * np.diff(us)))  # integral of pay over the bottom 90%
            top_mean = (r.mean * EARNINGS_2025_26_TO_2026_27 - below_90) / 0.1
            alpha = top_mean / (top_mean - vals[-1]) if top_mean > vals[-1] * 1.05 else 20.0
            lo = int(re.findall(r"\d+", r.age)[0])
            self.ashe[(r.status, lo)] = (us, qs, alpha)
        # Self-employed profits by age: HMRC's median income of taxpayers by age (SPI Table 3.2), relative to the
        # average across working ages.
        ag = pd.read_csv(TARGETS / "hmrc_income_by_age_2023_24.csv")
        ag = ag[ag["age_range"] != "Totals"]
        # The gap between mean and median shows how many very high earners each age has (few at 25, many at 50); the
        # share of people drawn from the top tail follows it, again relative to the working-age average.
        working = ag[ag["age_range"].str.match(r"^(2|3|4|5|60)")]
        avg = float((working["median_income_gbp"] * working["taxpayers_k"]).sum() / working["taxpayers_k"].sum())
        spread = ag["mean_income_gbp"] / ag["median_income_gbp"] - 1
        avg_spread = float((spread[working.index] * working["taxpayers_k"]).sum() / working["taxpayers_k"].sum())
        self.age_pay = []
        for r, s in zip(ag.itertuples(), spread):
            nums = [int(x) for x in re.findall(r"\d+", r.age_range)]
            lo = 0 if r.age_range.startswith("Under") else nums[0]
            self.age_pay.append((lo, float(r.median_income_gbp) / avg, float(s) / avg_spread))
        # How pay varies by region: the median total income of taxpayers in each region relative to the UK's
        # (SPI Table 3.11, interpolated within income bands).
        rb = pd.read_csv(TARGETS / "hmrc_income_by_region_band_2023_24.csv")
        rb = rb[rb["band_lower"] != "all"]
        med = {reg: median_from_bands(g["band_lower"].astype(float).tolist(), g["taxpayers_k"].astype(float).tolist()) for reg, g in rb.groupby("region")}
        self.region_pay = {reg.lower(): m / med["United Kingdom"] for reg, m in med.items()}
        self.region_pay["east"] = self.region_pay["east of england"]
        # And the same mean-to-median spread by region, for the top tail (London has far more very high earners).
        tot = pd.read_csv(TARGETS / "hmrc_income_by_region_band_2023_24.csv")
        tot = tot[tot["band_lower"] == "all"].set_index("region")
        rs = {reg: tot.at[reg, "total_income_gbp_m"] * 1e3 / tot.at[reg, "taxpayers_k"] / m - 1 for reg, m in med.items()}
        self.region_tail = {reg.lower(): s / rs["United Kingdom"] for reg, s in rs.items()}
        self.region_tail["east"] = self.region_tail["east of england"]
        # HMRC SPI 2023-24: for each band of total income, the share of taxpayers with property income, interest
        # and dividends, and their average amounts, uprated to 2026-27 with earnings.
        spi = pd.read_csv(TARGETS / "hmrc_income_by_region_band_2023_24.csv")
        spi = spi[(spi["region"] == "United Kingdom") & (spi["band_lower"] != "all")].set_index("band_lower")
        oth = pd.read_csv(TARGETS / "hmrc_property_interest_dividends_by_band_2023_24.csv")
        oth = oth[oth["band_lower"] != "all"].set_index("band_lower")
        self.other_bands = []
        for lo in spi.index:
            row, taxpayers = oth.loc[lo], spi.at[lo, "taxpayers_k"]
            kinds = {}
            for kind, people, amount in [("property", row.property_people_k + row.other_people_k, row.property_gbp_m + row.other_gbp_m),
                                         ("interest", row.interest_people_k, row.interest_gbp_m),
                                         ("dividends", row.dividends_people_k, row.dividends_gbp_m)]:
                kinds[kind] = (min(1.0, people / taxpayers), amount / people * 1000 * OTHER_UPRATING[kind])
            self.other_bands.append((float(lo) * EARNINGS_2023_24_TO_2026_27, kinds))
        # HMRC SPI 2023-24, Table 3.8: share of taxpayers paying into a pension (net pay or relief at source) and the
        # average amount, by band, uprated with earnings.
        pc = pd.read_csv(TARGETS / "hmrc_pension_contributions_by_band_2023_24.csv")
        pc = pc[pc["band_lower"] != "all"].set_index("band_lower")
        self.pension_bands = []
        for lo in spi.index:
            row, taxpayers = pc.loc[lo], spi.at[lo, "taxpayers_k"]
            people = row.net_pay_people_k + row.relief_at_source_people_k
            amount = row.net_pay_gbp_m + row.relief_at_source_gbp_m
            self.pension_bands.append((float(lo) * EARNINGS_2023_24_TO_2026_27, min(0.95, people / taxpayers), amount / people * 1000 * EARNINGS_2023_24_TO_2026_27))

    def pension_contribution(self, earnings: float, total: float) -> float:
        """Pension contributions deducted before tax, for someone in work, following HMRC's figures for their band."""
        if earnings <= 0:
            return 0.0
        share, mean = self.pension_bands[0][1:]
        for lo, s, m in self.pension_bands:
            if total >= lo:
                share, mean = s, m
        if self.rng.random() >= share:
            return 0.0
        sg = A["pension_contribution_sigma"]
        return round(min(0.4 * earnings, mean * float(np.exp(sg * self.rng.standard_normal() - sg * sg / 2))), 2)

    def other_income(self, base: float) -> dict:
        """Property, interest and dividends for one adult, drawn from HMRC's figures for their income band."""
        r = self.rng
        kinds = self.other_bands[0][1]
        for lo, k in self.other_bands:
            if base >= lo:
                kinds = k
        out = {}
        for kind, field in [("property", "propertyIncome"), ("interest", "savingsInterest"), ("dividends", "dividends")]:
            share, mean = kinds[kind]
            s = A[f"{kind}_sigma"]
            out[field] = round(float(mean * np.exp(s * r.standard_normal() - s * s / 2)), 2) if r.random() < share else 0.0
        return out

    # --- people -------------------------------------------------------------------------------
    def draw(self, kind: str, tail: float = 1.0) -> float:
        """Lognormal body with a Pareto top tail, so the seed has people in every income band. `tail` scales the
        chance of the top tail."""
        r = self.rng
        if r.random() < A[f"{kind}_top_tail_share"] * tail:
            return float(A[f"{kind}_top_tail_min"] * (1 - r.random()) ** (-1 / A[f"{kind}_top_tail_alpha"]))
        return float(np.exp(np.log(A[f"{kind}_median"]) + A[f"{kind}_sigma"] * r.standard_normal()))

    def lognormal(self, median: float, sigma: float) -> float:
        return float(np.exp(np.log(median) + sigma * self.rng.standard_normal()))

    def pay_factor(self, age: int, region: str) -> tuple[float, float]:
        """Profits, and the chance of very high profits, relative to the UK average for someone of this age in this
        region (HMRC SPI Tables 3.2 and 3.11)."""
        f, t = self.age_pay[0][1:]
        for lo, m, s in self.age_pay:
            if age >= lo:
                f, t = m, s
        return f * self.region_pay[region.lower()], t * self.region_tail[region.lower()]

    def ashe_pay(self, status: str, age: int, region: str) -> float:
        """An employee's annual pay from ASHE's distribution for their age group, scaled for their region. Regions with
        more very high earners (London) get a heavier top tail."""
        key = max((k for k in self.ashe if k[0] == status and k[1] <= age), key=lambda k: k[1])
        us, qs, alpha = self.ashe[key]
        u = self.rng.random()
        if u < 0.9:
            pay = float(np.interp(u, us, qs))
        else:
            pay = float(qs[-1] * (1 - (u - 0.9) / 0.1) ** (-1 / max(1.3, alpha / self.region_tail[region.lower()] ** 0.5)))
        return pay * self.region_pay[region.lower()]

    def working_age_adult(self, age: int, tenure: str, region: str, how: str = "fixed") -> dict:
        """A working-age adult whose work status follows the FRS for their tenure and age band."""
        r = self.rng
        self.age_log.append((age, self.weight, how))
        a = {"age": age, "employment": 0.0, "secondJob": 0.0, "selfEmployment": 0.0, "pension": 0.0, "pensionContributions": 0.0, "health": "none", "carer": False}
        statuses, p = self.status_dist[(tenure, self.age_band(age))]
        status = statuses[r.choice(len(statuses), p=p)]
        health = lambda share: "lcwra_protected" if r.random() < A["share_health_protected"] else "lcwra" if r.random() < share else "none"
        f, tail = self.pay_factor(age, region)
        if status == "Full-time employee":
            a["employment"] = round(self.ashe_pay("full-time", age, region), 2)
        elif status == "Part-time employee":
            a["employment"] = round(self.ashe_pay("part-time", age, region), 2)
        elif status == "Full-time self-employed":
            a["selfEmployment"] = round(self.draw("profit", tail) * f, 2)
        elif status == "Part-time self-employed":
            a["selfEmployment"] = round(self.lognormal(A["pt_profit_median"], A["pt_profit_sigma"]) * f, 2)
        elif status == "Permanently sick / disabled":
            a["health"] = health(1.0) if r.random() < A["share_sick_health_element"] else "none"
        elif status == "Temporarily sick / injured":
            a["health"] = health(1.0) if r.random() < A["share_temp_sick_health_element"] else "none"
        elif status == "Unemployed":
            a["health"] = health(1.0) if r.random() < A["share_unemployed_health_element"] else "none"
        elif status == "Looking after family / home":
            a["carer"] = bool(r.random() < A["share_family_carer"])
        elif status == "Other inactive":
            a["carer"] = bool(r.random() < A["share_inactive_carer"])
        elif status == "Retired":
            a["pension"] = round(self.lognormal(A["retired_early_pension_median"], 0.8), 2)
        if a["employment"] and r.random() < A["share_employees_second_job"]:
            a["secondJob"] = round(self.lognormal(A["second_job_median"], A["second_job_sigma"]), 2)
        if a["employment"] and r.random() < A["share_side_self_employment"]:
            a["selfEmployment"] = round(self.lognormal(A["side_profit_median"], A["side_profit_sigma"]), 2)
        if a["employment"] or a["selfEmployment"]:
            a["carer"] = bool(r.random() < A["share_working_carer"])
        return a

    @staticmethod
    def age_band(age: int) -> str:
        for label, (lo, hi) in [("16 to 24 (adult)", (0, 24)), ("25 to 34", (25, 34)), ("35 to 44", (35, 44)), ("45 to 54", (45, 54)), ("55 to 59", (55, 59))]:
            if lo <= age <= hi:
                return label
        return "60 to 64"

    def pensioner(self, age: int, region: str) -> dict:
        r = self.rng
        state = NEW_STATE_PENSION if r.random() < A["share_pensioners_new_state_pension"] else OLD_STATE_PENSION
        private = self.draw("private_pension") if r.random() < A["share_pensioners_private_pension"] else 0.0
        working = age < 75 and r.random() < A["share_pensioners_working"]
        pay = float(np.exp(np.log(A["pensioner_pay_median"]) + A["pensioner_pay_sigma"] * r.standard_normal())) * self.region_pay[region.lower()] if working else 0.0
        side = self.lognormal(A["side_profit_median"], A["side_profit_sigma"]) if r.random() < A["share_side_self_employment"] else 0.0
        return {"age": age, "employment": round(pay, 2), "secondJob": 0.0, "selfEmployment": round(side, 2), "pension": round(state + private, 2), "pensionContributions": 0.0, "health": "none", "carer": False}

    def working_age(self, young=False) -> int:
        """An age from 18 to 65, following the FRS's count of adults in each age band."""
        if young:
            return int(self.rng.integers(18, 25))
        lo, hi = self.age_bands[self.rng.choice(len(self.age_bands), p=self.age_band_p)]
        return int(self.rng.integers(lo, hi + 1))

    def pension_age(self) -> int:
        lo, hi = self.pensioner_age_bands[self.rng.choice(3, p=self.pensioner_age_p)]
        return int(self.rng.integers(lo, hi + 1))

    def parent_age(self, kids: list[dict]) -> int:
        """A parent's age: their oldest child's age plus their age at that birth."""
        at_birth = self.rng.normal(A["parent_age_at_birth_mean"], A["parent_age_at_birth_sigma"])
        return int(np.clip(kids[0]["age"] + round(at_birth), max(18, kids[0]["age"] + 16), 64))

    # --- households ---------------------------------------------------------------------------
    def children(self) -> list[dict]:
        r = self.rng
        n = int(r.choice([1, 2, 3, 4, 5], p=self.kids_p))
        kids = []
        for _ in range(n):
            age = int(r.choice(self.child_ages, p=self.child_age_p))
            disability = "none"
            if r.random() < A["share_children_disabled"]:
                disability = "higher" if r.random() < A["share_disabled_higher"] else "lower"
            # Born before 6 April 2017 means aged 9 or more during 2026-27 (approximately).
            kids.append({"age": age, "bornBefore2017": age >= 10, "disability": disability})
        return sorted(kids, key=lambda k: -k["age"])

    def rent_month(self, region: str, tenure: str) -> float:
        if tenure not in RENT_GROWTH:
            return 0.0
        mean_week = self.rent[(region, tenure)] * RENT_GROWTH[tenure]
        s = A["rent_sigma"]
        week = mean_week * np.exp(s * self.rng.standard_normal() - s * s / 2)  # keeps the mean
        return round(float(week * 52 / 12), 2)

    def savings_amount(self, kids: str) -> float:
        g = self.savings[kids]
        row = g.iloc[self.rng.choice(len(g), p=(g["households"] / g["households"].sum()).to_numpy())]
        lo, hi = band_bounds(row["band"])
        return round(float(self.rng.uniform(lo, hi)), 2)

    def benefit_units(self, region: str, kids_label: str, tenure: str) -> tuple[str, list[dict]]:
        """One FRS household as one or two benefit units (the engine works on benefit units)."""
        r = self.rng
        has_kids = "with children" in kids_label and "without" not in kids_label
        # Household type follows the FRS for this tenure (e.g. lone parents are 13% of social renters, 1% of outright owners).
        comps = self.comp_by_tenure[tenure]
        comps = comps[comps.index.str.contains("without children") != has_kids]
        comp = str(r.choice(comps.index, p=(comps / comps.sum()).to_numpy()))
        large = not ("one adult" in comp or "one female" in comp or "one male" in comp or "two adults" in comp)
        has_pensioner = r.random() < self.p_pensioner.get(comp, 0)
        # Without children, the pensioner leads the household. With children, they're a grandparent living with
        # the family (only in households of three or more adults; with fewer it's too rare to model).
        pensioner_hh = has_pensioner and not has_kids
        grandparent = has_pensioner and has_kids and large
        kids = self.children() if has_kids else []

        def adult():
            if pensioner_hh:
                return self.pensioner(self.pension_age(), region)
            if kids:
                return self.working_age_adult(self.parent_age(kids), tenure, region, "parent")
            return self.working_age_adult(self.working_age(), tenure, region, "free")

        if "one adult" in comp or "one female" in comp or "one male" in comp:
            units = [{"adults": [adult()], "children": kids}]
        else:
            first = adult()
            if pensioner_hh and r.random() >= A["share_pensioner_couples_both"]:
                # A pensioner with a younger partner who hasn't reached State Pension age.
                partner = self.working_age_adult(int(r.integers(55, 66)), tenure, region)
            else:
                # A partner of about the same age, on the same side of State Pension age.
                age = max(18, first["age"] + int(r.integers(-4, 5)))
                if kids:
                    age = max(age, kids[0]["age"] + 16)
                partner = self.pensioner(max(66, age), region) if pensioner_hh else \
                    self.working_age_adult(min(age, 65), tenure, region, "parent" if kids else "free")
            units = [{"adults": [first, partner], "children": kids}]
        if large:
            # Three or more adults: the couple (with any children) plus one or two more adults, each their own
            # benefit unit. Usually grown-up children (older ones when the couple are pensioners); a grandparent
            # where the FRS says a family with children includes a pensioner; occasionally another older relative.
            for j in range(1 if r.random() >= A["share_large_households_two_extra"] else 2):
                if grandparent and j == 0:
                    extra = self.pensioner(self.pension_age(), region)
                elif r.random() < A["share_extra_adults_older"]:
                    age = int(r.integers(55, 90))
                    extra = self.pensioner(age, region) if age >= 66 else self.working_age_adult(age, tenure, region)
                else:
                    extra = self.working_age_adult(int(r.integers(25, 50)) if pensioner_hh else int(r.integers(18, 31)), tenure, region)
                units.append({"adults": [extra], "children": []})

        # Carers on Universal Credit are mostly caring for a disabled child or a sick partner.
        for u in units:
            disabled_child = any(c["disability"] != "none" for c in u["children"])
            sick_partner = len(u["adults"]) == 2 and any(a["health"] != "none" for a in u["adults"])
            for a in u["adults"]:
                free = a["health"] == "none" and a["employment"] < 25_000 and a["selfEmployment"] < 25_000
                if free and disabled_child and r.random() < A["share_parent_carer_disabled_child"]:
                    a["carer"] = True
                elif free and sick_partner and r.random() < A["share_partner_carer"]:
                    a["carer"] = True

        for i, u in enumerate(units):
            for a in u["adults"]:
                a.update(self.other_income(a["employment"] + a["secondJob"] + a["selfEmployment"] + a["pension"]))
                earnings = a["employment"] + a["secondJob"] + a["selfEmployment"]
                total = earnings + a["pension"] + a["propertyIncome"] + a["savingsInterest"] + a["dividends"]
                a["pensionContributions"] = self.pension_contribution(earnings, total)
            u["region"] = engine_region(region)
            u["rentMonthly"] = self.rent_month(region, tenure) if i == 0 else 0.0
            u["savings"] = self.savings_amount(kids_label) if i == 0 else 0.0
            working = all(a["employment"] + a["secondJob"] + a["selfEmployment"] > 0 for a in u["adults"])
            under5 = any(k["age"] < 5 for k in u["children"])
            u["childcareMonthly"] = (
                round(float(np.exp(np.log(A["childcare_median_month"]) + 0.5 * r.standard_normal())), 2)
                if under5 and working and r.random() < A["share_under5_with_childcare"] else 0.0
            )
            u["claimsUniversalCredit"] = bool(r.random() < A["uc_take_up"])
            top = max(a["employment"] + a["secondJob"] + a["selfEmployment"] + a["pension"] for a in u["adults"])
            band = "over_80k" if top > 80_000 else "60k_80k" if top > 60_000 else None
            opted, never = (A[f"cb_opted_out_{band}"], A[f"cb_never_claimed_{band}"]) if band else (0.0, A["cb_never_claimed_other"])
            x = r.random()
            u["childBenefitStatus"] = "opted_out" if x < opted else "never_claimed" if x < opted + never else "claims"
            u["claimsChildBenefit"] = u["childBenefitStatus"] == "claims"
        return comp, units

    def build(self) -> list[dict]:
        total = self.cells["households"].sum()
        out = []
        hh_id = 0
        for cell in self.cells.itertuples():
            n = max(MIN_PER_CELL, round(N_HOUSEHOLDS * cell.households / total))
            weight = self.weight = cell.households / n
            region = region_name(cell.region)
            for _ in range(n):
                comp, units = self.benefit_units(region, cell.kids, cell.tenure)
                for j, u in enumerate(units):
                    out.append({
                        "id": f"{hh_id}-{j}", "household": hh_id, "unit": j, "weight": weight,
                        "regionDetail": region, "tenure": cell.tenure, "composition": comp, "data": u,
                    })
                hh_id += 1
        out += self.outside_households(hh_id)
        return out

    def outside_households(self, first_id: int) -> list[dict]:
        """Taxpayers outside private households: see the assumption notes above."""
        r = self.rng
        regions = self.cells.groupby("region")["households"].sum()
        names, p = [region_name(x) for x in regions.index], (regions / regions.sum()).to_numpy()
        n = A["outside_seeds"]
        out = []
        for k in range(n):
            region = names[r.choice(len(names), p=p)]
            a = {"age": int(r.integers(18, 65)), "employment": round(self.lognormal(A["outside_pay_median"], A["outside_pay_sigma"]) * self.region_pay[region.lower()], 2),
                 "secondJob": 0.0, "selfEmployment": 0.0, "pension": 0.0, "pensionContributions": 0.0, "health": "none", "carer": False}
            a.update(self.other_income(a["employment"]))
            a["pensionContributions"] = self.pension_contribution(a["employment"], a["employment"] + a["propertyIncome"] + a["savingsInterest"] + a["dividends"])
            data = {"region": engine_region(region), "adults": [a], "children": [], "rentMonthly": 0.0, "childcareMonthly": 0.0,
                    "savings": 0.0, "claimsUniversalCredit": False, "claimsChildBenefit": False}
            out.append({"id": f"{first_id + k}-0", "household": first_id + k, "unit": 0, "weight": A["outside_start_total"] / n,
                        "regionDetail": region, "tenure": "Outside private households", "composition": "Outside private households",
                        "outside": True, "data": data})
        return out


def free_age_shares(b: Builder) -> np.ndarray:
    """After a first pass: the share of 'free' adults (not parents, not set otherwise) to put in each age band so that
    all working-age adults together follow the FRS's age bands."""
    placed = np.zeros(len(b.age_bands))
    free = 0.0
    for age, w, how in b.age_log:
        k = next((i for i, (lo, hi) in enumerate(b.age_bands) if lo <= age <= hi), None)
        if how == "free":
            free += w
        elif k is not None:
            placed[k] += w
    target = b.frs_age_counts / b.frs_age_counts.sum() * (placed.sum() + free)
    left = np.maximum(target - placed, 0.1 * target)
    return left / left.sum()


def main() -> None:
    BUILD.mkdir(exist_ok=True)
    first = Builder()
    first.build()
    units = Builder(free_age_shares(first)).build()
    payload = {
        "_about": "Seed population for calibration. Made-up households, not real people. See data/build_seed.py and POPULATION.md.",
        "year": "2026-27",
        "assumptions": ASSUMPTIONS,
        "units": units,
    }
    (BUILD / "seed.json").write_text(json.dumps(payload), encoding="utf-8")
    households = len({u["household"] for u in units})
    weight = sum(u["weight"] for u in units if u["unit"] == 0)
    print(f"{households:,} households, {len(units):,} benefit units, standing for {weight:,.0f} households")


if __name__ == "__main__":
    main()
