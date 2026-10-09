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
            self.assertEqual(len(first["leaderboard"]), 4)
            for model in ["ridge-regression", "random-forest", "gradient-boosting"]:
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


if __name__ == "__main__":
    unittest.main()
