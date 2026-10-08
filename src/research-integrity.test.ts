import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  loadResearchPackage,
  researchDatasets,
  researchRows,
  getModelPrediction,
  getObservedApi,
  getDistrictObservation,
  studyModels,
} from './research-data/research.ts';
import { aggregateEvidence, buildDistrict360 } from './district-intelligence.ts';
import { loadedForecastEvidence, forecastMetrics } from './forecasting.ts';
const fetcher = (async (url: any) =>
  new Response(await readFile(new URL('../public' + url, import.meta.url)))) as typeof fetch;
const p = await loadResearchPackage(fetcher);
test('research package verifies every artifact SHA-256 and fails corrupted files', async () => {
  assert.equal(p.manifest.files.length, 15);
  await assert.rejects(
    loadResearchPackage(
      (async (url: any) =>
        new Response(
          (await readFile(new URL('../public' + url, import.meta.url), 'utf8')) +
            (String(url).endsWith('uncertainty.json') ? ' ' : ''),
        )) as typeof fetch,
    ),
    /checksum mismatch/,
  );
});
test('exact balanced annual totals and panel membership remain intact', () => {
  const totals = [104544, 116675, 180950, 151127, 204727, 288131];
  assert.equal(p.balanced.length, 48);
  assert.equal(new Set(p.balanced.map((r) => r.district)).size, 8);
  totals.forEach((total, i) =>
    assert.equal(
      p.balanced.filter((r) => r.year === 2020 + i).reduce((s, r) => s + r.cases, 0),
      total,
    ),
  );
  assert.equal(
    p.balanced.reduce((s, r) => s + r.cases, 0),
    1046154,
  );
  assert.ok(!p.balanced.some((r) => r.district === 'Supiori'));
  assert.equal(new Set(p.balanced.map((r) => r.district + '|' + r.year)).size, 48);
});
test('all-nine snapshot retains reported denominators and no fabricated Supiori history or prediction', () => {
  assert.equal(
    p.spatial.reduce((s, r) => s + r.cases, 0),
    288879,
  );
  assert.equal(
    p.spatial.reduce((s, r) => s + r.at_risk_population, 0),
    1073637,
  );
  assert.equal(getDistrictObservation(p, 'Supiori', 2025)?.cases, 748);
  assert.equal(getDistrictObservation(p, 'Supiori', 2024), undefined);
  assert.equal(getModelPrediction(p, 'Supiori', 'Random Forest'), null);
  assert.equal(getObservedApi(p, 'Supiori', 2024), null);
  assert.equal(researchRows(p, 'Random Forest', true).length, 49);
});
test('all five saved hindcasts produce 40 paired records and fullprecision metrics stay separate', () => {
  const sets = researchDatasets(p);
  const evidence = loadedForecastEvidence(sets, 'study-balanced');
  assert.equal(evidence.pairs.length, 40);
  for (const m of studyModels) assert.equal(evidence.pairs.filter((r) => r.model === m).length, 8);
  assert.equal(p.performance.filter((r) => r.year === 2025).length, 5);
  assert.equal(
    p.performance.find((r) => r.model === 'Persistence' && r.year === 2025).mae,
    10425.5,
  );
  assert.equal(
    p.performance.find((r) => r.model === 'Random Forest' && r.year === 2025).mae,
    12690.256937171625,
  );
  assert.ok(
    Math.abs(
      forecastMetrics(evidence.pairs.filter((r) => r.model === 'Random Forest')).mae! - 12690.2625,
    ) < 1e-8,
  );
  const kota = evidence.pairs.find(
    (r) => r.model === 'Random Forest' && r.district === 'Kota Jayapura',
  )!;
  assert.ok(Math.abs(kota.residual + 40940.3) < 1e-8);
  assert.ok(Math.abs(kota.absoluteError - 40940.3) < 1e-8);
  assert.ok(p.uncertainty.pairedInterval[0] < 0 && p.uncertainty.pairedInterval[1] > 0);
});
test('shared district evidence joins 2025 cases, API, climate and forecast with field provenance', () => {
  const sets = researchDatasets(p),
    joined = aggregateEvidence(sets, 'study-balanced', 'Random Forest');
  const info = buildDistrict360(joined.records, 'Mamberamo Raya', 2025, [100, 300, 500], [], {});
  assert.equal(info.current?.values.cases, 27482);
  assert.equal(info.current?.values.population, 40135);
  assert.equal(info.current?.values.incidence, 684.74);
  assert.equal(
    info.current?.values.prediction,
    getModelPrediction(p, 'Mamberamo Raya', 'Random Forest'),
  );
  assert.ok(info.current?.values.rainfall);
  assert.equal(info.history.length, 6);
  assert.equal(
    info.current?.references.find((r) => r.field === 'rainfall' && r.selected)?.dataset,
    'climate-annual-2020-2025.csv',
  );
});
test('licensed actual ADM2 geometry maps all nine study units and spatial claims remain non-significant', () => {
  assert.equal(p.geometry.features.length, 9);
  assert.ok(
    p.geometry.features.every((f: any) => ['Polygon', 'MultiPolygon'].includes(f.geometry.type)),
  );
  assert.equal(new Set(p.geometry.features.map((f: any) => f.properties.district)).size, 9);
  assert.match(p.geometryMetadata.license, /CC BY 3.0 IGO/);
  assert.equal(
    p.geometryMetadata.sourceArtifactSha256,
    '146653d488331086ddc43d159a261b01ea6dd08c7ed422e34a9886c3c690430c',
  );
  assert.equal(p.spatialResult.moranI, 0.165);
  assert.equal(p.spatialResult.pValue, 0.1301);
  assert.equal(p.spatialResult.significant, false);
  assert.equal(p.spatialResult.permutations, 9999);
  assert.equal(p.ledger.length, 4);
});
