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
    "ft_pay_median": 36_000,  # full-time employees, 2026-27. Below ASHE's median (about £39,000 in 2025): the FRS's full-time group includes younger and newer workers; set so NICs and the employee count both come out close
    "ft_pay_sigma": 0.5,
    "ft_pay_top_tail_share": 0.06,  # full-time employees drawn from a Pareto tail instead
    "ft_pay_top_tail_min": 80_000,
    "ft_pay_top_tail_alpha": 1.6,
    "pt_pay_median": 13_000,  # part-time employees (ASHE 2025 median about £13,000)
    "pt_pay_sigma": 0.6,
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
    "outside_pay_median": 24_000,  # spread wide enough to reach HMRC's £20,000-£50,000 bands, where most of the gap is
    "outside_pay_sigma": 0.6,
    "share_employees_second_job": 0.06,  # ONS: about 1.29m people (3.7% of the employed) had a second job in 2026
    "second_job_median": 5_000,
    "second_job_sigma": 0.9,
    "profit_median": 20_000,  # full-time self-employed; HMRC shows most self-employed pay tax (mean profit about £29,000)
    "profit_sigma": 1.0,
    "profit_top_tail_share": 0.02,  # self-employed drawn from a Pareto tail, so very high profits exist
    "profit_top_tail_min": 80_000,
    "profit_top_tail_alpha": 1.5,
    "share_pensioners_new_state_pension": 0.6,  # rest on the old basic pension
    "share_pensioners_working": 0.2,  # pensioners under 75 with a job; set so their NICs exemption comes near HMRC's £1.2bn
    "pensioner_pay_median": 13_000,  # lowered from £18,000 so their NICs exemption matches HMRC's £1.2bn cost
    "pensioner_pay_sigma": 0.9,
    "share_pensioners_private_pension": 0.65,
    "private_pension_median": 7_000,
    "private_pension_sigma": 0.9,
    "private_pension_top_tail_share": 0.03,
    "private_pension_top_tail_min": 50_000,
    "private_pension_top_tail_alpha": 1.8,
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
    "cb_opt_out_60k_80k": 0.6,  # families whose higher earner is in the Child Benefit charge range (raised from 0.4: the charge came out 36% high)
    "cb_opt_out_over_80k": 0.9,
    "cb_not_claiming": 0.04,  # other families with children who don't claim at all (e.g. not eligible)
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


