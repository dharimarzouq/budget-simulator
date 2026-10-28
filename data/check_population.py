"""Compare a population's weighted totals with the published figures.

Usage: .venv/Scripts/python.exe -I data/check_population.py data/build/seed.json data/build/seed_results.csv
Prints a table and writes it next to the results as <name>_check.csv.
Before calibration (step 5c) large gaps are expected: the point is to see where they are.
"""

import json
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
T = HERE / "targets"
EARNINGS_2023_24_TO_2026_27 = 169.0 / 148.36  # OBR average weekly earnings index (EFO March 2026, table 1.6)
EARNINGS_2024_25 = 169.0 / 156.623


def obr(file: str, line_start: str, section: str | None = None) -> float:
    t = pd.read_csv(T / file)
    t = t[(t["year"] == "2026-27") & t["line"].str.startswith(line_start)]
    if section:
        t = t[t["section"].str.startswith(section)]
    return float(t["gbp_bn"].sum())


def liab(band: str, column: str) -> float:
    """HMRC Income Tax liabilities statistics, Table 2.5, 2026-27 (£m or thousands)."""
    t = pd.read_csv(T / "hmrc_income_tax_by_range_2026_27.csv", dtype={"band_lower": str})
    return float(t.loc[t["band_lower"] == band, column].iloc[0])


def src(kind: str) -> float:
    """HMRC Table 2.6, 2026-27: income tax on earnings (all non-savings income), savings or dividends, £bn."""
    t = pd.read_csv(T / "hmrc_income_tax_by_source_2026_27.csv")
    rows = t[t["line"].str.startswith(f"Income Tax on {kind}")]
    return float(pd.to_numeric(rows["all_taxpayers"]).sum()) / 1e3


def nics_relief(name_start: str) -> float:
    """HMRC's 2025-26 cost of a NICs relief, £bn (tax relief statistics, January 2026)."""
    t = pd.read_csv(T / "hmrc_nics_reliefs_2026_01.csv")
    row = t[t["relief"].str.startswith(name_start) & t["year"].str.startswith("2025")]
    return float(str(row["cost_gbp_m"].iloc[0]).replace(",", "")) / 1e3


def hbai_check(pop: list[dict], res: pd.DataFrame) -> pd.DataFrame:
    """Median and mean equivalised net household income by type of person, against HBAI (held back).

    Uses the modified OECD scale HBAI uses (first adult 0.67, other adults and children 14+ 0.33,
    children under 14 0.2) and counts each person once, as HBAI does. HBAI's 2024-25 figures are
    uprated to 2026-27 with OBR earnings growth.
    """
    net = res.set_index("id")["net"]
    households: dict[int, dict] = {}
    for u in pop:
        if u.get("outside"):
            continue  # HBAI covers private households only
        h = households.setdefault(u["household"], {"weight": u["weight"], "net": 0.0, "people": []})
        h["net"] += net[u["id"]]
        h["people"] += [("pensioner" if a["age"] >= 66 else "working-age", a["age"]) for a in u["data"]["adults"]]
        h["people"] += [("child", c["age"]) for c in u["data"]["children"]]
    rows = []
    for h in households.values():
        scale = 0.67 + sum(0.33 if (kind != "child" or age >= 14) else 0.2 for kind, age in h["people"][1:])
        weekly = h["net"] / scale / 52
        rows += [{"type": kind, "weight": h["weight"], "income": weekly} for kind, _ in h["people"]]
    people = pd.DataFrame(rows)
    hb = pd.read_csv(T / "hbai_income_by_person_type_2024-25.csv")
    hb.columns = ["type", "people", "median", "mean"]
    out = []
    for kind, label in [("child", "Child"), ("working-age", "Working-Age"), ("pensioner", "Pensioner")]:
        p = people[people["type"] == kind].sort_values("income")
        cum = p["weight"].cumsum() / p["weight"].sum()
        median = float(p["income"].iloc[(cum >= 0.5).to_numpy().argmax()])
        mean = float((p["income"] * p["weight"]).sum() / p["weight"].sum())
        ref = hb[hb["type"] == label].iloc[0]
        out.append((f"Median household income, {kind} (£ a week, equivalised)", median, ref["median"] * EARNINGS_2024_25, "£/wk", "HBAI 2024-25, uprated", "held back"))
        out.append((f"Mean household income, {kind} (£ a week, equivalised)", mean, ref["mean"] * EARNINGS_2024_25, "£/wk", "HBAI 2024-25, uprated", "held back"))
        out.append((f"People: {kind}", p["weight"].sum() / 1e6, ref["people"] / 1e6, "m", "HBAI 2024-25", "a target" if kind == "child" else "held back"))
    return out


