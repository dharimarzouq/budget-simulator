"""A small client for DWP's Stat-Xplore API (https://stat-xplore.dwp.gov.uk/webapi/rest/v1/).

The API key is read from the STATXPLORE_API_KEY environment variable, or from data/statxplore.key
(git-ignored). The key is personal to the account holder: never print it, log it or commit it.
"""

import gzip
import itertools
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

import pandas as pd

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


def values(valueset: str) -> list[dict]:
    """The values in a valueset. Note the schema endpoint lists at most 100; use field_items for longer ones."""
    return call(f"schema/{valueset}")["children"]


def field_items(database: str, count: str, field: str) -> list[tuple[str, str]]:
    """(label, uri) for every value of a field, found by asking for a one-way table (no 100-item limit)."""
    r = call("table", {"database": database, "measures": [count], "dimensions": [[field]]})
    return [(i["labels"][0], i["uris"][0]) for i in r["fields"][0]["items"]]


def cube(database: str, measures: dict[str, str], fields: list[str], recodes: dict | None = None) -> pd.DataFrame:
    """A cross-table as one row per cell. measures maps our column name to the Stat-Xplore measure URI."""
    r = call("table", {"database": database, "measures": list(measures.values()), "dimensions": [[f] for f in fields], "recodes": recodes or {}})
    labels = [f["label"] for f in r["fields"]]
    axes = [[i["labels"][0] for i in f["items"]] for f in r["fields"]]
    by_uri = {uri: name for name, uri in measures.items()}
    rows: dict[tuple, dict] = {}
    for uri, c in r["cubes"].items():
        for idx in itertools.product(*[range(len(a)) for a in axes]):
            v = c["values"]
            for i in idx:
                v = v[i]
            key = tuple(axes[k][i] for k, i in enumerate(idx))
            rows.setdefault(key, dict(zip(labels, key)))[by_uri[uri]] = v
    return pd.DataFrame(list(rows.values()))


def only(field: str, *value_uris: str) -> dict:
    """A recode that keeps just these values of a field, with no total."""
    return {field: {"map": [[v] for v in value_uris], "total": False}}
