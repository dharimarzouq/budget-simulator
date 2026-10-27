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


def simple_table(path: Path, sheet: str) -> pd.DataFrame:
    """A sheet with a few lines of notes, then a header row, then data until 'End of worksheet'."""
    raw = pd.read_excel(path, engine="odf", sheet_name=sheet, header=None)
    header = raw.index[raw.notna().sum(axis=1) > 1][0]
    return read_table(path, sheet, raw.iloc[header, 0])


def child_benefit() -> dict[str, pd.DataFrame]:
    path = RAW / "hmrc_child_benefit_aug_2025_main_tables.ods"
    out = {
        "hmrc_child_benefit_families_by_size_2025_08.csv": simple_table(path, "Table_2"),
        "hmrc_child_benefit_children_by_age_region_2025_08.csv": simple_table(path, "Table_4"),
        "hmrc_child_benefit_opted_out_children_by_age_region_2025_08.csv": simple_table(path, "Table_10"),
        "hmrc_hicbc_liability_by_year.csv": simple_table(path, "Table_16"),
    }
    for df in out.values():
        df.columns = [str(c).replace("�", "£").replace("\n", " ").strip() for c in df.columns]
    return out


def obr_table(file: str, sheet: str) -> pd.DataFrame:
    """An OBR detailed forecast table as long rows: line, year, £ billion. Footnote rows are dropped."""
    raw = pd.read_excel(RAW / file, sheet_name=sheet, header=None)
    year_row = raw.index[raw.apply(lambda r: r.astype(str).str.fullmatch(r"20\d\d-\d\d").sum() >= 3, axis=1)][0]
    years = {c: raw.at[year_row, c] for c in raw.columns if isinstance(raw.at[year_row, c], str) and raw.at[year_row, c][:2] == "20"}
    rows = []
    section = ""
    for i in range(year_row + 1, len(raw)):
        label = raw.at[i, 1]
        if not isinstance(label, str) or label[:1].isdigit() or label.startswith("*"):
            continue
        cells = {y: raw.at[i, c] for c, y in years.items()}
        if all(pd.isna(v) for v in cells.values()):
            section = label.strip()  # a heading such as "Welfare cap"
            continue
        for y, v in cells.items():
            rows.append({"section": section, "line": label.strip(), "year": y,
                         "gbp_bn": None if v == "*" else float(v)})  # "*" means under £0.5m
    return pd.DataFrame(rows)


def main() -> None:
    for name, (file, sheet) in {
        "obr_income_tax_nics_2026_03.csv": ("obr_efo_2026_03_receipts.xlsx", "3.4"),
        "obr_welfare_2026_03.csv": ("obr_efo_2026_03_expenditure.xlsx", "4.9"),
    }.items():
        t = obr_table(file, sheet)
        t.to_csv(OUT / name, index=False)
        y = t[t["year"] == "2026-27"]
        print(f"{name}: {len(t)} rows. 2026-27: " + "; ".join(f"{r.line[:30]} £{r.gbp_bn:.1f}bn" for r in y.itertuples() if r.gbp_bn and r.gbp_bn > 10))
    OUT.mkdir(exist_ok=True)
    t = spi_by_region()
    t.to_csv(OUT / "hmrc_income_by_region_band_2023_24.csv", index=False)
    for name, df in child_benefit().items():
        df.to_csv(OUT / name, index=False)
        print(f"{name}: {len(df)} rows; columns {list(df.columns)[:4]}...")
    uk = t[(t["region"] == "United Kingdom") & (t["band_lower"] == "all")].iloc[0]
    print(f"Table 3.11: {len(t)} rows, {t['region'].nunique()} regions. UK taxpayers {uk['taxpayers_k']}k, "
          f"total income £{uk['total_income_gbp_m']}m, income tax £{uk['income_tax_gbp_m']}m.")


if __name__ == "__main__":
    main()