class Builder:
    def __init__(self):
        self.rng = np.random.default_rng(SEED)
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
        self.age_band_p = w / w.sum()
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
    def draw(self, kind: str) -> float:
        """Lognormal body with a Pareto top tail, so the seed has people in every income band."""
        r = self.rng
        if r.random() < A[f"{kind}_top_tail_share"]:
            return float(A[f"{kind}_top_tail_min"] * (1 - r.random()) ** (-1 / A[f"{kind}_top_tail_alpha"]))
        return float(np.exp(np.log(A[f"{kind}_median"]) + A[f"{kind}_sigma"] * r.standard_normal()))

    def lognormal(self, median: float, sigma: float) -> float:
        return float(np.exp(np.log(median) + sigma * self.rng.standard_normal()))

    def working_age_adult(self, age: int, tenure: str) -> dict:
        """A working-age adult whose work status follows the FRS for their tenure and age band."""
        r = self.rng
        a = {"age": age, "employment": 0.0, "secondJob": 0.0, "selfEmployment": 0.0, "pension": 0.0, "pensionContributions": 0.0, "health": "none", "carer": False}
        statuses, p = self.status_dist[(tenure, self.age_band(age))]
        status = statuses[r.choice(len(statuses), p=p)]
        health = lambda share: "lcwra_protected" if r.random() < A["share_health_protected"] else "lcwra" if r.random() < share else "none"
        if status == "Full-time employee":
            a["employment"] = round(self.draw("ft_pay"), 2)
        elif status == "Part-time employee":
            a["employment"] = round(self.lognormal(A["pt_pay_median"], A["pt_pay_sigma"]), 2)
        elif status == "Full-time self-employed":
            a["selfEmployment"] = round(self.draw("profit"), 2)
        elif status == "Part-time self-employed":
            a["selfEmployment"] = round(self.lognormal(A["pt_profit_median"], A["pt_profit_sigma"]), 2)
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

    def pensioner(self, age: int) -> dict:
        r = self.rng
        state = NEW_STATE_PENSION if r.random() < A["share_pensioners_new_state_pension"] else OLD_STATE_PENSION
        private = self.draw("private_pension") if r.random() < A["share_pensioners_private_pension"] else 0.0
        working = age < 75 and r.random() < A["share_pensioners_working"]
        pay = float(np.exp(np.log(A["pensioner_pay_median"]) + A["pensioner_pay_sigma"] * r.standard_normal())) if working else 0.0
        side = self.lognormal(A["side_profit_median"], A["side_profit_sigma"]) if r.random() < A["share_side_self_employment"] else 0.0
        return {"age": age, "employment": round(pay, 2), "secondJob": 0.0, "selfEmployment": round(side, 2), "pension": round(state + private, 2), "pensionContributions": 0.0, "health": "none", "carer": False}

    def working_age(self, young=False) -> int:
        """An age from 18 to 65, following the FRS's count of adults in each age band."""
        if young:
            return int(self.rng.integers(18, 25))
        lo, hi = self.age_bands[self.rng.choice(len(self.age_bands), p=self.age_band_p)]
        return int(self.rng.integers(lo, hi + 1))

    def pension_age(self) -> int:
        return int(min(100, 66 + self.rng.exponential(9)))

    # --- households ---------------------------------------------------------------------------
    def children(self) -> list[dict]:
        r = self.rng
        n = int(r.choice([1, 2, 3, 4, 5], p=self.kids_p))
        kids = []
        for _ in range(n):
            age = int(r.integers(0, 18))
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
            return self.pensioner(self.pension_age()) if pensioner_hh else self.working_age_adult(self.working_age(), tenure)

        if "one adult" in comp or "one female" in comp or "one male" in comp:
            units = [{"adults": [adult()], "children": kids}]
        else:
            first = adult()
            if pensioner_hh and r.random() >= A["share_pensioner_couples_both"]:
                # A pensioner with a younger partner who hasn't reached State Pension age.
                partner = self.working_age_adult(int(r.integers(55, 66)), tenure)
            else:
                # A partner of about the same age, on the same side of State Pension age.
                age = max(18, first["age"] + int(r.integers(-4, 5)))
                partner = self.pensioner(max(66, age)) if pensioner_hh else self.working_age_adult(min(age, 65), tenure)
            units = [{"adults": [first, partner], "children": kids}]
        if large:
            # Three or more adults: the couple (with any children) plus one or two more adults, each their own
            # benefit unit. Usually grown-up children (older ones when the couple are pensioners); a grandparent
            # where the FRS says a family with children includes a pensioner; occasionally another older relative.
            for j in range(1 if r.random() >= A["share_large_households_two_extra"] else 2):
                if grandparent and j == 0:
                    extra = self.pensioner(self.pension_age())
                elif r.random() < A["share_extra_adults_older"]:
                    age = int(r.integers(55, 90))
                    extra = self.pensioner(age) if age >= 66 else self.working_age_adult(age, tenure)
                else:
                    extra = self.working_age_adult(int(r.integers(25, 50)) if pensioner_hh else int(r.integers(18, 31)), tenure)
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
            opt_out = A["cb_opt_out_over_80k"] if top > 80_000 else A["cb_opt_out_60k_80k"] if top > 60_000 else A["cb_not_claiming"]
            u["claimsChildBenefit"] = bool(r.random() >= opt_out)
        return comp, units

    def build(self) -> list[dict]:
        total = self.cells["households"].sum()
        out = []
        hh_id = 0
        for cell in self.cells.itertuples():
            n = max(MIN_PER_CELL, round(N_HOUSEHOLDS * cell.households / total))
            weight = cell.households / n
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
            a = {"age": int(r.integers(18, 65)), "employment": round(self.lognormal(A["outside_pay_median"], A["outside_pay_sigma"]), 2),
                 "secondJob": 0.0, "selfEmployment": 0.0, "pension": 0.0, "pensionContributions": 0.0, "health": "none", "carer": False}
            a.update(self.other_income(a["employment"]))
            a["pensionContributions"] = self.pension_contribution(a["employment"], a["employment"] + a["propertyIncome"] + a["savingsInterest"] + a["dividends"])
            data = {"region": engine_region(region), "adults": [a], "children": [], "rentMonthly": 0.0, "childcareMonthly": 0.0,
                    "savings": 0.0, "claimsUniversalCredit": False, "claimsChildBenefit": False}
            out.append({"id": f"{first_id + k}-0", "household": first_id + k, "unit": 0, "weight": A["outside_start_total"] / n,
                        "regionDetail": region, "tenure": "Outside private households", "composition": "Outside private households",
                        "outside": True, "data": data})
        return out


def main() -> None:
    BUILD.mkdir(exist_ok=True)
    units = Builder().build()
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
