import csv
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from research.train import run


class PipelineTest(unittest.TestCase):
    def test_temporal_leakage_reproducibility_and_portable_parity(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            data = folder / "fixture.csv"
            rows = [
                dict(
                    district=f"Fixture {d}",
                    year=y,
                    cases=50 + d * 20 + (y - 2018) * 13 + (y % 3) * d,
                    rainfall=1000 + d * 30 + y % 5 * 10,
                    temperature=25 + d * 0.2,
                    humidity=70 + d,
                )
                for d in range(5)
                for y in range(2018, 2026)
            ]

            def write():
                with data.open("w") as f:
                    w = csv.DictWriter(f, fieldnames=rows[0].keys())
                    w.writeheader()
                    w.writerows(rows)

            write()
            first = run(
                data,
                folder / "first",
                2025,
                2025,
                "SYNTHETIC",
                "Test fixture",
                "Test only",
            )
            second = run(
                data,
                folder / "second",
                2025,
                2025,
                "SYNTHETIC",
                "Test fixture",
                "Test only",
            )
            self.assertEqual(first, second)
            self.assertEqual(len(first["leaderboard"]), 5)
            for model in [
                "ridge-regression",
                "ridge-no-climate",
                "random-forest",
                "gradient-boosting",
            ]:
                artifact = folder / "first" / (model + ".json")
                a = json.loads(artifact.read_text())
                previous = next(
                    r
                    for r in rows
                    if r["district"] == "Fixture 0" and r["year"] == 2024
                )
                inputs = dict(
                    cases_lag1=previous["cases"],
                    rainfall_lag1=previous["rainfall"],
                    temperature_lag1=previous["temperature"],
                    humidity_lag1=previous["humidity"],
                )
                program = "import {readFileSync} from 'node:fs';import {predictPortable} from './src/portable-model.ts';const a=JSON.parse(readFileSync(process.argv[1],'utf8'));console.log(predictPortable(a,JSON.parse(process.argv[2])).prediction);"
                p = subprocess.run(
                    [
                        "node",
                        "--experimental-strip-types",
                        "--input-type=module",
                        "-e",
                        program,
                        str(artifact),
                        json.dumps(inputs),
                    ],
                    check=True,
                    capture_output=True,
                    text=True,
                )
                expected = next(
                    r["prediction"]
                    for r in first["predictions"]
                    if r["model"] == a["model"] and r["district"] == "Fixture 0"
                )
                self.assertAlmostEqual(float(p.stdout), expected, places=6)
            # Target-year climate and outcomes must not affect the fitted model.
            for r in rows:
                if r["year"] == 2025:
                    r.update(rainfall=999999, cases=r["cases"] + 1000)
            write()
            run(
                data,
                folder / "changed",
                2025,
                2025,
                "SYNTHETIC",
                "Test fixture",
                "Test only",
            )
            a = json.loads((folder / "first" / "ridge-regression.json").read_text())
            b = json.loads((folder / "changed" / "ridge-regression.json").read_text())
            self.assertEqual(a["coefficients"], b["coefficients"])
            self.assertEqual(a["mean"], b["mean"])


class AuditedProtocolTest(unittest.TestCase):
    def test_holdout_and_future_rows_do_not_select_or_change_fitted_models(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            data = folder / "panel.csv"
            rows = [
                dict(
                    district=f"Fixture {d}",
                    year=y,
                    cases=100 + d * 20 + (y - 2018) * 11 + (d * y) % 7,
                    rainfall=1000 + d * 40 + (y % 4) * 30,
                    temperature=24 + d * 0.3,
                    humidity=65 + d,
                )
                for d in range(4)
                for y in range(2018, 2027)
            ]

            def write():
                with data.open("w", newline="") as f:
                    w = csv.DictWriter(f, fieldnames=rows[0].keys())
                    w.writeheader()
                    w.writerows(rows)

            write()
            first = run(
                data,
                folder / "first",
                2025,
                19,
                "SYNTHETIC",
                "Fixture",
                "Test only",
                tune=True,
            )
            self.assertTrue(all(f["testYear"] < 2025 for f in first["rollingOrigin"]))
            self.assertEqual(len(first["ignoredFuture"]), 4)
            self.assertEqual(
                first["selection"]["Random Forest"]["status"],
                "PRE-HOLDOUT TEMPORAL SELECTION",
            )
            self.assertTrue(
                all(y < 2025 for s in first["selection"].values() for y in s["folds"])
            )
            for r in rows:
                if r["year"] >= 2025:
                    r.update(
                        cases=r["cases"] + 10000,
                        rainfall=999999,
                        temperature=90,
                        humidity=99,
                    )
            write()
            changed = run(
                data,
                folder / "changed",
                2025,
                19,
                "SYNTHETIC",
                "Fixture",
                "Test only",
                tune=True,
            )
            self.assertEqual(first["selection"], changed["selection"])
            self.assertEqual(first["trainingHash"], changed["trainingHash"])
            self.assertEqual(first["rollingOrigin"], changed["rollingOrigin"])
            self.assertEqual(
                [p["prediction"] for p in first["predictions"]],
                [p["prediction"] for p in changed["predictions"]],
            )
            for filename in [
                "ridge-regression",
                "ridge-no-climate",
                "random-forest",
                "gradient-boosting",
            ]:
                a = json.loads((folder / "first" / (filename + ".json")).read_text())
                b = json.loads((folder / "changed" / (filename + ".json")).read_text())
                self.assertEqual(a["version"], b["version"])
            # The same training data with a different configuration must not reuse a fit identity.
            different = run(
                data,
                folder / "different",
                2025,
                20,
                "SYNTHETIC",
                "Fixture",
                "Test only",
            )
            a = json.loads((folder / "first" / "ridge-no-climate.json").read_text())
            b = json.loads((folder / "different" / "ridge-no-climate.json").read_text())
            self.assertNotEqual(a["version"], b["version"])
            self.assertEqual(len(a["features"]), 1)
            self.assertEqual(len(different["leaderboard"]), 5)
            with self.assertRaisesRegex(ValueError, "not overwritten"):
                run(
                    data,
                    folder / "first",
                    2025,
                    19,
                    "SYNTHETIC",
                    "Fixture",
                    "Test only",
                )
            # Validate the actual emitted report using the browser's shared contract.
            program = "import {readFileSync} from 'node:fs';import {validateTrainingRun} from './src/training-run.ts';validateTrainingRun(JSON.parse(readFileSync(process.argv[1],'utf8')));"
            subprocess.run(
                [
                    "node",
                    "--experimental-strip-types",
                    "--input-type=module",
                    "-e",
                    program,
                    str(folder / "first" / "run.json"),
                ],
                check=True,
                capture_output=True,
            )

    def test_csv_schema_and_canonical_duplicate_identity(self):
        from research.train import load

        with tempfile.TemporaryDirectory() as directory:
            data = Path(directory) / "bad.csv"
            for text, message in [
                ("district,year,cases\nA,2025,10\n", "headers"),
                (
                    "district,year,cases,rainfall,temperature,humidity\n,2025,10,100,25,70\n",
                    "district",
                ),
                (
                    "district,year,cases,rainfall,temperature,humidity\n A ,2025,10,100,25,70\na,2025,12,100,25,70\n",
                    "Duplicate",
                ),
                (
                    "district,year,cases,rainfall,temperature,humidity\nA,2025,10,100,25,70,extra\n",
                    "Malformed",
                ),
            ]:
                data.write_text(text)
                with self.assertRaisesRegex(ValueError, message):
                    load(data)

    def test_temporal_tuning_falls_back_when_evidence_is_insufficient(self):
        from research.ml_protocol import select

        rows = [
            dict(district=f"D{i}", year=2020, y=10 + i, x=[10 + i, 100, 25, 70])
            for i in range(8)
        ]
        s = select(rows, "Random Forest", 1, True)
        self.assertIn("INSUFFICIENT", s["status"])
        self.assertEqual(s["candidates"], [])


class CaseOnlyTest(unittest.TestCase):
    def test_missing_climate_uses_separate_baseline_cohort_without_imputation(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            data = folder / "cases.csv"
            data.write_text(
                "district,year,cases\n"
                + "".join(
                    f"D{d},{y},{100+d*20+y%4*7}\n"
                    for d in range(3)
                    for y in range(2020, 2026)
                )
            )
            result = run(
                data,
                folder / "case-only",
                2025,
                19,
                "SYNTHETIC",
                "Fixture",
                "Test only",
                tune=True,
                cases_only=True,
            )
            self.assertEqual(result["cohortMode"], "CASES ONLY")
            self.assertEqual(
                {r["model"] for r in result["leaderboard"]},
                {"Persistence", "Ridge Regression — no climate"},
            )
            self.assertEqual(len(result["predictions"]), 6)
            artifact = json.loads(
                (folder / "case-only" / "ridge-no-climate.json").read_text()
            )
            self.assertEqual(len(artifact["features"]), 1)
            program = "import {readFileSync} from 'node:fs';import {validateTrainingRun} from './src/training-run.ts';validateTrainingRun(JSON.parse(readFileSync(process.argv[1],'utf8')));"
            subprocess.run(
                [
                    "node",
                    "--experimental-strip-types",
                    "--input-type=module",
                    "-e",
                    program,
                    str(folder / "case-only" / "run.json"),
                ],
                check=True,
                capture_output=True,
            )
            with self.assertRaisesRegex(ValueError, "headers"):
                run(
                    data,
                    folder / "bad-full",
                    2025,
                    19,
                    "SYNTHETIC",
                    "Fixture",
                    "Test only",
                )


if __name__ == "__main__":
    unittest.main()
