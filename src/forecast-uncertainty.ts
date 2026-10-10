import type { ForecastPair } from './forecasting.ts';
export function bootstrapMAE(pairs: ForecastPair[], repeats = 999, seed = 2025) {
  if (!Number.isInteger(repeats) || repeats < 99 || repeats > 10000)
    throw Error('Bootstrap repeats must be 99–10,000');
  const districts = [...new Set(pairs.map((p) => p.district))];
  if (districts.length < 3) return null;
  const groups = districts.map((d) => pairs.filter((p) => p.district === d));
  let rng = seed >>> 0;
  const random = () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  };
  const values = [];
  for (let r = 0; r < repeats; r++) {
    let sum = 0,
      n = 0;
    for (let i = 0; i < districts.length; i++) {
      const sample = groups[Math.floor(random() * groups.length)];
      for (const p of sample) {
        sum += p.absoluteError;
        n++;
      }
    }
    values.push(sum / n);
  }
  values.sort((a, b) => a - b);
  return {
    lower: values[Math.floor(0.025 * (repeats - 1))],
    upper: values[Math.ceil(0.975 * (repeats - 1))],
    repeats,
    seed,
    districts: districts.length,
    method:
      '95% percentile bootstrap resampling whole district histories; descriptive uncertainty, not a prediction interval or independent validation',
  };
}
