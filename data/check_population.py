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


def obr(file: str, line_start: str, section: str | None = None) -> float:
    t = pd.read_csv(T / file)
    t = t[(t["year"] == "2026-27") & t["line"].str.startswith(line_start)]
    if section:
        t = t[t["section"].str.startswith(section)]
    return float(t["gbp_bn"].sum())


def nics_relief(name_start: str) -> float:
    """HMRC's 2025-26 cost of a NICs relief, £bn (tax relief statistics, January 2026)."""
    t = pd.read_csv(T / "hmrc_nics_reliefs_2026_01.csv")
    row = t[t["relief"].str.startswith(name_start) & t["year"].str.startswith("2025")]
    return float(str(row["cost_gbp_m"].iloc[0]).replace(",", "")) / 1e3


def main(population: str, results: str) -> None:
    pop = json.loads(Path(population).read_text())["units"]
    units = pd.DataFrame([{"id": u["id"], "weight": u["weight"], "unit": u["unit"]} for u in pop])
    # Employee NICs that people over State Pension age would pay if they weren't exempt.
    over_spa = sum(
        u["weight"] * (max(0.0, min(a["employment"], 50_270) - 12_570) * 0.08 + max(0.0, a["employment"] - 50_270) * 0.02)
        for u in pop for a in u["data"]["adults"] if a["age"] >= 66
    ) / 1e9
    employees = sum(u["weight"] for u in pop for a in u["data"]["adults"] if a["employment"] > 0) / 1e6
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
        ("Households", w[d["unit"] == 0].sum() / 1e6, 28.972, "m", "FRS 2024-25", "matches by construction"),
        ("Income taxpayers", (w * d["taxpayers"]).sum() / 1e6, spi_uk["taxpayers_k"] / 1e3, "m", "HMRC SPI 2023-24", "2023-24; frozen thresholds mean more by 2026-27"),
        ("Employment income", (w * d["employment"]).sum() / 1e9, spi_uk["employment_gbp_m"] / 1e3 * EARNINGS_2023_24_TO_2026_27, "£bn", "HMRC SPI 2023-24, uprated", "taxpayers only in HMRC's figure"),
        ("Self-employment profits", (w * d["self_employment"]).sum() / 1e9, spi_uk["self_employment_gbp_m"] / 1e3 * EARNINGS_2023_24_TO_2026_27, "£bn", "HMRC SPI 2023-24, uprated", "taxpayers only"),
        ("Pension income", (w * d["pension"]).sum() / 1e9, spi_uk["pension_gbp_m"] / 1e3 * EARNINGS_2023_24_TO_2026_27, "£bn", "HMRC SPI 2023-24, uprated", "taxpayers only; uprated with earnings as an approximation"),
        ("Income tax", (w * d["income_tax"]).sum() / 1e9, obr("obr_income_tax_nics_2026_03.csv", "Income tax"), "£bn", "OBR March 2026", "OBR includes tax on savings, dividends, property"),
        ("Employee NICs", (w * d["employee_ni"]).sum() / 1e9, obr("obr_income_tax_nics_2026_03.csv", "Class 1 Employee"), "£bn", "OBR March 2026", ""),
        ("Employer NICs", (w * d["employer_ni"]).sum() / 1e9 - lump_sums, obr("obr_income_tax_nics_2026_03.csv", "Class 1 Employer"), "£bn", "OBR March 2026",
         f"less £{lump_sums:.1f}bn Employment Allowance and apprentice relief (HMRC 2025-26 costs, not per household)"),
        ("Employees", employees, 29.825, "m", "OBR March 2026 (table 1.6)", ""),
        ("Employee NICs exemption over State Pension age", over_spa, nics_relief("Exemption for individuals over State Pension Age"), "£bn", "HMRC tax relief statistics 2025-26", ""),
        ("Self-employed NICs", (w * d["self_employed_ni"]).sum() / 1e9, obr("obr_income_tax_nics_2026_03.csv", "Class 4"), "£bn", "OBR March 2026", ""),
        ("Child Benefit", (w * d["child_benefit"]).sum() / 1e9, obr("obr_welfare_2026_03.csv", "Child benefit"), "£bn", "OBR March 2026", ""),
        ("Families paid Child Benefit", w[d["child_benefit"] > 0].sum() / 1e6, float(cb_fam["Total number of families [note 1]"]) / 1e6, "m", "HMRC August 2025", ""),
        ("Child Benefit charge", (w * d["child_benefit_charge"]).sum() / 1e9, 0.36, "£bn", "HMRC 2024-25 (provisional)", ""),
        ("Households on Universal Credit", w[d["uc_award_month"] > 0].sum() / 1e6, uc_t["households"].sum() / 1e6, "m", "DWP May 2026 (GB)", "ours includes Northern Ireland"),
        ("Universal Credit spending", (w * d["uc_award_month"]).sum() * 12 / 1e9, obr("obr_welfare_2026_03.csv", "Universal credit"), "£bn", "OBR March 2026", ""),
    ]
    table = pd.DataFrame(rows, columns=["measure", "ours", "published", "unit", "source", "note"])
    table["ratio"] = (table["ours"] / table["published"]).round(2)
    table["ours"] = table["ours"].round(2)
    table["published"] = table["published"].round(2)
    pd.set_option("display.width", 200)
    print(table[["measure", "ours", "published", "unit", "ratio", "source"]].to_string(index=False))
    table.to_csv(Path(results).with_name(Path(results).stem + "_check.csv"), index=False)


if __name__ == "__main__":
    main(*sys.argv[1:3])
