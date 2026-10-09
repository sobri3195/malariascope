"""Consistent SQLite backup with integrity check. Restore only while service is stopped."""

import argparse
import sqlite3
from pathlib import Path
from services.app import DB, connection

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("output", type=Path)
    a = p.parse_args()
    if a.output.exists() or a.output.resolve() == DB.resolve():
        raise SystemExit(
            "Choose a new backup path; existing files are not overwritten."
        )
    with connection() as source, sqlite3.connect(a.output) as target:
        source.backup(target)
        if target.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise SystemExit("Backup integrity check failed")
    print("Consistent database backup created and integrity checked.")
