export type SpatialInput = { names: string[]; values: number[]; neighbors: number[][] };
export function moran(input: SpatialInput, permutations = 999, seed = 2025) {
  if(!Number.isInteger(permutations)||permutations<1||permutations>10000)throw Error('Permutation count must be an integer from 1 to 10,000.');
  const { values, neighbors, names } = input,
    n = values.length;
  if (n < 3) throw Error('At least three matched districts are required.');
  const mean = values.reduce((a, v) => a + v, 0) / n,
    dev = values.map((v) => v - mean),
    den = dev.reduce((a, v) => a + v * v, 0),
    s0 = neighbors.filter((v) => v.length).length;
  if (!den || !s0)
    throw Error(
      'Spatial analysis requires varying observations and at least one adjacent district pair.',
    );
  const expected = -1 / (n - 1);
  const calculate = (d: number[]) =>
    ((n / s0) *
      neighbors.reduce(
        (a, ns, i) => a + (ns.length ? (d[i] * ns.reduce((s, j) => s + d[j], 0)) / ns.length : 0),
        0,
      )) /
    den;
  const observed = calculate(dev);
  let rng = seed >>> 0;
  const random = () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  };
  const distribution: number[] = [];
  let extreme = 0;
  for (let p = 0; p < permutations; p++) {
    const shuffled = [...dev];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const value = calculate(shuffled);
    distribution.push(value);
    if (Math.abs(value - expected) >= Math.abs(observed - expected)) extreme++;
  }
  const sd = Math.sqrt(den / n);
  const local = names.map((name, i) => {
    const ns = neighbors[i],
      z = dev[i] / sd,
      lag = ns.length ? ns.reduce((s, j) => s + dev[j] / sd, 0) / ns.length : null;
    return {
      district: name,
      neighbors: ns.map((j) => names[j]),
      z,
      lag,
      localI: lag === null ? null : z * lag,
      quadrant:
        lag === null
          ? 'ISOLATED'
          : z >= 0
            ? lag >= 0
              ? 'HIGH–HIGH'
              : 'HIGH–LOW'
            : lag >= 0
              ? 'LOW–HIGH'
              : 'LOW–LOW',
    };
  });
  return {
    observed,
    expected,
    pValue: (extreme + 1) / (permutations + 1),
    permutations,
    seed,
    n,
    distribution,
    local,
    method:
      'Queen contiguity (polygon intersection), row-standardized weights; two-sided permutation test around expected I; exploratory quadrants without local significance tests',
  };
}
