"""Declared temporal selection, feature contracts and descriptive held-out diagnostics."""

import hashlib
import json
import numpy as np
from sklearn.linear_model import Ridge
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler

CANDIDATES = {
    "Ridge Regression": [{"alpha": x} for x in (0.1, 1.0, 10.0)],
    "Ridge Regression — no climate": [{"alpha": x} for x in (0.1, 1.0, 10.0)],
    "Random Forest": [{"max_depth": x, "n_estimators": 100} for x in (3, 5)],
    "Gradient Boosting": [
        {"learning_rate": x, "max_depth": 2, "n_estimators": 100} for x in (0.05, 0.1)
    ],
}
DEFAULTS = {name: values[1] for name, values in CANDIDATES.items()}
FEATURES = ["cases_lag1", "rainfall_lag1", "temperature_lag1", "humidity_lag1"]
UNITS = ["cases", "mm/year", "degrees C annual mean", "% annual mean"]


def indices(name):
    return [0] if name == "Ridge Regression — no climate" else [0, 1, 2, 3]


def matrix(rows, name):
    return np.array([[r["x"][i] for i in indices(name)] for r in rows], dtype=float)


def estimator(name, params, seed):
    if name.startswith("Ridge"):
        return Ridge(**params)
    if name == "Random Forest":
        return RandomForestRegressor(**params, random_state=seed, n_jobs=1)
    return GradientBoostingRegressor(**params, random_state=seed)


def fit(rows, name, params, seed):
    x = matrix(rows, name)
    scaler = StandardScaler().fit(x)
    model = estimator(name, params, seed).fit(
        scaler.transform(x), [r["y"] for r in rows]
    )
    return model, scaler


def predict(model, scaler, rows, name):
    return np.maximum(0, model.predict(scaler.transform(matrix(rows, name))))


def folds(rows):
    for year in sorted({r["year"] for r in rows}):
        earlier = [r for r in rows if r["year"] < year]
        held = [r for r in rows if r["year"] == year]
        if len(earlier) >= 8 and len(held) >= 3:
            yield year, earlier, held


def select(rows, name, seed, tune):
    available = list(folds(rows))
    base = dict(
        status="FIXED PREDECLARED PARAMETERS",
        parameters=DEFAULTS[name],
        metric="pooled validation MAE",
        folds=[],
        candidates=[],
    )
    if not tune:
        return base
    if len(available) < 2:
        return dict(
            base,
            status="INSUFFICIENT TEMPORAL FOLDS — FIXED DEFAULT",
            folds=[year for year, _, _ in available],
        )
    scores = []
    for params in CANDIDATES[name]:
        errors = []
        for _, earlier, held in available:
            model, scaler = fit(earlier, name, params, seed)
            errors.extend(
                abs(
                    predict(model, scaler, held, name)
                    - np.array([r["y"] for r in held])
                )
            )
        scores.append(
            dict(parameters=params, mae=float(np.mean(errors)), n=len(errors))
        )
    # Stable declaration order breaks ties; held-out year is never present in rows.
    best = min(scores, key=lambda item: item["mae"])
    return dict(
        status="PRE-HOLDOUT TEMPORAL SELECTION",
        parameters=best["parameters"],
        metric="pooled validation MAE",
        folds=[year for year, _, _ in available],
        candidates=scores,
    )


def cohort_hash(rows):
    return hashlib.sha256(
        json.dumps(
            rows, sort_keys=True, separators=(",", ":"), allow_nan=False
        ).encode()
    ).hexdigest()


def paired_comparison(y, candidate, reference, seed, reference_name, repeats=1000):
    delta = abs(np.array(candidate) - np.array(y)) - abs(
        np.array(reference) - np.array(y)
    )
    rng = np.random.default_rng(seed)
    values = [
        np.mean(delta[rng.integers(0, len(delta), len(delta))]) for _ in range(repeats)
    ]
    lower, upper = (float(np.quantile(values, q)) for q in (0.025, 0.975))
    return dict(
        reference=reference_name,
        n=len(delta),
        maeDifference=float(np.mean(delta)),
        lower=lower,
        upper=upper,
        seed=seed,
        repeats=repeats,
        method="95% paired district percentile bootstrap; candidate minus reference absolute error",
        interpretation="DESCRIPTIVE ONLY — NOT INDEPENDENT MODEL SUPERIORITY",
        crossesZero=lower <= 0 <= upper,
    )


def permutation_importance(model, scaler, rows, name, seed, repeats=20):
    x = matrix(rows, name)
    y = np.array([r["y"] for r in rows])
    base = np.mean(abs(np.maximum(0, model.predict(scaler.transform(x))) - y))
    rng = np.random.default_rng(seed)
    result = []
    for column, feature in enumerate(indices(name)):
        increases = []
        for _ in range(repeats):
            changed = x.copy()
            changed[:, column] = rng.permutation(changed[:, column])
            increases.append(
                float(
                    np.mean(
                        abs(np.maximum(0, model.predict(scaler.transform(changed))) - y)
                    )
                    - base
                )
            )
        result.append(
            dict(
                feature=FEATURES[feature],
                unit=UNITS[feature],
                meanMAEIncrease=float(np.mean(increases)),
                standardDeviation=float(np.std(increases)),
                repeats=repeats,
            )
        )
    return result