def main(population: str, results: str) -> None:
    pop = json.loads(Path(population).read_text())["units"]
    units = pd.DataFrame([{"id": u["id"], "weight": u["weight"], "unit": u["unit"], "outside": u.get("outside", False)} for u in pop])
    outside_people = units.loc[units["outside"], "weight"].sum() / 1e6
    # Employee NICs that people over State Pension age would pay if they weren't exempt.
    def ni(job: float) -> float:
        return max(0.0, min(job, 50_270) - 12_570) * 0.08 + max(0.0, job - 50_270) * 0.02

    adults = [(u["weight"], a, [a["employment"], a.get("secondJob", 0.0)]) for u in pop for a in u["data"]["adults"]]
    over_spa = sum(w * sum(ni(j) for j in jobs) for w, a, jobs in adults if a["age"] >= 66) / 1e9
    employees = sum(u["weight"] for u in pop if not u.get("outside") for a in u["data"]["adults"] if a["employment"] > 0) / 1e6
    payrolled = sum(u["weight"] for u in pop for a in u["data"]["adults"] if a["employment"] > 0) / 1e6
    second_jobs = sum(w for w, a, jobs in adults if jobs[1] > 0) / 1e6
    pt_cost = sum(w * 0.08 * sum(min(j, 12_570) for j in jobs) for w, a, jobs in adults if a["age"] < 66) / 1e9
    st_cost = sum(w * 0.15 * sum(min(j, 5_000) for j in jobs) for w, a, jobs in adults) / 1e9
    lump_sums = nics_relief("Employment Allowance") + nics_relief("Relief on employer National Insurance contributions for apprentices")
    res = pd.read_csv(results)
    d = units.merge(res, on="id")
    w = d["weight"]
    spi = pd.read_csv(T / "hmrc_income_by_region_band_2023_24.csv")
    spi_uk = spi[(spi["region"] == "United Kingdom") & (spi["band_lower"] == "all")].iloc[0]
    uc_t = pd.read_csv(T / "uc_households_family_tenure_2026_05.csv")
    cb_fam = pd.read_csv(T / "hmrc_child_benefit_families_by_size_2025_08.csv").iloc[-1]

    rows = [
        # name, ours, published, unit, source, note
        ("Households", w[(d["unit"] == 0) & ~d["outside"]].sum() / 1e6, 28.972, "m", "FRS 2024-25", "matches by construction"),
        ("People outside private households (sized by calibration)", outside_people, float("nan"), "m", "none published", "students in halls, forces, part-year residents..."),
        ("Income taxpayers", (w * d["taxpayers"]).sum() / 1e6, spi_uk["taxpayers_k"] / 1e3, "m", "HMRC SPI 2023-24", "2023-24; frozen thresholds mean more by 2026-27"),
        ("Employment income", (w * d["employment"]).sum() / 1e9, spi_uk["employment_gbp_m"] / 1e3 * EARNINGS_2023_24_TO_2026_27, "£bn", "HMRC SPI 2023-24, uprated", "taxpayers only in HMRC's figure"),
        ("Self-employment profits", (w * d["self_employment"]).sum() / 1e9, spi_uk["self_employment_gbp_m"] / 1e3 * EARNINGS_2023_24_TO_2026_27, "£bn", "HMRC SPI 2023-24, uprated", "taxpayers only"),
        ("Pension income", (w * d["pension"]).sum() / 1e9, spi_uk["pension_gbp_m"] / 1e3 * EARNINGS_2023_24_TO_2026_27, "£bn", "HMRC SPI 2023-24, uprated", "taxpayers only; uprated with earnings as an approximation"),
        ("Income tax", (w * d["income_tax"]).sum() / 1e9, obr("obr_income_tax_nics_2026_03.csv", "Income tax"), "£bn", "OBR March 2026", "receipts; include tax we don't model per person (trusts, timing)"),
        ("Income tax liabilities", (w * d["income_tax"]).sum() / 1e9, liab("all", "income_tax_gbp_m") / 1e3, "£bn", "HMRC liabilities 2026-27 (July 2026)", "the like-for-like comparison"),
        ("Income tax on earnings, pensions and property", (w * d["non_savings_tax"]).sum() / 1e9, src("earnings"), "£bn", "HMRC liabilities 2026-27, table 2.6", ""),
        ("Income tax on savings", (w * d["savings_tax"]).sum() / 1e9, src("savings"), "£bn", "HMRC liabilities 2026-27, table 2.6", ""),
        ("Income tax on dividends", (w * d["dividend_tax"]).sum() / 1e9, src("dividends"), "£bn", "HMRC liabilities 2026-27, table 2.6", ""),
        ("Income taxpayers 2026-27", (w * d["taxpayers"]).sum() / 1e6, liab("all", "taxpayers_k") / 1e3, "m", "HMRC liabilities 2026-27", ""),
        ("Employee NICs", (w * d["employee_ni"]).sum() / 1e9, obr("obr_income_tax_nics_2026_03.csv", "Class 1 Employee"), "£bn", "OBR March 2026", ""),
        ("Employer NICs", (w * d["employer_ni"]).sum() / 1e9 - lump_sums, obr("obr_income_tax_nics_2026_03.csv", "Class 1 Employer"), "£bn", "OBR March 2026",
         f"less £{lump_sums:.1f}bn Employment Allowance and apprentice relief (HMRC 2025-26 costs, not per household)"),
        ("Employees", employees, 29.825, "m", "OBR March 2026 (table 1.6)", "Labour Force Survey based; ours in private households only"),
        ("Payrolled employees", payrolled, 30.3, "m", "ONS/HMRC PAYE RTI, September 2026", "one month's count; ours is anyone paid during the year, including people outside private households"),
        ("People with a second job", second_jobs, 1.29, "m", "ONS Labour Force Survey, mid-2026 (via secondary reports)", "ONS figure includes second self-employed jobs"),
        ("Cost of the NICs primary threshold", pt_cost, nics_relief("Primary Threshold"), "£bn", "HMRC tax relief statistics 2025-26", ""),
        ("Cost of the NICs secondary threshold", st_cost, nics_relief("Secondary Threshold"), "£bn", "HMRC tax relief statistics 2025-26", ""),
        ("Employee NICs exemption over State Pension age", over_spa, nics_relief("Exemption for individuals over State Pension Age"), "£bn", "HMRC tax relief statistics 2025-26", ""),
        ("Self-employed NICs", (w * d["self_employed_ni"]).sum() / 1e9, obr("obr_income_tax_nics_2026_03.csv", "Class 4"), "£bn", "OBR March 2026", ""),
        ("Child Benefit", (w * d["child_benefit"]).sum() / 1e9, obr("obr_welfare_2026_03.csv", "Child benefit"), "£bn", "OBR March 2026", ""),
        ("Families paid Child Benefit", w[d["child_benefit"] > 0].sum() / 1e6, float(cb_fam["Total number of families [note 1]"]) / 1e6, "m", "HMRC August 2025", ""),
        ("Child Benefit charge", (w * d["child_benefit_charge"]).sum() / 1e9, 0.36, "£bn", "HMRC 2024-25 (provisional)", ""),
        ("Households on Universal Credit", w[d["uc_award_month"] > 0].sum() / 1e6, uc_t["households"].sum() / 1e6, "m", "DWP May 2026 (GB)", "ours includes Northern Ireland"),
        ("Universal Credit spending", (w * d["uc_award_month"]).sum() * 12 / 1e9, obr("obr_welfare_2026_03.csv", "Universal credit"), "£bn", "OBR March 2026", ""),
    ]
    rows += hbai_check(pop, res)
    table = pd.DataFrame(rows, columns=["measure", "ours", "published", "unit", "source", "note"])
    table["ratio"] = (table["ours"] / table["published"]).round(2)
    table["ours"] = table["ours"].round(2)
    table["published"] = table["published"].round(2)
    pd.set_option("display.width", 200)
    print(table[["measure", "ours", "published", "unit", "ratio", "source"]].to_string(index=False))
    table.to_csv(Path(results).with_name(Path(results).stem + "_check.csv"), index=False)


if __name__ == "__main__":
    main(*sys.argv[1:3])
