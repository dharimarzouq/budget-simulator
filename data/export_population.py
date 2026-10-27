"""Step 5e: write the calibrated population as a compact file the page loads.

Usage: .venv/Scripts/python.exe -I data/export_population.py
Reads data/build/population.json and data/build/seed_results_check.csv.
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
HEALTH = ["none", "lcwra", "lcwra_protected"]
DISABILITY = ["none", "lower", "higher"]

# Published figures the page compares its live totals with (from data/check_population.py's table).
CHECKS = ["Income tax", "Employee NICs", "Employer NICs", "Self-employed NICs", "Child Benefit",
          "Child Benefit charge", "Universal Credit spending", "Households on Universal Credit", "Families paid Child Benefit"]


def main() -> None:
    pop = json.loads((HERE / "build" / "population.json").read_text(encoding="utf-8"))
    units = []
    for u in pop["units"]:
        d = u["data"]
        flags = (1 if d.get("claimsUniversalCredit", True) else 0) | (2 if d.get("claimsChildBenefit", True) else 0)
        units.append([
            round(u["weight"], 1), u["household"], REGIONS.index(d["region"]),
            round(d["rentMonthly"]), round(d["childcareMonthly"]), round(d["savings"]), flags,
            [[a["age"], round(a["employment"]), round(a.get("secondJob", 0)), round(a["selfEmployment"]), round(a["pension"]),
              HEALTH.index(a["health"]), int(a["carer"])] for a in d["adults"]],
            [[c["age"], int(c["bornBefore2017"]), DISABILITY.index(c["disability"])] for c in d["children"]],
        ])
    check = pd.read_csv(HERE / "build" / "seed_results_check.csv").set_index("measure")
    payload = {
        "about": "Synthetic population: made-up households, not real people, weighted to match published UK totals for 2026-27. See POPULATION.md.",
        "year": "2026-27",
        "fields": {
            "unit": ["weight", "household", "region", "rentMonthly", "childcareMonthly", "savings", "flags (1 claims UC, 2 claims Child Benefit)", "adults", "children"],
            "adult": ["age", "employment", "secondJob", "selfEmployment", "pension", "health", "carer"],
            "child": ["age", "bornBefore2017", "disability"],
        },
        "codes": {"region": REGIONS, "health": HEALTH, "disability": DISABILITY},
        "published": {m: {"value": float(check.at[m, "published"]), "unit": check.at[m, "unit"], "source": check.at[m, "source"]} for m in CHECKS},
        "units": units,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"{len(units):,} units -> {OUT.relative_to(HERE.parent)} ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
