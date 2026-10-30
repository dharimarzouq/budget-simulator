"""Milestone 3, step 3: a home for every private household: what it's worth, how much of that is land, and its
council tax band (or, in Northern Ireland, its capital value for domestic rates). Synthetic, grade C.

Usage: .venv/Scripts/python.exe -I data/build_homes.py
Reads data/build/population.json and data/build/seed_results.csv (the calibrated population) and the
published tables in data/raw/ (data/fetch.py). Writes data/build/homes.json, which data/export_population.py adds
to the file the site loads, and data/build/homes_check.csv, the checks. Runs after calibration and changes no
weights, so nothing else in the population moves.

How (POPULATION.md, "Homes"):
- Value. England: the Market Value Survey's mean value for the region and tenure (1 July 2024), grown to August 2026
  with the UK House Price Index for the region. Wales, Scotland and Northern Ireland: England's mean for the tenure,
  scaled by the nation's average price against England's (UK HPI, August 2026). Around that mean, values spread as a
  lognormal whose width for each tenure is fitted to the survey's count of homes by value band, and which leans
  with household income by a correlation fitted to the survey's spread of income against value.
- Land. What the home is worth less what it would cost to replace the building: its floor area times a cost per
  square metre. Floor area is the English Housing Survey's mean for the tenure, larger for dearer homes in the
  region. The cost per square metre is the ONS balance sheet's value of households' dwellings (the buildings alone,
  end of 2024) over the floor area of the homes households own (owner-occupied and privately rented). Land is never
  less than a tenth of the value.
- Band. Homes ranked by value within each region, and the bands filled to the published counts (VOA for English
  regions and Wales, Scottish Government for Scotland). The value at the valuation date (taken back with the region's
  House Price Index to 1 April 1991 in England and Scotland, 1 April 2003 in Wales) is kept too; in Northern Ireland,
  which has no bands, the value at 1 January 2005 is its capital value for domestic rates.
"""

import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from uprating import AWE  # noqa: E402

RAW = HERE / "raw"
BUILD = HERE / "build"
SEED = int(os.environ.get("POPULATION_SEED", 2026)) + 10

TENURES = ["Owned outright", "Buying with a mortgage", "Private rented", "Social rented"]
# The Market Value Survey's tenure for each FRS tenure (it doesn't split owners by mortgage).
MVS_TENURE = {"Owned outright": "owner", "Buying with a mortgage": "owner", "Private rented": "private", "Social rented": "social"}
ENGLAND = ["North East", "North West", "Yorkshire and The Humber", "East Midlands", "West Midlands", "East", "London", "South East", "South West"]
NATIONS = ["Wales", "Scotland", "Northern Ireland"]
# FRS region names against the Market Value Survey's and the UK HPI's.
MVS_NAME = {"Yorkshire and The Humber": "Yorkshire and the Humber", "East": "East of England"}
HPI_NAME = {"East": "East of England"}

# English Housing Survey 2019-20 headline report, paragraph 2.10: mean usable floor area, m2.
FLOOR_AREA = {"owner": 108.0, "private": 76.0, "social": 66.0}
# How floor area grows with value within a region and tenure: area = mean x (value / mean value)^this. Our
# judgement (a dearer home in the same place is partly bigger, partly on dearer land); see POPULATION.md.
AREA_ELASTICITY = 0.5
LAND_FLOOR = 0.1  # land is at least this share of a home's value
# ONS national balance sheet 2025, Table 9.11 (households), end of 2024, £ million: dwellings (AN.111, buildings
# only) and all land (AN.211, which also covers farmland and other land households own).
ONS_DWELLINGS_2024 = 1_960_671e6
ONS_HOUSEHOLD_LAND_2024 = 4_559_831e6

# Council tax bands: upper limits of each band at the valuation date (VOA; Scottish Government; Welsh Government).
BANDS = {
    "england": (["A", "B", "C", "D", "E", "F", "G", "H"], [40_000, 52_000, 68_000, 88_000, 120_000, 160_000, 320_000]),
    "scotland": (["A", "B", "C", "D", "E", "F", "G", "H"], [27_000, 35_000, 45_000, 58_000, 80_000, 106_000, 212_000]),
    "wales": (["A", "B", "C", "D", "E", "F", "G", "H", "I"], [44_000, 65_000, 91_000, 123_000, 162_000, 223_000, 324_000, 424_000]),
}
BAND_CODES = ["A", "B", "C", "D", "E", "F", "G", "H", "I"]
VALUATION_DATE = {"england": "1991-04", "scotland": "1991-04", "wales": "2003-04", "northern_ireland": "2005-01"}
PRICE_DATE = "2026-08"  # the latest UK HPI month: the population's values are at this date
MVS_DATE = "2024-07"


