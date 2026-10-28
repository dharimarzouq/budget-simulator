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
RENT_GROWTH = {"Private rented": 1.04 * 1.04, "Social rented": 1.039 * 1.05}  # table 1.18, 2025-26 and 2026-27
NEW_STATE_PENSION = 241.30 * 52  # full rate 2026-27, DWP benefit and pension rates
OLD_STATE_PENSION = 184.90 * 52  # basic State Pension 2026-27, same source

ASSUMPTIONS = {
    "share_employee": 0.72,  # of working-age adults; the rest split below
    "share_self_employed": 0.10,
    "share_employee_lone_parent": 0.62,
    "pay_median": 31_000,  # employees incl. part-time, 2026-27
    "pay_sigma": 0.65,  # spread of log pay
    "pay_top_tail_share": 0.04,  # employees drawn from a Pareto tail instead
    "pay_top_tail_min": 80_000,
    "pay_top_tail_alpha": 1.6,
    "share_employees_second_job": 0.06,  # ONS: about 1.29m people (3.7% of the employed) had a second job in 2026
    "second_job_median": 5_000,
    "second_job_sigma": 0.9,
    "profit_median": 20_000,  # raised from £14,000: HMRC shows most self-employed pay tax (mean profit about £29,000)
    "profit_sigma": 1.0,
    "profit_top_tail_share": 0.04,  # self-employed drawn from a Pareto tail, so very high profits exist
    "profit_top_tail_min": 80_000,
    "profit_top_tail_alpha": 1.3,
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
    "share_not_working_health": 0.45,  # of working-age adults not working: Universal Credit health element
    "share_health_protected": 0.9,  # of those: claimed before April 2026, so the higher rate
    "share_not_working_carer": 0.25,
    "share_working_carer": 0.03,  # carers can work and still get the carer element
    "share_children_disabled": 0.12,  # DWP shows 19% of lone parents on UC have a disabled child
    "share_disabled_higher": 0.3,
    "rent_sigma": 0.35,  # spread of rents around the regional mean
    "share_under5_with_childcare": 0.35,  # households with a child under 5 and all adults working
    "childcare_median_month": 700,
    # Property, savings interest and dividends: who has each, and how much on average, follow HMRC's Table 3.7
    # by income band. These are the spreads around those averages.
    "property_sigma": 0.8,
    "interest_sigma": 1.5,
    "dividends_sigma": 1.8,
    "share_pensioner_couples_both": 0.7,  # pensioner couples where both are over State Pension age
    "share_large_households_two_extra": 0.4,  # households of 3+ adults with 4+ adults
    "share_extra_adults_older": 0.05,  # other extra adults who are older relatives (grandparents are set from the FRS)
    "uc_take_up": 0.85,
    "cb_opt_out_60k_80k": 0.4,  # families whose higher earner is in the Child Benefit charge range
    "cb_opt_out_over_80k": 0.8,
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
        comp = pd.read_csv(TARGETS / "frs_households_income_detailed_composition_2024-25.csv")
        comp = comp.groupby(comp.columns[1])["households"].sum()
        self.comp_with = comp[comp.index.str.contains("with children")]
        self.comp_without = comp[comp.index.str.contains("without children")]
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
                kinds[kind] = (min(1.0, people / taxpayers), amount / people * 1000 * EARNINGS_2023_24_TO_2026_27)
            self.other_bands.append((float(lo) * EARNINGS_2023_24_TO_2026_27, kinds))

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

    def working_age_adult(self, age: int, lone_parent=False) -> dict:
        r = self.rng
        p_emp = A["share_employee_lone_parent"] if lone_parent else A["share_employee"]
        u = r.random()
        a = {"age": age, "employment": 0.0, "secondJob": 0.0, "selfEmployment": 0.0, "pension": 0.0, "pensionContributions": 0.0, "health": "none", "carer": False}
        if u < p_emp:
            a["employment"] = round(self.draw("pay"), 2)
            if r.random() < A["share_employees_second_job"]:
                a["secondJob"] = round(float(np.exp(np.log(A["second_job_median"]) + A["second_job_sigma"] * r.standard_normal())), 2)
            a["carer"] = bool(r.random() < A["share_working_carer"])
        elif u < p_emp + A["share_self_employed"]:
            a["selfEmployment"] = round(self.draw("profit"), 2)
            a["carer"] = bool(r.random() < A["share_working_carer"])
        elif r.random() < A["share_not_working_health"]:
            a["health"] = "lcwra_protected" if r.random() < A["share_health_protected"] else "lcwra"
        elif r.random() < A["share_not_working_carer"]:
            a["carer"] = True
        return a

    def pensioner(self, age: int) -> dict:
        r = self.rng
        state = NEW_STATE_PENSION if r.random() < A["share_pensioners_new_state_pension"] else OLD_STATE_PENSION
        private = self.draw("private_pension") if r.random() < A["share_pensioners_private_pension"] else 0.0
        working = age < 75 and r.random() < A["share_pensioners_working"]
        pay = float(np.exp(np.log(A["pensioner_pay_median"]) + A["pensioner_pay_sigma"] * r.standard_normal())) if working else 0.0
        return {"age": age, "employment": round(pay, 2), "secondJob": 0.0, "selfEmployment": 0.0, "pension": round(state + private, 2), "pensionContributions": 0.0, "health": "none", "carer": False}

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
        comps = self.comp_with if has_kids else self.comp_without
        comp = str(r.choice(comps.index, p=(comps / comps.sum()).to_numpy()))
        large = not ("one adult" in comp or "one female" in comp or "one male" in comp or "two adults" in comp)
        has_pensioner = r.random() < self.p_pensioner.get(comp, 0)
        # Without children, the pensioner leads the household. With children, they're a grandparent living with
        # the family (only in households of three or more adults; with fewer it's too rare to model).
        pensioner_hh = has_pensioner and not has_kids
        grandparent = has_pensioner and has_kids and large
        kids = self.children() if has_kids else []

        def adult(lone_parent=False, young=False):
            return self.pensioner(self.pension_age()) if pensioner_hh else self.working_age_adult(self.working_age(young), lone_parent)

        if "one adult" in comp or "one female" in comp or "one male" in comp:
            units = [{"adults": [adult(lone_parent=has_kids)], "children": kids}]
        else:
            first = adult()
            if pensioner_hh and r.random() >= A["share_pensioner_couples_both"]:
                # A pensioner with a younger partner who hasn't reached State Pension age.
                partner = self.working_age_adult(int(r.integers(55, 66)))
            else:
                # A partner of about the same age, on the same side of State Pension age.
                age = max(18, first["age"] + int(r.integers(-4, 5)))
                partner = self.pensioner(max(66, age)) if pensioner_hh else self.working_age_adult(min(age, 65))
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
                    extra = self.pensioner(age) if age >= 66 else self.working_age_adult(age)
                else:
                    extra = self.working_age_adult(int(r.integers(25, 50)) if pensioner_hh else int(r.integers(18, 31)))
                units.append({"adults": [extra], "children": []})

        for i, u in enumerate(units):
            for a in u["adults"]:
                a.update(self.other_income(a["employment"] + a["secondJob"] + a["selfEmployment"] + a["pension"]))
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
            opt_out = A["cb_opt_out_over_80k"] if top > 80_000 else A["cb_opt_out_60k_80k"] if top > 60_000 else 0
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
