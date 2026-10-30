"""Download the published tables the synthetic population is built from, into data/raw/.

Usage: .venv/Scripts/python.exe -I data/fetch.py

Each file's SHA-256 is recorded in data/raw-files.json the first time it's downloaded. A later
download that doesn't match is reported, so a silently revised table can't slip in unnoticed.
"""

import hashlib
import json
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"

FILES = {
    "hmrc_spi_2324_tables_3_1_to_3_11.ods": "https://assets.publishing.service.gov.uk/media/69f1f12d2fae53a03709682f/Collated_Tables_3_1_to_3_11_2324.ods",
    "hmrc_tax_relief_statistics_2026_01.ods": "https://assets.publishing.service.gov.uk/media/69a0194e3e672177d0bc76e6/tax_relief_statistics_january_2026.ods",
    "hmrc_ready_reckoner_2025_06.ods": "https://assets.publishing.service.gov.uk/media/68552862b46781eacfd71d71/June_2025_TRR_ODS__1_.ods",
    "hmrc_income_tax_liabilities_2026_07.ods": "https://assets.publishing.service.gov.uk/media/6a5a49b47eb057103bd946a4/Collated_Income_Tax_liabilities_statistics_tables_-_2.1_to_2.6.ods",
    "hmrc_child_benefit_aug_2025_main_tables.ods": "https://assets.publishing.service.gov.uk/media/6a8d696901bbff0bf8f97903/Child_Benefit_August_2025_Main_Tables.ods",
    "hmrc_scottish_income_tax_outturn_2024_25.ods": "https://assets.publishing.service.gov.uk/media/6a981bd5f5b35599aec190b6/Scottish_Income_Tax_Outturn_Statistics_2024-2025.ods",
    # The borrowing and debt baseline (forecasts/obr-2026-10.yaml is read off these by hand; see its table references).
    "obr_efo_2026_10.pdf": "https://obr.uk/download/economic-and-fiscal-outlook-october-2026/",
    "obr_efo_2026_10_tables.zip": "https://obr.uk/download/october-2026-economic-and-fiscal-outlook-detailed-forecast-tables-zip-file/",
    "obr_fer_2026_06.html": "https://www.gov.uk/government/publications/forecast-evaluation-report-june-2026/forecast-evaluation-report-june-2026",
    "obr_working_paper_3.pdf": "https://obr.uk/download/working-paper-no-3-cyclically-adjusting-the-public-finances/",
    # History for the impact charts (data/build_history.py writes forecasts/history-2026-10.yaml from these).
    "obr_public_finances_databank_2026_10.xlsx": "https://obr.uk/download/public-finances-databank-october-2026-efo/",
    "ons_abmi_gdp_cvm.csv": "https://www.ons.gov.uk/generator?format=csv&uri=/economy/grossdomesticproductgdp/timeseries/abmi/qna",
    # Barnett formula factors (forecasts/departments-2026-10.yaml is read off Annexes A and B by hand).
    "hmt_statement_of_funding_policy_2025_06.pdf": "https://assets.publishing.service.gov.uk/media/684859e3d0ca5d7801e4e6f6/Statement_of_Funding_Policy.pdf",
    # Who pays VAT and duties, by income tenth (costings/ons-etb-2023-24.yaml is read off Table 2b by hand).
    "ons_etb_fye2024.xlsx": "https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/personalandhouseholdfinances/incomeandwealth/datasets/theeffectsoftaxesandbenefitsonhouseholdincomefinancialyearending2014/financialyearending2024/etbreferencetablesfye202324final.xlsx",
    # Homes: values, floor areas, council tax bands (data/build_homes.py).
    "mhclg_mvs_2024_ch1.ods": "https://assets.publishing.service.gov.uk/media/69d6752d69de22b2bf86f663/Chapter_1_MVS_-_Annex_Tables.ods",
    "mhclg_mvs_2024_ch3.ods": "https://assets.publishing.service.gov.uk/media/69d6752169de22b2bf86f662/Chapter_3_MVS_-_Annex_Tables.ods",
    "mhclg_mvs_2024_ch4.ods": "https://assets.publishing.service.gov.uk/media/69d675373cf9187b7a07ba2d/Chapter_4_MVS_-_Annex_Tables.ods",
    "voa_ctsop_2025_summary.xlsx": "https://assets.publishing.service.gov.uk/media/6a0c5ee5c510c3913d826863/2025_CT_SoP_Summary_Tables.xlsx",
    "hmlr_ukhpi_average_prices_2026_08.csv": "https://publicdata.landregistry.gov.uk/market-trend-data/house-price-index-data/Average-prices-2026-08.csv",
    "sg_ctaxbase_2025_chargeable_dwellings.xlsx": "https://www.gov.scot/binaries/content/documents/govscot/publications/statistics/2019/04/council-tax-datasets/documents/number-of-chargeable-dwellings/chargeable-dwellings---september-2025-data/chargeable-dwellings---september-2025-data/govscot%3Adocument/CTAXBASE%2B2025%2B-%2BTables%2B-%2BChargeable%2BDwellings.xlsx",
    "ons_nbs_2025_reference_tables.xlsx": "https://www.ons.gov.uk/file?uri=/economy/nationalaccounts/uksectoraccounts/datasets/thenationalbalancesheetestimates/current/nbsreferencetables2025.xlsx",
    "mhclg_ehs_2019_20_headline_report.pdf": "https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/945013/2019-20_EHS_Headline_Report.pdf",
    "ons_ashe_table6_2026_provisional.zip":"https://www.ons.gov.uk/file?uri=/employmentandlabourmarket/peopleinwork/earningsandworkinghours/datasets/agegroupashetable6/2026provisional/ashetable62026provisional.zip",
}


def main() -> None:
    RAW.mkdir(exist_ok=True)
    record_path = HERE / "raw-files.json"
    record = json.loads(record_path.read_text(encoding="utf-8")) if record_path.exists() else {}
    for name, url in FILES.items():
        path = RAW / name
        if not path.exists():
            print(f"downloading {name}")
            req = urllib.request.Request(url, headers={"User-Agent": "budget-simulator data build"})
            with urllib.request.urlopen(req, timeout=120) as r:
                path.write_bytes(r.read())
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        known = record.get(name, {}).get("sha256")
        if known and known != digest:
            print(f"WARNING: {name} differs from the recorded version ({known[:12]} vs {digest[:12]}). Check what changed.")
        record[name] = {"url": url, "sha256": known or digest}
    record_path.write_text(json.dumps(record, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
