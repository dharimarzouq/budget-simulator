"""Step 5e: write the calibrated population as a compact file the page loads.

Usage: .venv/Scripts/python.exe -I data/export_population.py
Reads data/build/population.json, data/build/homes.json (data/build_homes.py) and data/build/seed_results_check.csv.
Writes public/data/population-2026-27.json (committed, served with the site).

Money is rounded to whole pounds and weights to one decimal place, which keeps the file small;
totals move by well under 0.1%. Each unit is a list, in the order given by "fields", to avoid
repeating key names 35,000 times.
"""

import json
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "public" / "data" / "population-2026-27.json"

REGIONS = ["london", "england", "wales", "scotland", "northern_ireland"]
# The 12 UK regions, for breakdowns (the engine only needs the five above). FRS spellings.
REGIONS12 = ["North East", "North West", "Yorkshire and The Humber", "East Midlands", "West Midlands", "East", "London", "South East",
             "South West", "Wales", "Scotland", "Northern Ireland"]
HEALTH = ["none", "lcwra", "lcwra_protected"]
DISABILITY = ["none", "lower", "higher"]

# Published figures the page compares its live totals with (from data/check_population.py's table).
CHECKS = ["Income tax", "Income tax liabilities", "Employee NICs", "Employer NICs", "Self-employed NICs", "Child Benefit",
          "Child Benefit charge", "Universal Credit spending", "Households on Universal Credit", "Families paid Child Benefit"]


TENURES = ["Owned outright", "Buying with a mortgage", "Private rented", "Social rented"]
BANDS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"]


def home(h: dict) -> list:
    """A home as [tenure, value, land, value at the valuation date, band], money in £ thousands (data/build_homes.py)."""
    k = lambda x: round(x / 1000)
    return [TENURES.index(h["tenure"]), k(h["value"]), k(h["land"]), k(h["valuation"]), BANDS.index(h["band"]) if h["band"] else -1]


def main() -> None:
    pop = json.loads((HERE / "build" / "population.json").read_text(encoding="utf-8"))
    homes = json.loads((HERE / "build" / "homes.json").read_text(encoding="utf-8"))
    units = []
    for u in pop["units"]:
        d = u["data"]
        flags = ((1 if d.get("claimsUniversalCredit", True) else 0) | (2 if d.get("claimsChildBenefit", True) else 0)
                 | (4 if d.get("claimsMarriageAllowance", True) else 0) | (8 if u.get("outside") else 0))
        units.append([
            round(u["weight"], 1), u["household"], REGIONS.index(d["region"]),
            round(d["rentMonthly"]), round(d["childcareMonthly"]), round(d["savings"]), flags,
            [[a["age"], round(a["employment"]), round(a.get("secondJob", 0)), round(a["selfEmployment"]), round(a["pension"]),
              HEALTH.index(a["health"]), int(a["carer"]),
              round(a.get("propertyIncome", 0)), round(a.get("savingsInterest", 0)), round(a.get("dividends", 0)),
              round(a.get("pensionContributions", 0)), round(a.get("otherDeductions", 0)), round(a.get("taxReductions", 0))] for a in d["adults"]],
            [[c["age"], int(c["bornBefore2017"]), DISABILITY.index(c["disability"])] for c in d["children"]],
            REGIONS12.index(u["regionDetail"]),
        ])
        h = homes["homes"].get(str(u["household"]))
        if h and u["unit"] == 0:  # the home goes with the household's first family
            units[-1].append(home(h))
    check = pd.read_csv(HERE / "build" / "seed_results_check.csv").set_index("measure")
    payload = {
        "about": "Synthetic population: made-up households, not real people, weighted to match published UK totals for 2026-27. See POPULATION.md.",
        "year": "2026-27",
        "fields": {
            "unit": ["weight", "household", "region", "rentMonthly", "childcareMonthly", "savings", "flags (1 claims UC, 2 claims Child Benefit, 4 claims Marriage Allowance, 8 outside private households)", "adults", "children", "regionDetail (one of 12, for breakdowns)", "home (first family of each private household only)"],
            "adult": ["age", "employment", "secondJob", "selfEmployment", "pension", "health", "carer", "propertyIncome", "savingsInterest", "dividends", "pensionContributions", "otherDeductions", "taxReductions"],
            "child": ["age", "bornBefore2017", "disability"],
            "home": ["tenure", f"value (£ thousand, {homes['price_date']} prices)", "land (£ thousand)", "value at the council tax valuation date (£ thousand; Northern Ireland: 1 January 2005 capital value)", "council tax band (-1 in Northern Ireland)"],
        },
        "codes": {"region": REGIONS, "regionDetail": REGIONS12, "health": HEALTH, "disability": DISABILITY, "tenure": TENURES, "band": BANDS},
        "homes": {"about": "Synthetic, grade C: see POPULATION.md, Homes.", "price_date": homes["price_date"], "assumptions": homes["assumptions"]},
        "published": {m: {"value": float(check.at[m, "published"]), "unit": check.at[m, "unit"], "source": check.at[m, "source"]} for m in CHECKS},
        "units": units,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"{len(units):,} units -> {OUT.relative_to(HERE.parent)} ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