def nation(region: str) -> str:
    return {"Wales": "wales", "Scotland": "scotland", "Northern Ireland": "northern_ireland"}.get(region, "england")


# ---- published tables -----------------------------------------------------------------------------------------------
def mvs_means() -> dict[tuple[str, str], float]:
    """Market Value Survey 2024, Annex Table 1.3: mean value by region and tenure at 1 July 2024, £."""
    t = pd.read_excel(RAW / "mhclg_mvs_2024_ch1.ods", sheet_name="AT1_3", header=None)
    out = {}
    for region in ENGLAND:
        row = t[t[1].astype(str).str.strip() == MVS_NAME.get(region, region)].iloc[0]  # the first block holds the means
        out[(region, "owner")], out[(region, "private")], out[(region, "social")] = (float(row[c]) * 1000 for c in (9, 10, 13))
    return out


def mvs_bands() -> tuple[list[float], dict[str, np.ndarray]]:
    """Annex Table 1.2a: homes by value band, England, 1 July 2024 (thousands). Unreliable cells ('u') count as 0."""
    t = pd.read_excel(RAW / "mhclg_mvs_2024_ch1.ods", sheet_name="AT1_2a", header=None)
    start = t.index[t[1].astype(str).str.startswith("Less than")][0]
    rows = t.iloc[start:start + 10]
    num = lambda c: pd.to_numeric(rows[c], errors="coerce").fillna(0).to_numpy()
    edges = [100e3, 200e3, 300e3, 400e3, 500e3, 600e3, 700e3, 1e6, 2e6]
    return edges, {"owner": num(9), "private": num(10), "social": num(13)}


def mvs_income_ratio() -> dict[str, np.ndarray]:
    """Annex Table 3.3a: households by joint income as a share of their home's value, England, 2024 (thousands)."""
    t = pd.read_excel(RAW / "mhclg_mvs_2024_ch3.ods", sheet_name="AT3_3a", header=None)
    start = t.index[t[1].astype(str).str.strip() == "0-10%"][0]
    rows = t.iloc[start:start + 5]
    return {"owner": rows[7].to_numpy(float), "private": rows[8].to_numpy(float), "social": rows[9].to_numpy(float)}


def hpi() -> pd.DataFrame:
    d = pd.read_csv(RAW / "hmlr_ukhpi_average_prices_2026_08.csv")
    d["month"] = d["Date"].str[:7]
    return d.pivot_table(index="month", columns="Region_Name", values="Average_Price")


def price(h: pd.DataFrame, area: str, month: str) -> float:
    return float(h.at[month, area])


def back_to(h: pd.DataFrame, region: str, month: str) -> float:
    """Prices at `month` over prices now, for the region (or nation). Regions whose UK HPI series starts after the month
    use their own series from its start and England's before it."""
    area = {"england": None, "wales": "Wales", "scotland": "Scotland", "northern_ireland": "Northern Ireland"}[nation(region)] or HPI_NAME.get(region, region)
    series = h[area].dropna()
    if month in series.index:
        return price(h, area, month) / price(h, area, PRICE_DATE)
    first = series.index[0]
    return (price(h, "England", month) / price(h, "England", first)) * (price(h, area, first) / price(h, area, PRICE_DATE))


def voa_bands() -> pd.DataFrame:
    """VOA council tax stock of properties, 31 March 2025, Table CTSOP1.0: properties by band, English regions and Wales."""
    t = pd.read_excel(RAW / "voa_ctsop_2025_summary.xlsx", sheet_name="CTSOP1.0", header=None)
    head = t.index[t[0].astype(str).str.startswith("Geography")][0]
    t.columns = [str(c).split(" [")[0] for c in t.iloc[head]]
    t = t.iloc[head + 1:]
    t = t[t["Geography"].isin(["REGL", "WALES"]) | (t["ONS area name"] == "Wales")]
    t = t.set_index("ONS area name")[BAND_CODES].apply(pd.to_numeric, errors="coerce").fillna(0)
    return t.rename(index={"East of England": "East"})


def scottish_bands() -> pd.Series:
    """Scottish Government, chargeable dwellings by band, September 2025 (Scotland)."""
    t = pd.read_excel(RAW / "sg_ctaxbase_2025_chargeable_dwellings.xlsx", header=None)
    row = t[t[0].astype(str).str.strip() == "Scotland"].iloc[0]
    return pd.Series([float(row[i]) for i in range(1, 9)], index=BAND_CODES[:8])


