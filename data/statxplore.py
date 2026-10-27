"""A small client for DWP's Stat-Xplore API (https://stat-xplore.dwp.gov.uk/webapi/rest/v1/).

The API key is read from the STATXPLORE_API_KEY environment variable, or from data/statxplore.key
(git-ignored). The key is personal to the account holder: never print it, log it or commit it.
"""

import gzip
import json
import os
import urllib.request
from pathlib import Path

BASE = "https://stat-xplore.dwp.gov.uk/webapi/rest/v1"
KEY_FILE = Path(__file__).resolve().parent / "statxplore.key"


def api_key() -> str:
    key = os.environ.get("STATXPLORE_API_KEY") or (KEY_FILE.read_text(encoding="utf-8").strip() if KEY_FILE.exists() else "")
    if not key:
        raise SystemExit("No Stat-Xplore key: set STATXPLORE_API_KEY or create data/statxplore.key")
    return key


def call(path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(
        f"{BASE}/{path.lstrip('/')}",
        data=json.dumps(body).encode() if body is not None else None,
        headers={"APIKey": api_key(), "Content-Type": "application/json", "Accept": "application/json"},
        method="POST" if body is not None else "GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read()
        if body[:2] == b"\x1f\x8b":  # error bodies come back gzipped
            body = gzip.decompress(body)
        raise SystemExit(f"Stat-Xplore {e.code} on {path}: {body.decode(errors='replace')[:500]}") from None


def table(database: str, measures: list[str], dimensions: list[list[str]], recodes: dict | None = None) -> dict:
    return call("table", {"database": database, "measures": measures, "dimensions": dimensions, "recodes": recodes or {}})
