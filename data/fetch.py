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
    "obr_efo_2026_03_receipts.xlsx": "https://obr.uk/download/march-2026-economic-and-fiscal-outlook-detailed-forecast-tables-receipts/",
    "obr_efo_2026_03_expenditure.xlsx": "https://obr.uk/download/march-2026-economic-and-fiscal-outlook-detailed-forecast-tables-expenditure/",
    "obr_efo_2026_03_economy.xlsx": "https://obr.uk/download/march-2026-economic-and-fiscal-outlook-detailed-forecast-tables-economy/",
    "hmrc_tax_relief_statistics_2026_01.ods": "https://assets.publishing.service.gov.uk/media/69a0194e3e672177d0bc76e6/tax_relief_statistics_january_2026.ods",
    "hmrc_ready_reckoner_2025_06.ods": "https://assets.publishing.service.gov.uk/media/68552862b46781eacfd71d71/June_2025_TRR_ODS__1_.ods",
    "hmrc_income_tax_liabilities_2026_07.ods": "https://assets.publishing.service.gov.uk/media/6a5a49b47eb057103bd946a4/Collated_Income_Tax_liabilities_statistics_tables_-_2.1_to_2.6.ods",
    "hmrc_child_benefit_aug_2025_main_tables.ods": "https://assets.publishing.service.gov.uk/media/6a8d696901bbff0bf8f97903/Child_Benefit_August_2025_Main_Tables.ods",
    "ons_ashe_table6_2026_provisional.zip": "https://www.ons.gov.uk/file?uri=/employmentandlabourmarket/peopleinwork/earningsandworkinghours/datasets/agegroupashetable6/2026provisional/ashetable62026provisional.zip",
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