# ---- the population -------------------------------------------------------------------------------------------------
def households() -> pd.DataFrame:
    """One row per private household: its weight, region, tenure, and the joint income of its first family (the
    household reference person and partner: the Market Value Survey's 'joint income'), £ a year."""
    pop = json.loads((BUILD / "population.json").read_text(encoding="utf-8"))
    res = pd.read_csv(BUILD / "seed_results.csv").set_index("id")  # calibration changes only weights, so the seed's results serve
    rows = []
    for u in pop["units"]:
        if u["unit"] != 0 or u.get("outside"):
            continue
        r = res.loc[u["id"]]
        income = r["gross"] + r["child_benefit"] + 12 * r["uc_award_month"]
        rows.append({"household": u["household"], "weight": u["weight"], "region": u["regionDetail"], "tenure": u["tenure"], "income": income})
    return pd.DataFrame(rows)


def weighted_normal_scores(x: np.ndarray, w: np.ndarray) -> np.ndarray:
    """Each value's place in the weighted distribution, as a standard normal score."""
    order = np.argsort(x, kind="stable")
    cum = np.cumsum(w[order])
    p = (cum - w[order] / 2) / cum[-1]
    z = np.empty_like(x, dtype=float)
    z[order] = norm.ppf(p)
    return z


def fit_spread(means: dict, counts: dict, edges: list[float], bands: np.ndarray) -> float:
    """The lognormal width for a tenure that best reproduces England's homes by value band, given each region's mean."""
    shares = bands / bands.sum()
    total = sum(counts.values())
    best = None
    for s in np.arange(0.15, 1.2, 0.01):
        cdf = np.zeros(len(edges))
        for region, n in counts.items():
            mu = np.log(means[region]) - s * s / 2
            cdf += n / total * norm.cdf((np.log(edges) - mu) / s)
        model = np.diff(np.concatenate([[0], cdf, [1]]))
        err = float(((model - shares) ** 2).sum())
        if best is None or err < best[0]:
            best = (err, s)
    return round(best[1], 2)


