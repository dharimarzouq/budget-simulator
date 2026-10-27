"""Pull Universal Credit tables from DWP Stat-Xplore into data/targets/.

Usage: .venv/Scripts/python.exe -I data/pull_statxplore.py
Needs a Stat-Xplore API key (see data/statxplore.py). Data is Open Government Licence.
"""

import itertools
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import statxplore as sx  # noqa: E402

OUT = Path(__file__).resolve().parent / "targets"
MONTH = "202605"  # May 2026, the latest month published at the time of writing

DB = "str:database:UC_Households"
COUNT = "str:count:UC_Households:V_F_UC_HOUSEHOLDS"
PAYMENT = "str:statfn:UC_Households:V_F_UC_HOUSEHOLDS:HNTOTAL_PAYMENT_AMOUNT:MEAN"  # only the mean is offered
F = "str:field:UC_Households:V_F_UC_HOUSEHOLDS:"
MONTH_FIELD = "str:field:UC_Households:F_UC_HH_DATE:DATE_NAME"
MONTH_VALUE = f"str:value:UC_Households:F_UC_HH_DATE:DATE_NAME:C_UC_HH_DATE:{MONTH}"
REGION_VALUESET = "str:valueset:UC_Households:V_F_UC_HOUSEHOLDS:COA_CODE:V_C_MASTERGEOG21_REGION_TO_COUNTRY"


def tidy(result: dict) -> pd.DataFrame:
    """Stat-Xplore's cube response as one row per cell."""
    fields = result["fields"]
    labels = [f["label"] for f in fields]
    axes = [[i["labels"][0] for i in f["items"]] for f in fields]
    rows = []
    for measure_uri, cube in result["cubes"].items():
        name = "households" if measure_uri == COUNT else "mean_award_gbp_month"
        values = cube["values"]
        for idx in itertools.product(*[range(len(a)) for a in axes]):
            v = values
            for i in idx:
                v = v[i]
            rows.append({**{labels[k]: axes[k][i] for k, i in enumerate(idx)}, "measure": name, "value": v})
    df = pd.DataFrame(rows)
    return df.pivot_table(index=labels, columns="measure", values="value", aggfunc="first").reset_index()


def pull(fields: list[str], recodes: dict | None = None) -> pd.DataFrame:
    recodes = {MONTH_FIELD: {"map": [[MONTH_VALUE]], "total": False}, **(recodes or {})}
    result = sx.table(DB, [COUNT, PAYMENT], [[MONTH_FIELD], *[[f] for f in fields]], recodes)
    df = tidy(result).drop(columns=["Month"])
    df["mean_award_gbp_month"] = df["mean_award_gbp_month"].round(2)
    return df


def main() -> None:
    OUT.mkdir(exist_ok=True)
    regions = [v["id"] for v in sx.call(f"schema/{REGION_VALUESET}")["children"]]
    region_recode = {F + "COA_CODE": {"map": [[r] for r in regions], "total": True}}
    # The tenure field defaults to "has a housing entitlement, yes/no"; this valueset gives the tenure itself.
    tenures = [v["id"] for v in sx.call("schema/str:valueset:UC_Households:V_F_UC_HOUSEHOLDS:TENURE:C_UC_HOUSING_TENURE")["children"]]
    tenure_recode = {F + "TENURE": {"map": [[t] for t in tenures], "total": False}}

    tables = {
        "uc_households_region_family_2026_05.csv": pull([F + "COA_CODE", F + "hnfamily_type"], region_recode),
        "uc_households_family_children_2026_05.csv": pull([F + "hnfamily_type", F + "NUMBER_OF_CHILDREN"]),
        "uc_households_family_tenure_2026_05.csv": pull([F + "hnfamily_type", F + "TENURE"], tenure_recode),
        "uc_households_family_health_carer_2026_05.csv": pull([F + "hnfamily_type", F + "HCLCW_ENTITLEMENT", F + "HCCARER_ENTITLEMENT"]),
        "uc_households_disabled_child_2026_05.csv": pull([F + "hnfamily_type", F + "HCDISABLED_CHILD_ENTITLEMENT"]),
    }
    for name, df in tables.items():
        df.to_csv(OUT / name, index=False)
        total = df["households"].sum() if "Total" not in df.iloc[:, 0].astype(str).values else None
        print(f"{name}: {len(df)} rows" + (f", {total:,.0f} households" if total else ""))


if __name__ == "__main__":
    main()
