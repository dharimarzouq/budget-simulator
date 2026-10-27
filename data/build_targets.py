"""Turn the downloaded tables in data/raw/ into tidy CSVs in data/targets/.

Usage: .venv/Scripts/python.exe -I data/build_targets.py   (after data/fetch.py)

Every CSV is listed in data/targets/targets.yaml with its source, table, year and units.
Cells the publisher suppressed ("[Not available]") are left empty, never filled in.
"""

from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
OUT = HERE / "targets"

SUPPRESSED = {"[Not available]", "[x]", "[c]", "[low]", "[z]"}


def clean(v):
    if isinstance(v, str) and v.strip() in SUPPRESSED:
        return None
    return v


def read_table(path: Path, sheet: str, header_first_cell: str) -> pd.DataFrame:
    """A sheet whose header row starts with header_first_cell, ending at 'End of worksheet'."""
    raw = pd.read_excel(path, engine="odf", sheet_name=sheet, header=None)
    start = raw.index[raw[0] == header_first_cell][0]
    body = raw.iloc[start + 1 :]
    end = body.index[body[0] == "End of worksheet"]
    if len(end):
        body = body.loc[: end[0] - 1]
    body.columns = raw.iloc[start].tolist()
    return body.map(clean).reset_index(drop=True)


def spi_by_region() -> pd.DataFrame:
    t = read_table(RAW / "hmrc_spi_2324_tables_3_1_to_3_11.ods", "Table_3_11", "Region or country")
    t = t[t["Population"] == "All"].copy()
    names = {
        "Region or country": "region",
        "Range of total income (lower limit) £": "band_lower",
        "Self-employment income (Number of individuals)": "self_employment_people_k",
        "Self-employment income (Amount)": "self_employment_gbp_m",
        "Employment income (Number of individuals)": "employment_people_k",
        "Employment income (Amount)": "employment_gbp_m",
        "Pension income (Number of individuals)": "pension_people_k",
        "Pension income (Amount)": "pension_gbp_m",
        "Property, interest, dividend and other income (Number of individuals)": "other_people_k",
        "Property, interest, dividend and other income (Amount)": "other_gbp_m",
        "Total income (Number of individuals)": "taxpayers_k",
        "Total income (Amount)": "total_income_gbp_m",
        "Total tax (Number of individuals)": "tax_people_k",
        "Total tax (Amount)": "income_tax_gbp_m",
    }
    # Column headers carry note markers like " [Note 1]"; match on the text before them.
    t.columns = [names.get(str(c).split(" [")[0].replace("�", "£"), c) for c in t.columns]
    missing = [v for v in names.values() if v not in t.columns]
    if missing:
        raise SystemExit(f"Table 3.11 layout changed; missing columns: {missing}")
    t = t[list(names.values())]
    t["band_lower"] = t["band_lower"].replace({"All Ranges": "all", "All ranges": "all"})
    return t


def main() -> None:
    OUT.mkdir(exist_ok=True)
    t = spi_by_region()
    t.to_csv(OUT / "hmrc_income_by_region_band_2023_24.csv", index=False)
    uk = t[(t["region"] == "United Kingdom") & (t["band_lower"] == "all")].iloc[0]
    print(f"Table 3.11: {len(t)} rows, {t['region'].nunique()} regions. UK taxpayers {uk['taxpayers_k']}k, "
          f"total income £{uk['total_income_gbp_m']}m, income tax £{uk['income_tax_gbp_m']}m.")


if __name__ == "__main__":
    main()