def main() -> None:
    h = hpi()
    hh = households()
    rng = np.random.default_rng(SEED)
    means24 = mvs_means()
    edges, value_bands = mvs_bands()
    ratio_bins = mvs_income_ratio()
    hh["mvs"] = hh["tenure"].map(MVS_TENURE)
    hh["nation"] = hh["region"].map(nation)

    # Mean value for each region and tenure, at the population's price date.
    eng = hh[hh["nation"] == "england"]
    england_mean = {}
    for t in ("owner", "private", "social"):
        w = eng[eng["mvs"] == t].groupby("region")["weight"].sum()
        england_mean[t] = sum(means24[(r, t)] * w[r] for r in ENGLAND) / w.sum()
    target = {}
    for r in ENGLAND:
        g = price(h, HPI_NAME.get(r, r), PRICE_DATE) / price(h, HPI_NAME.get(r, r), MVS_DATE)
        for t in ("owner", "private", "social"):
            target[(r, t)] = means24[(r, t)] * g
    for r in NATIONS:
        scale = price(h, r, PRICE_DATE) / price(h, "England", PRICE_DATE)
        g = price(h, "England", PRICE_DATE) / price(h, "England", MVS_DATE)
        for t in ("owner", "private", "social"):
            target[(r, t)] = england_mean[t] * g * scale

    # The spread for each tenure, fitted to England's homes by value band (at July 2024 prices).
    spread = {}
    for t in ("owner", "private", "social"):
        counts = eng[eng["mvs"] == t].groupby("region")["weight"].sum().to_dict()
        spread[t] = fit_spread({r: means24[(r, t)] for r in ENGLAND}, counts, edges, value_bands[t])

    # Values: each household's place by income (within its nation and tenure) and its own luck, mixed by a
    # correlation fitted to the survey's spread of income against value.
    hh["z_income"] = 0.0
    for (_, t), g in hh.groupby(["nation", "mvs"]):
        hh.loc[g.index, "z_income"] = weighted_normal_scores(g["income"].to_numpy(), g["weight"].to_numpy())
    hh["luck"] = rng.standard_normal(len(hh))
    income_2024 = hh["income"] * AWE["2024-25"] / AWE["2026-27"]  # back to the survey's year, with average earnings

    def values(rho: dict[str, float]) -> np.ndarray:
        s = hh["mvs"].map(spread).to_numpy()
        r_ = hh["mvs"].map(rho).to_numpy()
        z = r_ * hh["z_income"].to_numpy() + np.sqrt(1 - r_ ** 2) * hh["luck"].to_numpy()
        v = np.exp(s * z - s * s / 2)
        # Scale each region and tenure to its mean exactly.
        out = np.empty(len(hh))
        for (region, t), g in hh.groupby(["region", "mvs"]):
            i = g.index.to_numpy()
            out[i] = v[i] * target[(region, t)] / np.average(v[i], weights=g["weight"])
        return out

    rho = {"owner": 0.0, "private": 0.0, "social": 0.0}
    eng_rows = (hh["nation"] == "england").to_numpy()
    ratio_edges = [0.1, 0.2, 0.3, 0.4]
    fit_report = {}
    for t in ("owner", "private", "social"):
        best = None
        for r_ in np.arange(0.0, 0.95, 0.05):
            v = values({**rho, t: r_})
            sel = eng_rows & (hh["mvs"] == t).to_numpy()
            v_2024 = v[sel] * price(h, "England", MVS_DATE) / price(h, "England", PRICE_DATE)
            ratio = income_2024.to_numpy()[sel] / v_2024
            shares = np.bincount(np.digitize(ratio, ratio_edges), weights=hh["weight"].to_numpy()[sel], minlength=5)
            shares = shares / shares.sum()
            err = float(((shares - ratio_bins[t] / ratio_bins[t].sum()) ** 2).sum())
            if best is None or err < best[0]:
                best = (err, round(float(r_), 2), shares)
        rho[t] = best[1]
        fit_report[t] = best[2]
    hh["value"] = values(rho)

    # Floor area and land.
    hh["mean_value"] = [target[(r, t)] for r, t in zip(hh["region"], hh["mvs"])]
    hh["area"] = hh["mvs"].map(FLOOR_AREA) * (hh["value"] / hh["mean_value"]) ** AREA_ELASTICITY
    for t, g in hh.groupby("mvs"):  # keep each tenure's mean floor area at the survey's
        hh.loc[g.index, "area"] *= FLOOR_AREA[t] / np.average(g["area"], weights=g["weight"])
    private = hh["mvs"].isin(["owner", "private"])
    cost_per_m2 = ONS_DWELLINGS_2024 / float((hh.loc[private, "weight"] * hh.loc[private, "area"]).sum())
    building = hh["area"] * cost_per_m2
    hh["land"] = np.maximum(hh["value"] - building, LAND_FLOOR * hh["value"])

    # Value at the valuation date, and the band. Banding the deflated values puts far too many homes in band A (the
    # House Price Index follows homes sold, not the stock), so instead homes are ranked by value within each region and
    # the bands filled to the published counts: the cheapest homes in band A until it holds the region's share, and so on.
    hh["valuation"] = [v * back_to(h, r, VALUATION_DATE[nation(r)]) for v, r in zip(hh["value"], hh["region"])]
    voa = voa_bands()
    sc = scottish_bands()
    deflated = []  # what banding the deflated values would give, kept for the check below
    hh["band"] = None
    for region, g in hh.groupby("region"):
        n = nation(region)
        if n not in BANDS:
            continue
        names, limits = BANDS[n]
        deflated += [(i, names[int(np.searchsorted(limits, x, side="left"))]) for i, x in zip(g.index, g["valuation"])]
        pub = (sc if region == "Scotland" else voa.loc[region])[names].to_numpy(float)
        cum = np.cumsum(pub) / pub.sum()
        order = np.argsort(g["value"].to_numpy(), kind="stable")
        w = g["weight"].to_numpy()[order]
        p = (np.cumsum(w) - w / 2) / w.sum()  # each home's place in the region, by value
        k = np.minimum(np.searchsorted(cum, p, side="left"), len(names) - 1)
        hh.loc[g.index[order], "band"] = [names[j] for j in k]
    hh["band_deflated"] = pd.Series(dict(deflated))

    # ---- checks ----------------------------------------------------------------------------------------------------
    checks = []
    def check(group: str, measure: str, ours: float, published: float, source: str):
        checks.append({"group": group, "measure": measure, "population": ours, "published": published,
                       "difference": ours / published - 1 if published else np.nan, "source": source})

    end_2024 = lambda v: v * price(h, "United Kingdom", "2024-12") / price(h, "United Kingdom", PRICE_DATE)
    hh_owned = hh[private]
    total_value = end_2024(float((hh_owned["weight"] * hh_owned["value"]).sum()))
    total_land = end_2024(float((hh_owned["weight"] * hh_owned["land"]).sum()))
    check("ONS balance sheet", "Homes households own, buildings and land, £bn (end 2024)", total_value / 1e9, (ONS_DWELLINGS_2024 + ONS_HOUSEHOLD_LAND_2024) / 1e9,
          "ONS national balance sheet 2025, Table 9.11: dwellings plus all land households own")
    check("ONS balance sheet", "Land under homes households own, £bn (end 2024)", total_land / 1e9, ONS_HOUSEHOLD_LAND_2024 / 1e9,
          "ONS national balance sheet 2025, Table 9.11: all land households own (includes farmland and other land)")
    for t in ("owner", "private", "social"):
        sel = hh[hh["mvs"] == t]
        share = float((sel["weight"] * sel["land"]).sum() / (sel["weight"] * sel["value"]).sum())
        check("Land share", f"Land as a share of value, {t}", share, np.nan, "ours only")
    for t in ("owner", "private", "social"):
        sel = hh[eng_rows & (hh["mvs"] == t).to_numpy()]
        v24 = sel["value"] * price(h, "England", MVS_DATE) / price(h, "England", PRICE_DATE)
        ours = np.bincount(np.digitize(v24, edges), weights=sel["weight"], minlength=len(edges) + 1)
        pub = value_bands[t]
        for k, label in enumerate(["<100k", "100-200k", "200-300k", "300-400k", "400-500k", "500-600k", "600-700k", "700k-1m", "1-2m", "2m+"]):
            check("Value bands, England (Market Value Survey 2024)", f"{t} {label}, share", ours[k] / ours.sum(), pub[k] / pub.sum(), "MVS 2024 Annex Table 1.2a")
        for k, label in enumerate(["0-10%", "10-20%", "20-30%", "30-40%", "40%+"]):
            check("Income as a share of value, England (Market Value Survey 2024)", f"{t} {label}", fit_report[t][k], ratio_bins[t][k] / ratio_bins[t].sum(), "MVS 2024 Annex Table 3.3a")
    # Bands: the ranked bands match by construction (this checks the ranking); the deflated values show how far apart
    # values and bands are, which POPULATION.md reports.
    for col, label in (("band", ""), ("band_deflated", ", from deflated values")):
        for region in [*ENGLAND, "Wales"]:
            sel = hh[hh["region"] == region]
            names = BANDS[nation(region)][0]
            ours = sel.groupby(col)["weight"].sum().reindex(names, fill_value=0)
            pub = voa.loc[region, names]
            for b in names:
                check(f"Council tax bands (VOA, 31 March 2025){label}", f"{region} band {b}, share", ours[b] / ours.sum(), pub[b] / pub.sum(), "VOA council tax stock of properties 2025, CTSOP1.0")
        sel = hh[hh["region"] == "Scotland"]
        ours = sel.groupby(col)["weight"].sum().reindex(sc.index, fill_value=0)
        for b in sc.index:
            check(f"Council tax bands (Scotland, September 2025){label}", f"Scotland band {b}, share", ours[b] / ours.sum(), sc[b] / sc.sum(), "Scottish Government, chargeable dwellings September 2025")
    pd.DataFrame(checks).to_csv(BUILD / "homes_check.csv", index=False)

    # ---- output ----------------------------------------------------------------------------------------------------
    out = {
        "_about": "Synthetic homes for the population's private households (data/build_homes.py). Values at August 2026 prices, £.",
        "price_date": PRICE_DATE,
        "assumptions": {"spread": spread, "income_correlation": rho, "cost_per_m2": round(cost_per_m2), "area_elasticity": AREA_ELASTICITY, "land_floor": LAND_FLOOR},
        "homes": {str(int(r.household)): {"tenure": r.tenure, "value": round(r.value, -2), "land": round(r.land, -2), "area": round(r.area),
                                          "valuation": round(r.valuation, -2), "band": r.band if isinstance(r.band, str) else None} for r in hh.itertuples()},
    }
    (BUILD / "homes.json").write_text(json.dumps(out), encoding="utf-8")

    print(f"{len(hh):,} homes. Spread {spread}; income correlation {rho}; building cost £{cost_per_m2:,.0f} per m2")
    c = pd.DataFrame(checks)
    for g, x in c.groupby("group"):
        if g in ("ONS balance sheet", "Land share"):
            for r in x.itertuples():
                print(f"  {r.measure}: {r.population:,.3f} against {r.published:,.3f}")
        else:
            print(f"  {g}: median miss {np.nanmedian(np.abs(x['population'] - x['published'])) * 100:.1f} points, worst {np.nanmax(np.abs(x['population'] - x['published'])) * 100:.1f}")


if __name__ == "__main__":
    main()
