"""Reproducible annual hindcast pipeline. Never overwrites supplied study files."""

import argparse
import csv
import hashlib
import json
from pathlib import Path
import numpy as np
from sklearn.linear_model import Ridge
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler

FEATURES = ["cases_lag1", "rainfall_lag1", "temperature_lag1", "humidity_lag1"]
UNITS = ["cases", "mm/year", "degrees C annual mean", "% annual mean"]


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


def load(path):
    raw = path.read_bytes()
    rows = list(csv.DictReader(raw.decode("utf-8-sig").splitlines()))
    lookup = {}
    for i, r in enumerate(rows):
        key = (r["district"].strip(), int(r["year"]))
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
                for f in ["cases", "rainfall", "temperature", "humidity"]
            )
        ):
            excluded.append(
                dict(
                    district=d,
                    year=y,
                    reason="Missing outcome or contiguous preceding-year features; no imputation",
                )
            )
            continue
        panel.append(
            dict(
                district=d,
                year=y,
                y=r["cases"],
                x=[
                    previous[f]
                    for f in ["cases", "rainfall", "temperature", "humidity"]
                ],
            )
        )
    return panel, excluded, hashlib.sha256(raw).hexdigest()


def estimators(seed):
    return {
        "Ridge Regression": Ridge(alpha=1.0),
        "Random Forest": RandomForestRegressor(
            n_estimators=100, max_depth=5, random_state=seed, n_jobs=1
        ),
        "Gradient Boosting": GradientBoostingRegressor(
            n_estimators=100, max_depth=2, random_state=seed
        ),
    }


def tree_export(t):
    return dict(
        feature=t.feature.tolist(),
        threshold=t.threshold.tolist(),
        left=t.children_left.tolist(),
        right=t.children_right.tolist(),
        value=t.value[:, 0, 0].tolist(),
    )


def artifact(model, scaler, name, digest, end, period, classification, seed):
    a = dict(
        schema="malariascope-portable-model-v1",
        model=name,
        version=f"run-{digest[:12]}-{end}-{seed}",
        datasetHash=digest,
        classification=classification,
        features=[dict(name=n, unit=u) for n, u in zip(FEATURES, UNITS)],
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


def run(path, output, test_year, seed, classification, source, license_name):
    if not source.strip() or not license_name.strip():
        raise ValueError("Declare authorized source and license before training")
    panel, excluded, digest = load(path)
    test = [r for r in panel if r["year"] == test_year]
    train = [r for r in panel if r["year"] < test_year]
    if len(train) < 8 or len(test) < 3:
        raise ValueError("At least 8 training and 3 held-out observations required")
    output.mkdir(parents=True, exist_ok=True)
    X = np.array([r["x"] for r in train])
    y = np.array([r["y"] for r in train])
    Xt = np.array([r["x"] for r in test])
    yt = np.array([r["y"] for r in test])
    scaler = StandardScaler().fit(X)
    results = []
    predictions = []
    backtests = []
    all_predictions = {}
    for name, model in {"Persistence": None, **estimators(seed)}.items():
        if model is None:
            p = Xt[:, 0]
        else:
            model.fit(scaler.transform(X), y)
            p = np.maximum(0, model.predict(scaler.transform(Xt)))
            (output / (name.lower().replace(" ", "-") + ".json")).write_text(
                json.dumps(
                    artifact(
                        model,
                        scaler,
                        name,
                        digest,
                        test_year - 1,
                        str(test_year),
                        classification,
                        seed,
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
        # Honest calibration: fit earlier data, reserve preceding year, use absolute residuals.
        cal = [r for r in panel if r["year"] == test_year - 1]
        early = [r for r in panel if r["year"] < test_year - 1]
        radius = None
        if len(cal) >= 3 and len(early) >= 8:
            if model is None:
                cp = np.array([r["x"][0] for r in cal])
            else:
                es = StandardScaler().fit([r["x"] for r in early])
                cm = estimators(seed)[name].fit(
                    es.transform([r["x"] for r in early]), [r["y"] for r in early]
                )
                cp = np.maximum(0, cm.predict(es.transform([r["x"] for r in cal])))
            residuals = sorted(abs(np.array([r["y"] for r in cal]) - cp))
            # Finite-sample 90% conformal quantile may require an unbounded interval on small cohorts.
            k = int(np.ceil((len(residuals) + 1) * 0.9))
            radius = float(residuals[k - 1]) if k <= len(residuals) else None
            result["predictionInterval"] = dict(
                level=0.9,
                radius=radius,
                calibrationYear=test_year - 1,
                n=len(cal),
                status=(
                    "FINITE"
                    if radius is not None
                    else "INSUFFICIENT CALIBRATION FOR FINITE 90% INTERVAL"
                ),
                limitation="Calibration uses earlier fit; final refit interval is exploratory and no coverage guarantee is claimed",
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
    for year in sorted(set(r["year"] for r in panel)):
        earlier = [r for r in panel if r["year"] < year]
        held = [r for r in panel if r["year"] == year]
        if len(earlier) < 8 or len(held) < 3:
            continue
        sc = StandardScaler().fit([r["x"] for r in earlier])
        for name, m in {"Persistence": None, **estimators(seed)}.items():
            pred = (
                [r["x"][0] for r in held]
                if m is None
                else np.maximum(
                    0,
                    m.fit(
                        sc.transform([r["x"] for r in earlier]),
                        [r["y"] for r in earlier],
                    ).predict(sc.transform([r["x"] for r in held])),
                )
            )
            backtests.append(
                dict(
                    model=name,
                    trainingEnd=year - 1,
                    testYear=year,
                    metrics=metrics([r["y"] for r in held], pred),
                )
            )
    results.sort(key=lambda r: r["metrics"]["mae"])
    report = dict(
        schema="malariascope-training-run-v1",
        datasetHash=digest,
        source=source,
        license=license_name,
        classification=classification,
        seed=seed,
        features=FEATURES,
        protocol="Contiguous lag-1 features; scaler fitted on earlier years only; no outcome-year climate; fixed hyperparameters; no model tuning on test outcomes",
        trainingEnd=test_year - 1,
        testYear=test_year,
        excluded=excluded,
        leaderboard=results,
        rollingOrigin=backtests,
        predictions=predictions,
        limitations=[
            "Source authorization is user-declared, not independently verified",
            "Small district cohorts",
            "Annual resolution",
            "No causal climate inference",
            "Not prospective or clinical validation",
        ],
    )
    (output / "run.json").write_text(json.dumps(report, indent=2, allow_nan=False))
    with (output / "predictions.csv").open("w") as f:
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
                    trainingPeriod=f'{min(x["year"] for x in train)}-{test_year-1}',
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
    ap.add_argument("--source", required=True)
    ap.add_argument("--license", required=True)
    a = ap.parse_args()
    result = run(
        a.input, a.output, a.test_year, a.seed, a.classification, a.source, a.license
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
