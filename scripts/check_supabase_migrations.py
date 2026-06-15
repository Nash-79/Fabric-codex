#!/usr/bin/env python3
"""Lightweight static checks for Supabase migration files."""
from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"
NAME_RE = re.compile(r"^\d{14}_[a-z0-9][a-z0-9_-]*\.sql$")
FORBIDDEN = (
    "supabase migration repair",
    " migration repair ",
)


def main() -> int:
    failures: list[str] = []
    files = sorted(MIGRATIONS.glob("*.sql"))

    if not files:
        failures.append("No Supabase migration files found.")

    seen_timestamps: set[str] = set()
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        if not NAME_RE.match(path.name):
            failures.append(
                f"{rel}: filename must match YYYYMMDDHHMMSS_description.sql"
            )

        timestamp = path.name[:14]
        if timestamp in seen_timestamps:
            failures.append(f"{rel}: duplicate migration timestamp {timestamp}")
        seen_timestamps.add(timestamp)

        try:
            sql = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            failures.append(f"{rel}: file must be UTF-8")
            continue

        if not sql.strip():
            failures.append(f"{rel}: migration is empty")
        if "\x00" in sql:
            failures.append(f"{rel}: file contains a NUL byte")

        lowered = f" {sql.lower()} "
        for phrase in FORBIDDEN:
            if phrase in lowered:
                failures.append(
                    f"{rel}: do not run or document migration repair in migrations"
                )

    if failures:
        print("Supabase migration check failed:")
        for failure in failures:
            print(f"  - {failure}")
        return 1

    print(f"Supabase migration check passed ({len(files)} file(s)).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
