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


def main(population: str, results: str) -> None:
    units = pd.DataFrame([{"id": u["id"], "weight": u["weight"], "unit": u["unit"]} for u in json.loads(Path(population).read_text())["units"]])
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
        ("Employer NICs", (w * d["employer_ni"]).sum() / 1e9, obr("obr_income_tax_nics_2026_03.csv", "Class 1 Employer"), "£bn", "OBR March 2026", "ours ignores the Employment Allowance"),
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
