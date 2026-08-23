#!/usr/bin/env python3
"""Fail when the Supabase schema changes without the data-model documentation.

This enforces the project rule in AGENTS.md/CLAUDE.md: when supabase/migrations/*.sql changes,
docs/data-model.md must change in the same PR. (Previously watched the retired
backend/app/models.py — docs/data-model.md itself now states that file is no longer the source
of truth; the live schema lives in supabase/migrations/.)
"""
from __future__ import annotations

import argparse
import subprocess
import sys


MODEL_PATH_PREFIX = "supabase/migrations/"
DOC_PATH = "docs/data-model.md"


def git_diff(base_ref: str, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "diff", *args, f"{base_ref}...HEAD"],
        capture_output=True,
        text=True,
        check=False,
    )


def diff_ref(base_ref: str) -> str:
    candidates = [base_ref, "HEAD~1"]
    last_error = ""
    for candidate in candidates:
        proc = git_diff(candidate, "--name-only")
        if proc.returncode == 0:
            return candidate
        last_error = proc.stderr.strip()
    raise RuntimeError(last_error or "Unable to determine changed files")


def changed_files(base_ref: str) -> set[str]:
    proc = git_diff(base_ref, "--name-only")
    return {
        line.strip().replace("\\", "/")
        for line in proc.stdout.splitlines()
        if line.strip()
    }


def has_non_whitespace_diff(base_ref: str, path: str) -> bool:
    proc = subprocess.run(
        [
            "git",
            "diff",
            "--ignore-all-space",
            "--ignore-blank-lines",
            "--exit-code",
            f"{base_ref}...HEAD",
            "--",
            path,
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    return proc.returncode == 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-ref", default="origin/main")
    args = parser.parse_args()

    try:
        base_ref = diff_ref(args.base_ref)
        files = changed_files(base_ref)
    except RuntimeError as exc:
        print(f"Could not inspect git diff: {exc}", file=sys.stderr)
        return 2

    changed_migrations = sorted(
        f
        for f in files
        if f.startswith(MODEL_PATH_PREFIX)
        and f.endswith(".sql")
        and has_non_whitespace_diff(base_ref, f)
    )

    if changed_migrations and DOC_PATH not in files:
        migrations_list = ", ".join(changed_migrations)
        print(
            f"Migration(s) changed without {DOC_PATH}: {migrations_list}. "
            "Update the data model documentation in the same change."
        )
        return 1

    print("Model/docs sync check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
