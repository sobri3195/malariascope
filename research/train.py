"""Reproducible annual hindcast pipeline. Never overwrites supplied study files."""

import argparse
import io
import platform
import unicodedata
import sklearn
import csv
import hashlib
import json
from pathlib import Path
import numpy as np
from sklearn.linear_model import Ridge
from sklearn.ensemble import RandomForestRegressor

if __package__:
    from .ml_protocol import (
        FEATURES,
        UNITS,
        CANDIDATES,
        fit,
        predict,
        matrix,
        indices,
        select,
        folds,
        cohort_hash,
        paired_comparison,
        permutation_importance,
    )
else:
    from ml_protocol import (
        FEATURES,
        UNITS,
        CANDIDATES,
        fit,
        predict,
        matrix,
        indices,
        select,
        folds,
        cohort_hash,
        paired_comparison,
        permutation_importance,
    )


def metrics(observed, prediction):
    y, p = np.array(observed, float), np.array(prediction, float)
    e = p - y
    den = np.sum((y - np.mean(y)) ** 2)
    return dict(
        n=len(y),
        mae=float(np.mean(abs(e))),
        rmse=float(np.sqrt(np.mean(e**2))),
        bias=float(np.mean(e)),
        medianAbsoluteError=float(np.median(abs(e))),
        r2=float(1 - np.sum(e**2) / den) if den else None,
    )


def bootstrap(y, p, seed, repeats=1000):
    rng = np.random.default_rng(seed)
    ae = abs(np.array(p) - np.array(y))
    samples = [
        float(np.mean(ae[rng.integers(0, len(ae), len(ae))])) for _ in range(repeats)
    ]
    return dict(
        method="district-pair percentile bootstrap; not a prediction interval",
        seed=seed,
        repeats=repeats,
        confidence=0.95,
        lower=float(np.quantile(samples, 0.025)),
        upper=float(np.quantile(samples, 0.975)),
    )


def load(path, cases_only=False):
    raw = path.read_bytes()
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    required = (
        {"district", "year", "cases"}
        if cases_only
        else {"district", "year", "cases", "rainfall", "temperature", "humidity"}
    )
    if (
        not reader.fieldnames
        or len(reader.fieldnames) != len(set(reader.fieldnames))
        or not required.issubset(reader.fieldnames)
    ):
        raise ValueError("Required unique CSV headers: " + ", ".join(sorted(required)))
    rows = list(reader)
    if not rows:
        raise ValueError("Input CSV has no observations")
    names = {}
    lookup = {}
    for i, r in enumerate(rows):
        if None in r or any(v is None for v in r.values()):
            raise ValueError(f"Malformed CSV row {i+2}")
        district = " ".join(unicodedata.normalize("NFKC", r["district"]).split())
        if not district or len(district) > 100:
            raise ValueError(f"Invalid district at row {i+2}")
        identity = district.casefold()
        names.setdefault(identity, district)
        try:
            year = int(r["year"])
        except ValueError:
            raise ValueError(f"Invalid annual year at row {i+2}") from None
        key = (identity, year)
        if key in lookup:
            raise ValueError(f"Duplicate district-year at row {i+2}")
        for f in ["cases", "rainfall", "temperature", "humidity"]:
            r[f] = float(r[f]) if r.get(f, "").strip() else None
            if r[f] is not None and (
                not np.isfinite(r[f]) or (f != "temperature" and r[f] < 0)
            ):
                raise ValueError(f"Invalid {f} at row {i+2}")
        if r["humidity"] is not None and r["humidity"] > 100:
            raise ValueError("Humidity exceeds 100%")
        if (
            key[1] < 1900
            or key[1] > 2100
            or (r["cases"] is not None and not r["cases"].is_integer())
        ):
            raise ValueError("Annual year or case-count schema invalid")
        r["year"] = key[1]
        lookup[key] = r
    panel = []
    excluded = []
    for (d, y), r in sorted(lookup.items()):
        previous = lookup.get((d, y - 1))
        if (
            r["cases"] is None
            or not previous
            or any(
                previous[f] is None
                for f in (
                    ["cases"]
                    if cases_only
                    else ["cases", "rainfall", "temperature", "humidity"]
                )
            )
        ):
            excluded.append(
                dict(
                    district=names[d],
                    year=y,
                    reason="Missing outcome or contiguous preceding-year required features; no imputation",
                )
            )
            continue
        panel.append(
            dict(
                district=names[d],
                year=y,
                y=r["cases"],
                x=[
                    previous[f]
                    for f in ["cases", "rainfall", "temperature", "humidity"]
                ],
            )
        )
    return panel, excluded, hashlib.sha256(raw).hexdigest()


