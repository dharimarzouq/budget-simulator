"""Build forecasts/history-2026-10.yaml: the public finances since 1948-49 and real GDP growth, by financial year, for the
impact charts. History and forecast come from one OBR source (the public finances databank published with the October
2026 forecast), so the two join without a seam. Real growth: ONS quarterly GDP (ABMI) for outturn, the OBR's quarterly
real GDP forecast after that.

Usage: .venv/Scripts/python.exe -I data/build_history.py   (after data/fetch.py)
"""

from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
OUT = HERE.parent / "forecasts" / "history-2026-10.yaml"

# Databank "Aggregates (per cent of GDP)" columns, by their header text.
MEASURES = {
    "receipts": "Public sector current receipts",
    "spending": "Total managed expenditure",
    "investment": "Public sector net investment",
    "borrowing": "Public sector net borrowing",
    "current_budget_deficit": "Current budget deficit",
    "psnfl": "Public sector net financial liabilities",
    "psnd": "Public sector net debt",
}
FIRST_FORECAST = "2026-27"


def databank() -> pd.DataFrame:
    d = pd.read_excel(RAW / "obr_public_finances_databank_2026_10.xlsx", sheet_name="Aggregates (per cent of GDP)", header=None)
    header = {str(v).replace("\n", " ").strip(): c for c, v in d.iloc[3].items() if isinstance(v, str)}
    rows = d[d[1].astype(str).str.match(r"^\d{4}-\d{2}$")]
    out = pd.DataFrame({"year": rows[1].astype(str)})
    for key, title in MEASURES.items():
        col = next(c for h, c in header.items() if h.rstrip("0123456789") == title)
        out[key] = pd.to_numeric(rows[col], errors="coerce")
    return out.set_index("year")


def fy_volumes(quarters: dict[str, float]) -> dict[str, float]:
    """Financial-year totals (April to March: Q2 to Q1) from quarterly volumes keyed like '2025 Q2'."""
    years = sorted({int(k[:4]) for k in quarters})
    out = {}
    for y in years:
        ks = [f"{y} Q2", f"{y} Q3", f"{y} Q4", f"{y + 1} Q1"]
        if all(k in quarters for k in ks):
            out[f"{y}-{(y + 1) % 100:02d}"] = sum(quarters[k] for k in ks)
    return out


def growth() -> dict[str, float]:
    ons = pd.read_csv(RAW / "ons_abmi_gdp_cvm.csv", header=None, names=["period", "value"], skiprows=8)
    q = {str(p): float(v) for p, v in zip(ons["period"], ons["value"]) if " Q" in str(p)}
    ons_fy = fy_volumes(q)
    obr = pd.read_excel(RAW / "obr_efo_2026_10" / "efo-october-2026-detailed-forecast-tables-economy.xlsx", sheet_name="1.1", header=None)
    col = next(c for c, v in obr.iloc[2].items() if str(v).strip() == "Real GDP")
    oq = {}
    for period, value in zip(obr[1].tolist(), obr[col].tolist()):
        period = str(period)
        if len(period) == 6 and period[4] == "Q":
            oq[f"{period[:4]} {period[4:]}"] = float(value)
    obr_fy = fy_volumes(oq)
    out = {}
    for y, v in ons_fy.items():
        prev = f"{int(y[:4]) - 1}-{int(y[:4]) % 100:02d}"
        if prev in ons_fy and y < FIRST_FORECAST:
            out[y] = 100 * (v / ons_fy[prev] - 1)
    for y, v in obr_fy.items():
        prev = f"{int(y[:4]) - 1}-{int(y[:4]) % 100:02d}"
        if prev in obr_fy and y >= FIRST_FORECAST:
            out[y] = 100 * (v / obr_fy[prev] - 1)
    # The year both cover: how far the OBR's outturn growth is from the ONS's, as a check.
    y = "2025-26"
    check = 100 * (obr_fy[y] / obr_fy["2024-25"] - 1) - out[y]
    print(f"2025-26 real growth: ONS {out[y]:.2f}%, OBR's own outturn differs by {check:+.2f} points")
    return out


def main() -> None:
    d = databank()
    g = growth()
    lines = [
        "# Built by data/build_history.py from the OBR's public finances databank (October 2026 forecast) and ONS quarterly",
        "# real GDP (ABMI). Per cent of GDP, by financial year; real growth in per cent. 2026-27 onwards is the OBR's forecast.",
        "# Net financial liabilities (the debt rule's measure) are published from 2008-09 only.",
        "sources: [obr-public-finances-databank-2026-10, ons-gdp-abmi-2026-09, obr-efo-2026-10]",
        f"first_forecast: {FIRST_FORECAST}",
        "years:",
    ]
    for y, r in d.iterrows():
        vals = {k: (None if pd.isna(r[k]) else round(float(r[k]), 3)) for k in MEASURES}
        vals["real_growth"] = round(g[y], 3) if y in g else None
        lines.append(f"  {y}: {{ " + ", ".join(f"{k}: {'null' if v is None else v}" for k, v in vals.items()) + " }")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{len(d)} years -> {OUT}")


if __name__ == "__main__":
    main()
