"""Turn the downloaded tables in data/raw/ into tidy CSVs in data/targets/.

Usage: .venv/Scripts/python.exe -I data/build_targets.py   (after data/fetch.py)

Every CSV is listed in data/targets/targets.yaml with its source, table, year and units.
Cells the publisher suppressed ("[Not available]") are left empty, never filled in.
"""

import re
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


def spi_other_income() -> pd.DataFrame:
    """HMRC SPI Table 3.7: property, interest, dividend and other income by band of total income (UK)."""
    t = read_table(RAW / "hmrc_spi_2324_tables_3_1_to_3_11.ods", "Table_3_7", t37_header())
    out = pd.DataFrame({"band_lower": t.iloc[:, 0].replace({"All ranges": "all", "All Ranges": "all"})})
    for prefix, name in [("Net income from property", "property"), ("Interest from building", "interest"), ("Dividends", "dividends"), ("Other income", "other")]:
        cols = [c for c in t.columns if str(c).startswith(prefix)]
        out[f"{name}_people_k"] = t[[c for c in cols if "Number" in str(c)][0]].to_numpy()
        out[f"{name}_gbp_m"] = t[[c for c in cols if "Amount" in str(c)][0]].to_numpy()
    return out


def spi_pension_contributions() -> pd.DataFrame:
    """HMRC SPI Table 3.8: pension contributions deducted before tax (net pay and relief at source), by band."""
    raw = pd.read_excel(RAW / "hmrc_spi_2324_tables_3_1_to_3_11.ods", engine="odf", sheet_name="Table_3_8", header=None)
    t = read_table(RAW / "hmrc_spi_2324_tables_3_1_to_3_11.ods", "Table_3_8", raw.iloc[4, 0])
    col = lambda start, kind: next(c for c in t.columns if str(c).startswith(start) and kind in str(c))
    return pd.DataFrame({
        "band_lower": t.iloc[:, 0].replace({"All ranges": "all", "All Ranges": "all"}),
        "net_pay_people_k": t[col("Contributions to Net Pay", "Number")].to_numpy(),
        "net_pay_gbp_m": t[col("Contributions to Net Pay", "Amount")].to_numpy(),
        "relief_at_source_people_k": t[col("Contributions to Relief at Source", "Number")].to_numpy(),
        "relief_at_source_gbp_m": t[col("Contributions to Relief at Source", "Amount")].to_numpy(),
    })


def spi_by_age() -> pd.DataFrame:
    """HMRC SPI Table 3.2: taxpayers and their median and mean total income, by age range (UK, both sexes)."""
    t = read_table(RAW / "hmrc_spi_2324_tables_3_1_to_3_11.ods", "Table_3_2", "Age range")
    t = t[t["Population"] == "All"]
    return pd.DataFrame({
        "age_range": t["Age range"].to_numpy(),
        "taxpayers_k": t["Number of taxpayers"].to_numpy(),
        "median_income_gbp": t["Median income before tax"].to_numpy(),
        "mean_income_gbp": t["Mean income before tax"].to_numpy(),
    })


def ashe_pay_by_age() -> pd.DataFrame:
    """ONS ASHE 2026 (provisional), Table 6.7a: annual gross pay of full-time and part-time employee jobs by age group:
    number of jobs, median, mean and percentiles. Annual pay is for the year to April 2026, for employees in the same
    job for over a year."""
    import zipfile
    with zipfile.ZipFile(RAW / "ons_ashe_table6_2026_provisional.zip") as z:
        name = next(n for n in z.namelist() if "6.7a" in n)
        with z.open(name) as f:
            book = pd.read_excel(f, sheet_name=["Full-Time", "Part-Time"], header=None)
    rows = []
    for status, raw in book.items():
        header = raw.index[raw[0] == "Description"][0]
        pcts = {int(float(raw.at[header, c])): c for c in raw.columns[7:17] if pd.notna(raw.at[header, c])}
        for i in range(header + 1, len(raw)):
            label = raw.at[i, 0]
            if not isinstance(label, str) or label == "Not Classified" or label.startswith(("a ", "b ", "c ", "KEY", "The ", "Source")):
                continue
            num = lambda v: None if isinstance(v, str) else float(v)
            row = {"status": status.lower(), "age": label.strip().rstrip("b"), "jobs_k": num(raw.at[i, 2]),
                   "median": num(raw.at[i, 3]), "mean": num(raw.at[i, 5])}
            row.update({f"p{p}": num(raw.at[i, c]) for p, c in sorted(pcts.items())})
            row["p50"] = row["median"]
            rows.append(row)
    return pd.DataFrame(rows)


def spi_self_employment_ranges() -> pd.DataFrame:
    """HMRC SPI Table 3.10: taxpayers with self-employment income, by range of that income: people and amounts."""
    raw = pd.read_excel(RAW / "hmrc_spi_2324_tables_3_1_to_3_11.ods", engine="odf", sheet_name="Table_3_10", header=None)
    t = read_table(RAW / "hmrc_spi_2324_tables_3_1_to_3_11.ods", "Table_3_10", raw.iloc[4, 0])
    col = lambda kind: next(c for c in t.columns if str(c).startswith("Self-employment income") and kind in str(c))
    return pd.DataFrame({
        "band_lower": t.iloc[:, 0].replace({"All ranges": "all", "All Ranges": "all"}),
        "people_k": t[col("Numb")].to_numpy(),
        "amount_gbp_m": t[col("Amou")].to_numpy(),
    })