def tree_export(t):
    return dict(
        feature=t.feature.tolist(),
        threshold=t.threshold.tolist(),
        left=t.children_left.tolist(),
        right=t.children_right.tolist(),
        value=t.value[:, 0, 0].tolist(),
    )


def artifact(
    model, scaler, name, digest, end, period, classification, seed, provenance
):
    a = dict(
        schema="malariascope-portable-model-v1",
        model=name,
        version=provenance["modelIdentity"],
        datasetHash=digest,
        classification=classification,
        features=[dict(name=FEATURES[i], unit=UNITS[i]) for i in indices(name)],
        provenance=provenance,
        trainingEnd=end,
        validationPeriod=period,
        mean=scaler.mean_.tolist(),
        scale=scaler.scale_.tolist(),
    )
    if isinstance(model, Ridge):
        a.update(coefficients=model.coef_.tolist(), intercept=float(model.intercept_))
    elif isinstance(model, RandomForestRegressor):
        a.update(
            trees=[tree_export(t.tree_) for t in model.estimators_],
            aggregation="mean",
            learningRate=1,
            initial=0,
        )
    else:
        a.update(
            trees=[tree_export(t[0].tree_) for t in model.estimators_],
            aggregation="sum",
            learningRate=model.learning_rate,
            initial=float(model.init_.constant_[0, 0]),
        )
    return a


