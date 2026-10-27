"""Pull tables from DWP Stat-Xplore into data/targets/: Universal Credit households (administrative
data) and Family Resources Survey households (the official household survey, weighted to the UK).

Usage: .venv/Scripts/python.exe -I data/pull_statxplore.py
Needs a Stat-Xplore API key (see data/statxplore.py). Data is Open Government Licence.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import statxplore as sx  # noqa: E402

OUT = Path(__file__).resolve().parent / "targets"

# Universal Credit households
UC_MONTH = "202605"  # May 2026, the latest month published at the time of writing
UC = "str:database:UC_Households"
UC_F = "str:field:UC_Households:V_F_UC_HOUSEHOLDS:"
UC_MEASURES = {
    "households": "str:count:UC_Households:V_F_UC_HOUSEHOLDS",
    "mean_award_gbp_month": "str:statfn:UC_Households:V_F_UC_HOUSEHOLDS:HNTOTAL_PAYMENT_AMOUNT:MEAN",  # only the mean is offered
}
UC_MONTH_FIELD = "str:field:UC_Households:F_UC_HH_DATE:DATE_NAME"

# Family Resources Survey households
FRS = "str:database:FRSHH"
FRS_F = "str:field:FRSHH:V_F_FRSHH:"
FRS_COUNT = "str:count:FRSHH:V_F_FRSHH"


def uc(fields: list[str], recodes: dict | None = None):
    month = f"str:value:UC_Households:F_UC_HH_DATE:DATE_NAME:C_UC_HH_DATE:{UC_MONTH}"
    df = sx.cube(UC, UC_MEASURES, [UC_MONTH_FIELD, *fields], {**sx.only(UC_MONTH_FIELD, month), **(recodes or {})})
    df["mean_award_gbp_month"] = df["mean_award_gbp_month"].round(2)
    return df.drop(columns=["Month"])


def frs(year_uri: str, fields: list[str], measures: dict[str, str] | None = None):
    df = sx.cube(FRS, {"households": FRS_COUNT, **(measures or {})}, [FRS_F + "YEAR", *fields], sx.only(FRS_F + "YEAR", year_uri))
    return df.drop(columns=["Financial Year"])


def main() -> None:
    OUT.mkdir(exist_ok=True)

    regions = [v["id"] for v in sx.values("str:valueset:UC_Households:V_F_UC_HOUSEHOLDS:COA_CODE:V_C_MASTERGEOG21_REGION_TO_COUNTRY")]
    # The tenure field defaults to "has a housing entitlement, yes/no"; this valueset gives the tenure itself.
    tenures = [v["id"] for v in sx.values("str:valueset:UC_Households:V_F_UC_HOUSEHOLDS:TENURE:C_UC_HOUSING_TENURE")]
    tables = {
        "uc_households_region_family_2026_05.csv": uc([UC_F + "COA_CODE", UC_F + "hnfamily_type"],
                                                      {UC_F + "COA_CODE": {"map": [[r] for r in regions], "total": True}}),
        "uc_households_family_children_2026_05.csv": uc([UC_F + "hnfamily_type", UC_F + "NUMBER_OF_CHILDREN"]),
        "uc_households_family_tenure_2026_05.csv": uc([UC_F + "hnfamily_type", UC_F + "TENURE"], sx.only(UC_F + "TENURE", *tenures)),
        "uc_households_family_health_carer_2026_05.csv": uc([UC_F + "hnfamily_type", UC_F + "HCLCW_ENTITLEMENT", UC_F + "HCCARER_ENTITLEMENT"]),
        "uc_households_disabled_child_2026_05.csv": uc([UC_F + "hnfamily_type", UC_F + "HCDISABLED_CHILD_ENTITLEMENT"]),
    }

    years = sx.field_items(FRS, FRS_COUNT, FRS_F + "YEAR")
    year_label, year_uri = years[-1]
    tag = year_label.replace("/", "_").replace(" ", "")
    print(f"FRS latest year: {year_label}")
    rent = {"mean_rent_mortgage_gbp_week": "str:statfn:FRSHH:V_F_FRSHH:HH_MORTRENT_INYR:MEAN"}
    tables |= {
        f"frs_households_region_composition_tenure_{tag}.csv": frs(year_uri, [FRS_F + "REGION", FRS_F + "COMPOS_KID", FRS_F + "TENURE"]),
        f"frs_households_income_composition_{tag}.csv": frs(year_uri, [FRS_F + "INC_BAND200_INYR", FRS_F + "COMPOS_KID"]),
        f"frs_households_income_detailed_composition_{tag}.csv": frs(year_uri, [FRS_F + "INC_BAND200_INYR", FRS_F + "COMPOS"]),
        f"frs_households_pensioners_composition_{tag}.csv": frs(year_uri, [FRS_F + "PEN", FRS_F + "COMPOS_KID"]),
        f"frs_households_rent_region_tenure_{tag}.csv": frs(year_uri, [FRS_F + "REGION", FRS_F + "TENURE"], rent),
        f"frs_households_savings_composition_{tag}.csv": frs(year_uri, [FRS_F + "savings_band_inyr_new", FRS_F + "COMPOS_KID"]),
        f"frs_households_benefits_{tag}.csv": frs(year_uri, [FRS_F + "REC_CHB", FRS_F + "REC_UC", FRS_F + "REC_RP"]),
    }
    # FRS adults: how many adults there are, by age and employment status.
    ad = "str:database:FRSAD"
    ad_f = "str:field:FRSAD:V_F_FRSAD:"
    ad_year = dict(sx.field_items(ad, "str:count:FRSAD:V_F_FRSAD", ad_f + "YEAR"))[year_label]
    adults = sx.cube(ad, {"adults": "str:count:FRSAD:V_F_FRSAD"}, [ad_f + "YEAR", ad_f + "AGEBAND", ad_f + "EMPSTAT"], sx.only(ad_f + "YEAR", ad_year))
    tables[f"frs_adults_age_employment_{tag}.csv"] = adults.drop(columns=["Financial Year"]).rename(columns={"adults": "households"})

    for name, df in tables.items():
        df.to_csv(OUT / name, index=False)
        print(f"{name}: {len(df)} rows, {df['households'].sum():,.0f} households (sum of cells)")


if __name__ == "__main__":
    main()
