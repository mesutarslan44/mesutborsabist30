# -*- coding: utf-8 -*-
"""Validate generated JSON data against schemas."""

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "site" / "data"
SCHEMA_DIR = Path(__file__).resolve().parent / "schemas"
NEWLINE = chr(10)

CHECKS = [
    ("summary.json", "summary.schema.json"),
    ("market_overview.json", "market_overview.schema.json"),
    ("performance.json", "performance.schema.json"),
]


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def validate_file(data_name: str, schema_name: str):
    data_path = DATA_DIR / data_name
    schema_path = SCHEMA_DIR / schema_name

    if not data_path.exists():
        raise FileNotFoundError(f"Missing data file: {data_path}")
    if not schema_path.exists():
        raise FileNotFoundError(f"Missing schema file: {schema_path}")

    data = load_json(data_path)
    schema = load_json(schema_path)

    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(data), key=lambda e: e.path)
    if errors:
        msg_lines = [f"Schema validation failed for {data_name}:"]
        for err in errors[:20]:
            loc = ".".join([str(part) for part in err.path]) or "<root>"
            msg_lines.append(f"  - {loc}: {err.message}")
        raise ValueError(NEWLINE.join(msg_lines))

    print(f"[ok] {data_name} validated")


def main():
    failures = []
    for data_name, schema_name in CHECKS:
        try:
            validate_file(data_name, schema_name)
        except Exception as exc:
            failures.append(str(exc))

    if failures:
        print(NEWLINE.join(failures))
        sys.exit(1)

    print("All schema checks passed.")


if __name__ == "__main__":
    main()