def run(
    path,
    output,
    test_year,
    seed,
    classification,
    source,
    license_name,
    tune=False,
    cases_only=False,
):
    if not source.strip() or not license_name.strip():
        raise ValueError("Declare authorized source and license before training")
    if (
        classification not in ["USER-TRAINED RESEARCH OUTPUT", "SYNTHETIC"]
        or not isinstance(test_year, int)
        or not 1900 <= test_year <= 2100
        or not isinstance(seed, int)
        or not 0 <= seed <= 2**32 - 1
    ):
        raise ValueError("Invalid classification, test year or seed")
    panel, excluded, digest = load(path, cases_only)
    future = [r for r in panel if r["year"] > test_year]
    panel = [r for r in panel if r["year"] <= test_year]
    test = [r for r in panel if r["year"] == test_year]
    train = [r for r in panel if r["year"] < test_year]
    if len(train) < 8 or len(test) < 3:
        raise ValueError("At least 8 training and 3 held-out observations required")
    if output.exists() and any(output.iterdir()):
        raise ValueError(
            "Choose a new or empty output directory; existing research runs are not overwritten"
        )
    output.mkdir(parents=True, exist_ok=True)
    environment = dict(
        python=platform.python_version(),
        numpy=np.__version__,
        scikitLearn=sklearn.__version__,
    )
    code_hashes = {
        f: hashlib.sha256((Path(__file__).parent / f).read_bytes()).hexdigest()
        for f in ["train.py", "ml_protocol.py"]
    }
    training_hash = cohort_hash(train)
    results, predictions, backtests, selections, all_predictions = [], [], [], {}, {}
    yt = np.array([r["y"] for r in test])
    models = (
        ["Persistence", "Ridge Regression — no climate"]
        if cases_only
        else ["Persistence", *CANDIDATES]
    )
    for name in models:
        selection = (
            select(train, name, seed, tune)
            if name != "Persistence"
            else dict(status="FIXED BASELINE", parameters={}, folds=[], candidates=[])
        )
        selections[name] = selection
        params = selection["parameters"]
        model = scaler = None
        if name == "Persistence":
            p = np.array([r["x"][0] for r in test])
        else:
            model, scaler = fit(train, name, params, seed)
            p = predict(model, scaler, test, name)
            identity = cohort_hash(
                dict(
                    trainingHash=training_hash,
                    model=name,
                    parameters=params,
                    features=indices(name),
                    seed=seed,
                    classification=classification,
                    environment=environment,
                    codeHashes=code_hashes,
                )
            )
            x = matrix(train, name)
            provenance = dict(
                modelIdentity="fit-" + identity,
                trainingHash=training_hash,
                parameters=params,
                seed=seed,
                source=source,
                license=license_name,
                environment=environment,
                codeHashes=code_hashes,
                trainingStart=min(r["year"] for r in train),
                trainingRows=len(train),
                selection=selection,
                inputRanges=[
                    dict(minimum=float(x[:, i].min()), maximum=float(x[:, i].max()))
                    for i in range(x.shape[1])
                ],
            )
            file_name = (
                "ridge-no-climate"
                if name.endswith("no climate")
                else name.lower().replace(" ", "-")
            )
            (output / (file_name + ".json")).write_text(
                json.dumps(
                    artifact(
                        model,
                        scaler,
                        name,
                        digest,
                        max(r["year"] for r in train),
                        str(test_year),
                        classification,
                        seed,
                        provenance,
                    ),
                    allow_nan=False,
                )
            )
        all_predictions[name] = p
        result = dict(
            model=name,
            validationPeriod=str(test_year),
            metrics=metrics(yt, p),
            maeInterval=bootstrap(yt, p, seed),
        )
        if model is not None:
            result["featureImportance"] = dict(
                basis="HELD-OUT DESCRIPTIVE DIAGNOSTIC — NEVER USED FOR SELECTION",
                seed=seed,
                values=permutation_importance(model, scaler, test, name, seed),
                limitation="Marginal permutations may break correlated feature relationships; small cohort; not causal or intervention effects",
            )
        cal = [r for r in train if r["year"] == test_year - 1]
        early = [r for r in train if r["year"] < test_year - 1]
        radius = None
        if len(cal) >= 3 and len(early) >= 8:
            if name == "Persistence":
                cp = np.array([r["x"][0] for r in cal])
            else:
                # Calibration settings are selected using early rows only, never calibration outcomes.
                cs = select(early, name, seed, tune)
                cm, es = fit(early, name, cs["parameters"], seed)
                cp = predict(cm, es, cal, name)
            residuals = sorted(abs(np.array([r["y"] for r in cal]) - cp))
            k = int(np.ceil((len(residuals) + 1) * 0.9))
            radius = float(residuals[k - 1]) if k <= len(residuals) else None
            result["predictionInterval"] = dict(
                level=0.9,
                radius=radius,
                calibrationYear=test_year - 1,
                n=len(cal),
                status=(
                    "FINITE EXPLORATORY REFIT BAND"
                    if radius is not None
                    else "INSUFFICIENT CALIBRATION FOR FINITE 90% INTERVAL"
                ),
                limitation="Earlier-fit calibration applied to final refit; temporal/spatial dependence and refitting prevent a claimed coverage guarantee",
                empiricalHoldoutCoverage=(
                    float(np.mean(abs(p - yt) <= radius))
                    if radius is not None
                    else None
                ),
            )
        else:
            result["predictionInterval"] = dict(status="INSUFFICIENT CALIBRATION DATA")
        results.append(result)
        for r, v in zip(test, p):
            predictions.append(
                dict(
                    district=r["district"],
                    year=r["year"],
                    cases=r["y"],
                    model=name,
                    prediction=float(v),
                    residual=float(v - r["y"]),
                    absoluteError=float(abs(v - r["y"])),
                    lower=max(0, float(v - radius)) if radius is not None else None,
                    upper=float(v + radius) if radius is not None else None,
                    classification=classification,
                )
            )
    for result in results:
        result["pairedComparisons"] = [
            paired_comparison(
                yt,
                all_predictions[result["model"]],
                all_predictions[reference],
                seed,
                reference,
            )
            for reference in ["Persistence", "Ridge Regression — no climate"]
            if reference != result["model"]
        ]
    # Outer folds stop before the final holdout. Tuning in each fold only sees its own past.
    for year, earlier, held in folds(train):
        for name in models:
            settings = (
                select(earlier, name, seed, tune)
                if name != "Persistence"
                else dict(status="FIXED BASELINE", parameters={})
            )
            if name == "Persistence":
                pred = [r["x"][0] for r in held]
            else:
                m, sc = fit(earlier, name, settings["parameters"], seed)
                pred = predict(m, sc, held, name)
            backtests.append(
                dict(
                    model=name,
                    trainingEnd=max(r["year"] for r in earlier),
                    testYear=year,
                    selection=settings,
                    metrics=metrics([r["y"] for r in held], pred),
                )
            )
    results.sort(key=lambda r: r["metrics"]["mae"])
    report = dict(
        schema="malariascope-training-run-v2",
        datasetHash=digest,
        trainingHash=training_hash,
        source=source,
        license=license_name,
        classification=classification,
        seed=seed,
        features=FEATURES[:1] if cases_only else FEATURES,
        cohortMode="CASES ONLY" if cases_only else "CLIMATE COMPLETE CASE",
        environment=environment,
        codeHashes=code_hashes,
        selection=selections,
        protocol="Contiguous lag-1 common complete-case cohort; train-only scaling; expanding-origin selection and nested backtesting before final holdout; no outcome-year climate; fixed candidate grid",
        trainingStart=min(r["year"] for r in train),
        trainingEnd=max(r["year"] for r in train),
        trainingRows=len(train),
        testYear=test_year,
        excluded=excluded,
        ignoredFuture=[dict(district=r["district"], year=r["year"]) for r in future],
        leaderboard=results,
        rollingOrigin=backtests,
        predictions=predictions,
        limitations=[
            "Source authorization is user-declared, not independently verified",
            "Small district cohorts; spatial dependence limits bootstrap interpretation",
            "Annual resolution",
            "No causal climate inference",
            "Not prospective or clinical validation",
            (
                "Case-only cohort is not directly comparable to climate-complete runs"
                if cases_only
                else "Complete-case common cohort excludes districts with missing lagged climate, including from baseline comparisons"
            ),
            "Temporal validation covers known districts; no unseen-geography performance claim",
            "Refit calibration bands are exploratory; nominal coverage is not guaranteed",
        ],
    )
    (output / "run.json").write_text(json.dumps(report, indent=2, allow_nan=False))
    with (output / "predictions.csv").open("w", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "district",
                "year",
                "cases",
                "model",
                "prediction",
                "trainingPeriod",
                "validationPeriod",
                "outputClassification",
            ],
        )
        w.writeheader()
        for r in predictions:
            w.writerow(
                {k: r[k] for k in ["district", "year", "cases", "model", "prediction"]}
                | dict(
                    trainingPeriod=f"{report['trainingStart']}-{report['trainingEnd']}",
                    validationPeriod=str(test_year),
                    outputClassification=classification,
                )
            )
    return report


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("input", type=Path)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--test-year", type=int, required=True)
    ap.add_argument("--seed", type=int, default=2025)
    ap.add_argument(
        "--classification",
        choices=["USER-TRAINED RESEARCH OUTPUT", "SYNTHETIC"],
        default="USER-TRAINED RESEARCH OUTPUT",
    )
    ap.add_argument(
        "--tune",
        action="store_true",
        help="Select from a small declared grid using pre-holdout expanding-origin folds",
    )
    ap.add_argument(
        "--cases-only",
        action="store_true",
        help="Separate Persistence/Ridge cohort requiring only district, year, cases",
    )
    ap.add_argument("--source", required=True)
    ap.add_argument("--license", required=True)
    a = ap.parse_args()
    result = run(
        a.input,
        a.output,
        a.test_year,
        a.seed,
        a.classification,
        a.source,
        a.license,
        a.tune,
        a.cases_only,
    )
    print(
        json.dumps(
            dict(
                models=len(result["leaderboard"]),
                pairs=len(result["predictions"]),
                excluded=len(result["excluded"]),
            )
        )
    )