def t37_header() -> str:
    raw = pd.read_excel(RAW / "hmrc_spi_2324_tables_3_1_to_3_11.ods", engine="odf", sheet_name="Table_3_7", header=None)
    return raw.iloc[4, 0]


def liabilities_2026_27() -> tuple[pd.DataFrame, pd.DataFrame]:
    """HMRC Income Tax liabilities statistics (July 2026): projections for 2026-27 itself.
    Table 2.5: taxpayers, income and tax by range of total income. Table 2.6: tax by source and band."""
    path = RAW / "hmrc_income_tax_liabilities_2026_07.ods"
    t25 = simple_table(path, "2_5_IT_Liabilities_2026-27")
    t25.columns = [str(c).replace("\n", " ") for c in t25.columns]
    pick = lambda start: next(c for c in t25.columns if c.startswith(start))
    by_range = pd.DataFrame({
        "band_lower": t25.iloc[:, 0].astype(str).str.replace(r"[^\d.]", "", regex=True).replace("", "all"),
        "taxpayers_k": t25[pick("Total number")],
        "total_income_gbp_m": t25[pick("Total income")],
        "income_tax_gbp_m": t25[pick("Total Income Tax")],
    })
    by_range.loc[t25.iloc[:, 0].astype(str).str.startswith("All"), "band_lower"] = "all"
    by_range["band_lower"] = by_range["band_lower"].str.replace(r"\.0$", "", regex=True)
    t26 = simple_table(path, "2_6_IT_by_income_source_2026-27")
    t26.columns = ["line", "savers_rate", "basic_rate", "higher_rate", "additional_rate", "all_taxpayers"]
    return by_range, t26


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


def nics_reliefs() -> pd.DataFrame:
    """HMRC's cost estimates for National Insurance reliefs (tax relief statistics, January 2026, Table 2)."""
    t = simple_table(RAW / "hmrc_tax_relief_statistics_2026_01.ods", "Table_2")
    t.columns = [str(c).replace("\n", " ").strip() for c in t.columns]
    t = t[t.iloc[:, 2].astype(str).str.strip() == "NICs"]
    years = [c for c in t.columns if re.match(r"^20\d\d to 20\d\d", c)]
    keep = t[[t.columns[0], t.columns[1], *years]].rename(columns={t.columns[0]: "relief", t.columns[1]: "reference"})
    return keep.melt(id_vars=["relief", "reference"], var_name="year", value_name="cost_gbp_m")


def main() -> None:
    reliefs = nics_reliefs()
    reliefs.to_csv(OUT / "hmrc_nics_reliefs_2026_01.csv", index=False)
    print("NICs reliefs:", reliefs[reliefs["year"].str.startswith("2025")][["relief", "cost_gbp_m"]].to_string(index=False))
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
    r25, r26 = liabilities_2026_27()
    r25.to_csv(OUT / "hmrc_income_tax_by_range_2026_27.csv", index=False)
    r26.to_csv(OUT / "hmrc_income_tax_by_source_2026_27.csv", index=False)
    print("Table 2.5 (2026-27):", r25.to_string(index=False))
    pc = spi_pension_contributions()
    pc.to_csv(OUT / "hmrc_pension_contributions_by_band_2023_24.csv", index=False)
    print("Table 3.8:", pc[pc["band_lower"] == "all"].to_dict("records"))
    ashe = ashe_pay_by_age()
    ashe.to_csv(OUT / "ons_ashe_annual_pay_by_age_2026.csv", index=False)
    print("ASHE 2026 Table 6.7a:", ashe[["status", "age", "jobs_k", "median", "mean", "p10", "p90"]].to_string(index=False))
    se = spi_self_employment_ranges()
    se.to_csv(OUT / "hmrc_self_employment_by_range_2023_24.csv", index=False)
    print("Table 3.10:", se.to_string(index=False))
    ages = spi_by_age()
    ages.to_csv(OUT / "hmrc_income_by_age_2023_24.csv", index=False)
    print("Table 3.2:", ages.to_string(index=False))
    o = spi_other_income()
    o.to_csv(OUT / "hmrc_property_interest_dividends_by_band_2023_24.csv", index=False)
    print("Table 3.7:", o[o["band_lower"] == "all"].to_dict("records"))
    for name, df in child_benefit().items():
        df.to_csv(OUT / name, index=False)
        print(f"{name}: {len(df)} rows; columns {list(df.columns)[:4]}...")
    uk = t[(t["region"] == "United Kingdom") & (t["band_lower"] == "all")].iloc[0]
    print(f"Table 3.11: {len(t)} rows, {t['region'].nunique()} regions. UK taxpayers {uk['taxpayers_k']}k, "
          f"total income £{uk['total_income_gbp_m']}m, income tax £{uk['income_tax_gbp_m']}m.")


if __name__ == "__main__":
    main()
