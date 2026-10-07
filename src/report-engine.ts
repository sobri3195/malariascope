import { normalize, type Row, type evaluate } from './analytics.ts';
import {
  aggregateEvidence,
  annualChange,
  anomaly,
  incidence360,
  observed,
  type Record360,
} from './district-intelligence.ts';
import {
  forecastModels,
  loadedForecastEvidence,
  evaluateForecasts,
  studyEvaluations,
  scientificInterpretation,
} from './forecasting.ts';
import { inspectIntegrityGeometry, inspectDataset } from './scientific-integrity.ts';
import { buildReadinessMatrix } from './readiness-engine.ts';
import { matchedFeatures, geometryBounds, featureIdentity } from './map-intelligence.ts';
import { moran } from './moran.ts';
import { category, validThresholds } from './scenario-engine.ts';
import type { State } from './store.tsx';
export const reportTypes = [
  'Executive Intelligence Summary',
  'District Intelligence Report',
  'Malaria Surveillance Report',
  'Geospatial Risk Report',
  'Climate Intelligence Report',
  'Forecasting Performance Report',
  'Spatial Analysis Report',
  'Data Quality Report',
  'Force Health Readiness Report',
] as const;
export const reportSections = [
  ['overview', 'Overview'],
  ['indicators', 'Key indicators'],
  ['district', 'District profile'],
  ['map', 'GIS map'],
  ['trend', 'Temporal trend'],
  ['climate', 'Climate analysis'],
  ['forecast', 'Forecast'],
  ['performance', 'Model performance'],
  ['risk', 'Risk analysis'],
  ['alerts', 'Alerts'],
  ['readiness', 'Readiness'],
  ['quality', 'Data quality'],
  ['provenance', 'Provenance'],
  ['limitations', 'Limitations'],
] as const;
export type SectionId = (typeof reportSections)[number][0];
export const requiredSections: SectionId[] = ['provenance', 'limitations'];
export const reportPresets: Record<(typeof reportTypes)[number], SectionId[]> = {
  'Executive Intelligence Summary': ['overview', 'indicators', 'risk', 'alerts', 'readiness'],
  'District Intelligence Report': [
    'overview',
    'indicators',
    'district',
    'trend',
    'climate',
    'forecast',
    'risk',
    'readiness',
  ],
  'Malaria Surveillance Report': ['overview', 'indicators', 'district', 'trend', 'alerts'],
  'Geospatial Risk Report': ['overview', 'map', 'risk'],
  'Climate Intelligence Report': ['overview', 'climate', 'trend'],
  'Forecasting Performance Report': ['overview', 'forecast', 'performance'],
  'Spatial Analysis Report': ['overview', 'map'],
  'Data Quality Report': ['overview', 'quality'],
  'Force Health Readiness Report': ['overview', 'readiness', 'alerts'],
};
export const reportDisclaimer =
  'RESEARCH PROTOTYPE — analytical decision support only. Not a validated clinical or operational decision system. No autonomous clinical, tactical, or deployment recommendations.';
export type Cell = string | number | null;
export type ReportTable = {
  title: string;
  columns: { key: string; label: string }[];
  rows: Record<string, Cell>[];
};
export type ReportSection = {
  id: SectionId;
  title: string;
  paragraphs: string[];
  tables: ReportTable[];
};
export type ReportRequest = {
  type: (typeof reportTypes)[number];
  title: string;
  start: number;
  end: number;
  district: string;
  model: string;
  risk: string;
  region: string;
  sections: SectionId[];
};
export type ReportInput = {
  state: State;
  request: ReportRequest;
  now: string;
  supplied: { models: any[]; summary: any; spatial: any; provenance: Record<string, any> };
  alerts: ReturnType<typeof evaluate>;
};
const table = (
  title: string,
  labels: [string, string][],
  rows: Record<string, Cell>[],
): ReportTable => ({ title, columns: labels.map(([key, label]) => ({ key, label })), rows });
const sum = (values: (number | null)[]) =>
  values.some((v) => v !== null) ? values.reduce<number>((a, v) => a + (v ?? 0), 0) : null;
const datasetVersions = (state: State) =>
  state.datasets.map((d) => ({
    id: d.id,
    name: d.name,
    source: d.source,
    classification: d.classification ?? 'USER IMPORT',
    checksum: d.checksum || 'Unavailable',
    created: d.created,
  }));
export function validateReportRequest(r: ReportRequest) {
  if (!reportTypes.includes(r.type)) return 'Unsupported report type';
  if (!r.title.trim()) return 'A report title is required';
  if (
    !Number.isInteger(r.start) ||
    !Number.isInteger(r.end) ||
    r.start < 1900 ||
    r.end > 2100 ||
    r.start > r.end
  )
    return 'Reporting period requires ordered annual years between 1900 and 2100';
  if (!forecastModels.includes(r.model as (typeof forecastModels)[number]))
    return 'Unsupported model';
  if (!['ALL', 'LOW', 'MODERATE', 'HIGH', 'VERY HIGH', 'INSUFFICIENT DATA'].includes(r.risk))
    return 'Unsupported risk filter';
  if (!r.sections.every((id) => reportSections.some(([key]) => key === id)))
    return 'Unsupported report section';
  return null;
}
export function buildResearchReport(input: ReportInput) {
  const { state, request: r, now, supplied } = input;
  const error = validateReportRequest(r);
  if (error) throw Error(error);
  if (!Number.isFinite(Date.parse(now))) throw Error('Valid analysis timestamp required');
  const thresholds = validThresholds(state.thresholds) ? [...state.thresholds] : [100, 300, 500];
  const aggregate = aggregateEvidence(state.datasets, state.active, r.model);
  aggregate.records = aggregate.records
    .filter((record) => record.year >= 1900 && record.year <= 2100)
    .map((record) => {
      const values = { ...record.values },
        issues = [...record.issues];
      for (const field of [
        'cases',
        'population',
        'prediction',
        'rainfall',
        'incidence',
        'humidity',
      ] as const) {
        const v = values[field];
        if (
          v !== null &&
          (v < 0 ||
            (field === 'population' && v <= 0) ||
            (field === 'cases' && !Number.isSafeInteger(v)) ||
            (field === 'humidity' && v > 100))
        ) {
          values[field] = null;
          issues.push(`${field}: invalid source value ${v} withheld from report calculations`);
        }
      }
      return { ...record, values, issues };
    });
  const districtMatches = (name: string) =>
    r.district === 'All districts' || normalize(name) === normalize(r.district);
  const regionFor = (record: Record360) => {
    const ref = record.references.find((ref) => ref.selected && ref.field === 'cases');
    return (
      state.datasets
        .find((d) => d.id === ref?.datasetId)
        ?.rows.find(
          (row) =>
            row.year === record.year &&
            normalize(row.district) === normalize(ref?.district ?? record.district),
        )?.region ?? null
    );
  };
  const matches = (record: Record360) =>
    districtMatches(record.district) &&
    (r.region === 'ALL' || regionFor(record) === r.region) &&
    (r.risk === 'ALL' || category(incidence360(record), thresholds) === r.risk);
  const allHistory = aggregate.records.filter(
    (record) => districtMatches(record.district) && record.year <= r.end,
  );
  const records = aggregate.records.filter(
    (record) => record.year >= r.start && record.year <= r.end && matches(record),
  );
  const current = records.filter((record) => record.year === r.end);
  const selectedIds = new Set(
    records.map((record) => `${normalize(record.district)}:${record.year}`),
  );
  const sectionIds = [...new Set([...r.sections, ...requiredSections])];
  const versions = datasetVersions(state);
  const sections: ReportSection[] = [];
  const limitations = [
    ...(!validThresholds(state.thresholds)
      ? [
          'Invalid stored incidence cutoffs: the explicit report fallback 100 / 300 / 500 per 1,000 is used.',
        ]
      : []),
    'User imports and supplied study outputs are not independently verified. Registry VERIFIED labels are source labels, not independent scientific certification.',
    'Missing or ambiguous inputs remain unavailable. Loaded districts may cover only part of Papua; sums are not province-wide estimates. No missing period is replaced with zero.',
    'Incidence is cases / positive population × 1,000; supplied incidence is used only when that ratio cannot be derived. Category cutoffs are analytical configuration, not validated clinical thresholds.',
    'Predictions are loaded model outputs, not observations or new inference. Climate associations do not establish causation. Historical anomalies use prior observations only.',
    'Forecast metrics describe supplied or loaded validation pairs; out-of-sample validation design is not independently established. No future predictions or unsupported scientific conclusions are generated.',
    'Readiness states are deterministic review signals; local checklist entries are user-entered and do not independently establish resource availability. Scenario outputs and experimental risk weights are excluded.',
    'Data quality audits, when selected, cover every source row in every loaded dataset. Report filters never improve score denominators or hide missing inputs.',
    ...aggregate.identityIssues,
    ...records.flatMap((record) =>
      record.issues.map((i) => `${record.district} · ${record.year}: ${i}`),
    ),
  ];
  const add = (id: SectionId, paragraphs: string[], tables: ReportTable[] = []) =>
    sections.push({
      id,
      title: reportSections.find(([key]) => key === id)![1],
      paragraphs,
      tables,
    });
  const referenceText = (record: Record360) =>
    [...new Set(record.references.filter((ref) => ref.selected).map((ref) => ref.dataset))].join(
      '; ',
    ) || 'No selected source';
  const valueRows = records.map((record) => ({
    district: record.district,
    year: record.year,
    cases: record.values.cases,
    population: record.values.population,
    incidence: incidence360(record),
    risk: category(incidence360(record), thresholds),
    source: referenceText(record),
    verification:
      [
        ...new Set(
          record.references.filter((ref) => ref.selected).map((ref) => ref.classification),
        ),
      ].join('; ') || 'UNVERIFIED',
  }));
  const suppliedScope =
    state.datasets.length === 0 &&
    r.district === 'All districts' &&
    r.risk === 'ALL' &&
    r.region === 'ALL';
  if (sectionIds.includes('overview')) {
    add(
      'overview',
      [
        `${records.length} loaded district-year records match the reporting period and filters. ${current.length} records are available in the end year. Active source has precedence when compatible datasets are joined.`,
        `Reported sources: ${versions.map((v) => v.name).join('; ') || 'No district dataset connected'}. Predictions and observed outcomes remain distinct.`,
      ],
      suppliedScope
        ? [
            table(
              'Supplied study aggregates — not connected district observations',
              [
                ['year', 'Year'],
                ['cases', 'Supplied aggregate cases'],
                ['source', 'Source'],
              ],
              (supplied.summary?.annual ?? [])
                .filter((a: any) => a.year >= r.start && a.year <= r.end)
                .map((a: any) => ({
                  year: a.year,
                  cases: a.cases,
                  source: supplied.summary?.source || 'Supplied study specification',
                })),
            ),
          ]
        : [],
    );
  }
  if (sectionIds.includes('indicators')) {
    const complete =
      current.length > 0 &&
      current.every(
        (v) => v.values.cases !== null && v.values.population !== null && v.values.population > 0,
      );
    const cases = sum(current.map((v) => v.values.cases)),
      population = complete ? sum(current.map((v) => v.values.population)) : null;
    add(
      'indicators',
      [
        'End-year indicators only. Cases sum available observations; population and aggregate incidence require a complete positive denominator for every selected end-year record. Counts are not unique patients.',
      ],
      [
        table(
          'Key indicators',
          [
            ['indicator', 'Indicator'],
            ['value', 'Value'],
            ['year', 'Year'],
          ],
          [
            { indicator: 'Districts with an end-year record', value: current.length, year: r.end },
            { indicator: 'Observed cases (available records)', value: cases, year: r.end },
            { indicator: 'Population (complete selected cohort)', value: population, year: r.end },
            {
              indicator: 'Cohort incidence per 1,000',
              value: complete && population && cases !== null ? (cases / population) * 1000 : null,
              year: r.end,
            },
            {
              indicator: 'HIGH risk districts',
              value: current.filter((v) => category(incidence360(v), thresholds) === 'HIGH').length,
              year: r.end,
            },
            {
              indicator: 'VERY HIGH risk districts',
              value: current.filter((v) => category(incidence360(v), thresholds) === 'VERY HIGH')
                .length,
              year: r.end,
            },
          ],
        ),
      ],
    );
  }
  if (sectionIds.includes('district'))
    add(
      'district',
      [
        'District-year observations from compatible loaded sources; selected-model predictions are displayed separately in Forecast.',
      ],
      [
        table(
          'District profile',
          [
            ['district', 'District'],
            ['year', 'Year'],
            ['cases', 'Observed cases'],
            ['population', 'Population'],
            ['incidence', 'Incidence / 1,000'],
            ['source', 'Source datasets'],
            ['verification', 'Evidence status'],
          ],
          valueRows,
        ),
      ],
    );
  const trend = Array.from({ length: r.end - r.start + 1 }, (_, i) => {
    const year = r.start + i,
      rows = records.filter((v) => v.year === year);
    return {
      year,
      cases: sum(rows.map((v) => v.values.cases)),
      districts: rows.length,
      availableCases: rows.filter((v) => v.values.cases !== null).length,
    };
  });
  if (sectionIds.includes('trend'))
    add(
      'trend',
      [
        'Annual case sums use the district cohort actually matching filters in each year. Changing coverage or a time-varying risk filter can change the cohort; cross-year differences do not prove epidemiological change. No future years enter historical calculations.',
      ],
      [
        table(
          'Temporal trend',
          [
            ['year', 'Year'],
            ['cases', 'Available observed cases'],
            ['districts', 'Matching district records'],
            ['availableCases', 'Records with observed cases'],
          ],
          trend,
        ),
      ],
    );
  if (sectionIds.includes('climate'))
    add(
      'climate',
      [
        'Climate values retain source units (temperature °C; rainfall units are source-dependent). Anomalies = (current − prior mean) / prior sample SD, requiring ≥3 earlier annual observations and nonzero variation. Missing values are not imputed.',
      ],
      [
        table(
          'Climate evidence',
          [
            ['district', 'District'],
            ['year', 'Year'],
            ['rainfall', 'Rainfall (source units)'],
            ['temperature', 'Temperature °C'],
            ['rainfallAnomaly', 'Rainfall anomaly SD'],
            ['temperatureAnomaly', 'Temperature anomaly SD'],
            ['rainfallBasis', 'Rainfall anomaly basis'],
            ['temperatureBasis', 'Temperature anomaly basis'],
            ['source', 'Source datasets'],
          ],
          records.map((record) => {
            const history = allHistory.filter((v) => v.district === record.district),
              rain = anomaly(history, record.year, 'rainfall'),
              temp = anomaly(history, record.year, 'temperature');
            return {
              district: record.district,
              year: record.year,
              rainfall: record.values.rainfall,
              temperature: record.values.temperature,
              rainfallAnomaly: rain.value,
              temperatureAnomaly: temp.value,
              rainfallBasis: `${rain.n} prior periods; ${rain.reason}`,
              temperatureBasis: `${temp.n} prior periods; ${temp.reason}`,
              source: referenceText(record),
            };
          }),
        ),
      ],
    );
  let performanceReferences: (typeof aggregate.records)[number]['references'] = [];
  if (sectionIds.includes('forecast') || sectionIds.includes('performance')) {
    const evidence = loadedForecastEvidence(state.datasets, state.active);
    const pairs = evidence.pairs.filter(
      (p) =>
        selectedIds.has(`${normalize(p.district)}:${p.year}`) &&
        records.some(
          (v) => v.year === p.year && v.district === p.district && v.values.cases === p.observed,
        ),
    );
    const evaluated = evaluateForecasts(pairs, [...forecastModels], r.start, r.end, 'mae', true);
    limitations.push(...evidence.issues);
    performanceReferences = pairs
      .filter((p) => sectionIds.includes('performance') || p.model === r.model)
      .flatMap((p) => p.references);
    if (sectionIds.includes('forecast'))
      add(
        'forecast',
        [
          'Selected-model outputs are loaded predictions for the reporting period, not newly trained forecasts. Residual = predicted − observed. No output is synthesized when inference artifacts are unavailable.',
        ],
        [
          table(
            'Forecast inspection',
            [
              ['district', 'District'],
              ['year', 'Year'],
              ['model', 'Model'],
              ['observed', 'Observed cases'],
              ['prediction', 'Loaded prediction'],
              ['residual', 'Residual'],
              ['absoluteError', 'Absolute error'],
              ['source', 'Source datasets'],
            ],
            records.map((v) => {
              const pair = pairs.find(
                (p) => p.model === r.model && p.year === v.year && p.district === v.district,
              );
              return {
                district: v.district,
                year: v.year,
                model: r.model,
                observed: v.values.cases,
                prediction: pair?.predicted ?? null,
                residual: pair?.residual ?? null,
                absoluteError: pair?.absoluteError ?? null,
                source: referenceText(v),
              };
            }),
          ),
        ],
      );
    if (sectionIds.includes('performance')) {
      const suppliedAllowed = suppliedScope && r.start === r.end;
      const evaluations = suppliedAllowed
        ? studyEvaluations(supplied.models, r.end, [...forecastModels], 'mae')
        : evaluated.evaluations;
      add(
        'performance',
        [
          scientificInterpretation(evaluations, 'mae', evaluated.comparable),
          suppliedAllowed
            ? 'Supplied study metrics are unverified aggregates; underlying validation pairs are not connected. They are never reassigned to a district or another period.'
            : 'Calculated on common district-year validation pairs across models with available pairs. Empty model cohorts have no rank.',
        ],
        [
          table(
            'Model performance',
            [
              ['model', 'Model'],
              ['period', 'Validation period'],
              ['basis', 'Evidence basis'],
              ['n', 'Validation pairs'],
              ['mae', 'MAE'],
              ['rmse', 'RMSE'],
              ['r2', 'R²'],
              ['median', 'Median absolute error'],
              ['bias', 'Prediction bias'],
              ['rank', 'MAE rank'],
            ],
            evaluations.map((e) => ({
              model: e.model,
              period: e.period,
              basis: e.basis,
              n: e.metrics.n,
              mae: e.metrics.mae,
              rmse: e.metrics.rmse,
              r2: e.metrics.r2,
              median: e.metrics.medianAbsoluteError,
              bias: e.metrics.bias,
              rank: e.rank,
            })),
          ),
        ],
      );
    }
  }
  if (sectionIds.includes('risk'))
    add(
      'risk',
      [
        `Observed incidence categories only. LOW < ${thresholds[0]}; MODERATE ${thresholds[0]}–<${thresholds[1]}; HIGH ${thresholds[1]}–<${thresholds[2]}; VERY HIGH ≥ ${thresholds[2]}. Scenario weights are excluded.`,
        'Annual case change requires valid current cases and strictly positive cases in the immediately previous year; gaps are not bridged.',
      ],
      [
        table(
          'Observed risk analysis',
          [
            ['district', 'District'],
            ['year', 'Year'],
            ['incidence', 'Incidence / 1,000'],
            ['risk', 'Category'],
            ['change', 'Annual cases change %'],
            ['source', 'Source datasets'],
          ],
          records.map((v) => ({
            ...valueRows.find((row) => row.district === v.district && row.year === v.year)!,
            change: annualChange(
              v,
              allHistory.find((p) => p.district === v.district && p.year === v.year - 1),
            ),
          })),
        ),
      ],
    );
  if (sectionIds.includes('alerts'))
    add(
      'alerts',
      [
        'Configured rule evaluation only. Timestamp is the recorded alert creation time if present; otherwise the report analysis time is shown as an evaluation timestamp, not an asserted surveillance event time. Alert persistence and suppression follow the captured rule configuration.',
      ],
      [
        table(
          'Analytical alerts',
          [
            ['district', 'District'],
            ['year', 'Year'],
            ['severity', 'Severity'],
            ['rule', 'Exact rule'],
            ['data', 'Triggering data'],
            ['explanation', 'Explanation'],
            ['timestamp', 'Timestamp'],
            ['timestampBasis', 'Timestamp basis'],
            ['source', 'Source dataset'],
          ],
          input.alerts
            .filter((a) => selectedIds.has(`${normalize(a.district)}:${a.year}`))
            .map((a) => ({
              district: a.district,
              year: a.year,
              severity: a.severity,
              rule: a.exactRule,
              data: a.reason,
              explanation: a.explanation,
              timestamp: state.alertCreated?.[a.id] || now,
              timestampBasis: state.alertCreated?.[a.id]
                ? 'Recorded alert creation'
                : 'Report-time rule evaluation',
              source: a.sourceDataset?.name || state.active || 'Unavailable',
            })),
        ),
      ],
    );
  if (sectionIds.includes('readiness')) {
    const districts = [...new Set(records.map((v) => v.district))];
    const matrix = buildReadinessMatrix({
      datasets: state.datasets,
      active: state.active,
      year: r.end,
      model: r.model,
      checklists: state.districtChecklists || {},
      metadata: state.readinessMetadata,
      thresholds,
      records: allHistory,
    });
    const visible = matrix.districts.filter((d) => districts.includes(d.district));
    add(
      'readiness',
      [
        'End-year readiness review states. Known, Unknown, Not Connected, Derived and User-entered evidence remain separate; user-entered checklist status is not independent verification. Legacy regional checklists are excluded.',
      ],
      [
        table(
          'Readiness matrix',
          [
            ['district', 'District'],
            ['year', 'Year'],
            ['domain', 'Domain'],
            ['state', 'State'],
            ['reason', 'Reason'],
            ['trigger', 'Triggering data'],
            ['evidence', 'Evidence status'],
            ['missing', 'Missing information'],
            ['review', 'Review category'],
          ],
          visible.flatMap((d) =>
            d.cells.map((c) => ({
              district: d.district,
              year: d.year,
              domain: c.label,
              state: c.state,
              reason: c.reason,
              trigger: c.triggeringData
                .map((v) => `${v.label}: ${v.value ?? 'Unavailable'}`)
                .join('; '),
              evidence: c.evidenceStatus,
              missing: c.missingInformation.join('; '),
              review: c.suggestedReviewCategory,
            })),
          ),
        ),
        table(
          'Readiness evidence',
          [
            ['district', 'District'],
            ['year', 'Year'],
            ['group', 'Evidence group'],
            ['label', 'Evidence'],
            ['value', 'Value'],
            ['source', 'Source'],
            ['note', 'Local review note'],
          ],
          visible.flatMap((d) =>
            d.evidence.map((e) => ({
              district: d.district,
              year: d.year,
              group: e.group,
              label: e.label,
              value: e.value,
              source: e.source,
              note: e.note ?? null,
            })),
          ),
        ),
      ],
    );
  }
  const needsGeometry =
    sectionIds.includes('map') ||
    sectionIds.includes('quality') ||
    r.type === 'Spatial Analysis Report';
  const geometry = needsGeometry ? inspectIntegrityGeometry(state.geometry) : null;
  const matched = geometry?.valid
    ? matchedFeatures(
        geometry.features,
        current.map(observed).filter((v): v is Row => v !== null),
      )
    : [];
  const map = {
    year: r.end,
    bounds: geometry?.valid ? geometryBounds(geometry.features) : null,
    features: matched.map(({ feature, row }) => ({
      district: feature.properties.district || feature.properties.name,
      code: featureIdentity(feature),
      geometry: feature.geometry,
      cases: row?.cases ?? null,
      risk: category(
        row
          ? current.find((v) => normalize(v.district) === normalize(row.district))
            ? incidence360(current.find((v) => normalize(v.district) === normalize(row.district)))
            : null
          : null,
        thresholds,
      ),
    })),
    error: geometry?.error ?? null,
    source: state.geometrySource ?? null,
  };
  if (sectionIds.includes('map'))
    add(
      'map',
      [
        `Static end-year administrative map snapshot, observed burden. Unmatched or filtered-out districts have no value (gray). ${matched.filter((m) => m.row).length} matched districts; ${matched.length} administrative polygons.`,
        `Geometry source: ${state.geometrySource?.name ?? 'No versioned geometry source'}. ${geometry?.error ?? 'Validated administrative polygon structure; source accuracy is not independently audited.'}`,
      ],
      [
        table(
          'GIS matches',
          [
            ['district', 'District'],
            ['cases', 'Observed cases'],
            ['risk', 'Observed incidence category'],
          ],
          map.features.map((f) => ({ district: String(f.district), cases: f.cases, risk: f.risk })),
        ),
      ],
    );
  if (r.type === 'Spatial Analysis Report') {
    const spatialTables: ReportTable[] = [],
      text: string[] = [];
    const usable = matched.filter((m) => m.row && Number.isFinite(m.row.cases));
    try {
      if (!geometry?.valid) throw Error(geometry?.error || 'No valid administrative geometry');
      const names = usable.map((m) => m.row!.district),
        ids = usable.map((m) => featureIdentity(m.feature));
      const result = moran(
        {
          names,
          values: usable.map((m) => m.row!.cases),
          neighbors: ids.map((id) =>
            (geometry.neighbors[id] || []).map((n) => ids.indexOf(n)).filter((i) => i >= 0),
          ),
        },
        999,
        r.end,
      );
      text.push(
        result.method,
        `Global permutation p-value ${result.pValue}; ${result.pValue < 0.05 ? 'below' : 'not below'} the exploratory 0.05 threshold. This does not establish causation or validated local hotspots.`,
      );
      spatialTables.push(
        table(
          'Loaded spatial analysis',
          [
            ['year', 'Year'],
            ['districts', 'Matched cohort'],
            ['moran', 'Moran I'],
            ['expected', 'Expected I'],
            ['p', 'Permutation p-value'],
            ['permutations', 'Permutations'],
            ['seed', 'Seed'],
          ],
          [
            {
              year: r.end,
              districts: result.n,
              moran: result.observed,
              expected: result.expected,
              p: result.pValue,
              permutations: result.permutations,
              seed: result.seed,
            },
          ],
        ),
      );
    } catch (e) {
      text.push(
        `Loaded spatial calculation unavailable: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (suppliedScope && supplied.spatial?.year >= r.start && supplied.spatial?.year <= r.end) {
      text.push(
        'Separate supplied study output — not calculated from this map or current district observations. Not independently verified. Underlying spatial cohort and permutation design are not connected.',
      );
      spatialTables.push(
        table(
          'Supplied spatial evidence',
          [
            ['year', 'Study year'],
            ['districts', 'Study districts'],
            ['moran', 'Supplied Moran I'],
            ['p', 'Supplied p-value'],
            ['source', 'Source'],
          ],
          [
            {
              year: supplied.spatial.year,
              districts: supplied.spatial.districts,
              moran: supplied.spatial.moranI,
              p: supplied.spatial.pValue,
              source: supplied.spatial.source,
            },
          ],
        ),
      );
    }
    // Spatial calculation belongs to this report type and is explicitly selected by its overview section.
    if (sectionIds.includes('overview')) {
      const overview = sections.find((s) => s.id === 'overview')!;
      overview.paragraphs.push(...text);
      overview.tables.push(...spatialTables);
    }
  }
  if (sectionIds.includes('quality')) {
    const reports = state.datasets.map((d) =>
      inspectDataset(d, geometry!, { year: r.end, model: r.model, now }),
    );
    add(
      'quality',
      [
        'Whole-registry source audit. All original source rows are inspected, including rows outside the report period or district filters. Score = Σ(component percent / 100 × fixed weight); unavailable components contribute 0, without weight redistribution. This scope prevents filters from hiding missing data.',
      ],
      [
        table(
          'Dataset health',
          [
            ['dataset', 'Dataset'],
            ['rows', 'Audited source rows'],
            ['score', 'Quality score /100'],
            ['status', 'Validation status'],
            ['basis', 'Source basis'],
          ],
          reports.map((q) => ({
            dataset: q.dataset.name,
            rows: q.rowCount,
            score: q.score,
            status: q.status,
            basis: q.sourceBasis,
          })),
        ),
        table(
          'Quality score calculation',
          [
            ['dataset', 'Dataset'],
            ['component', 'Component'],
            ['numerator', 'Numerator'],
            ['denominator', 'Denominator'],
            ['weight', 'Fixed weight %'],
            ['contribution', 'Score contribution'],
            ['definition', 'Definition'],
          ],
          reports.flatMap((q) =>
            q.scoreComponents.map((c) => ({
              dataset: q.dataset.name,
              component: c.name,
              numerator: c.numerator,
              denominator: c.denominator,
              weight: c.weight,
              contribution: c.contribution,
              definition: c.definition,
            })),
          ),
        ),
        table(
          'Data quality issues',
          [
            ['dataset', 'Dataset'],
            ['row', 'Source row'],
            ['field', 'Field'],
            ['severity', 'Severity'],
            ['issue', 'Issue'],
            ['action', 'Suggested corrective action'],
          ],
          reports.flatMap((q) =>
            q.issues.map((i) => ({
              dataset: i.dataset,
              row: i.row,
              field: i.field,
              severity: i.severity,
              issue: i.issue,
              action: i.action,
            })),
          ),
        ),
        table(
          'Analysis eligibility',
          [
            ['dataset', 'Dataset'],
            ['analysis', 'Analysis'],
            ['eligible', 'Eligible'],
            ['reasons', 'Reasons'],
          ],
          reports.flatMap((q) =>
            q.eligibility.map((e) => ({
              dataset: q.dataset.name,
              analysis: e.analysis,
              eligible: e.eligible ? 'YES' : 'NO',
              reasons: e.reasons.join('; '),
            })),
          ),
        ),
      ],
    );
  }
  const provenanceRows: Record<string, Cell>[] = versions.map((v) => ({
    dataset: v.name,
    id: v.id,
    source: v.source,
    version: v.checksum,
    status: v.classification,
    created: v.created,
    scope: 'Loaded registry',
  }));
  if (suppliedScope)
    for (const [name, meta] of Object.entries(supplied.provenance ?? {}))
      if (name !== 'boundaries.geojson')
        provenanceRows.push({
          dataset: name,
          id: name,
          source: meta.source ?? 'Unavailable',
          version: meta.sha256 ?? 'Unavailable',
          status: meta.classification ?? 'UNVERIFIED',
          created: meta.retrieved ?? null,
          scope: 'Separate supplied study evidence',
        });
  if (map.source)
    provenanceRows.push({
      dataset: map.source.name,
      id: 'geometry',
      source: map.source.name,
      version: map.source.checksum,
      status: map.source.classification,
      created: map.source.created,
      scope: 'Administrative geometry',
    });
  const usedFields = new Set<string>();
  if (
    sectionIds.some((id) =>
      [
        'overview',
        'indicators',
        'district',
        'map',
        'trend',
        'risk',
        'alerts',
        'readiness',
        'forecast',
        'performance',
      ].includes(id),
    )
  )
    usedFields.add('cases');
  if (
    sectionIds.some((id) => ['indicators', 'district', 'map', 'risk', 'readiness'].includes(id))
  ) {
    usedFields.add('population');
    usedFields.add('incidence');
  }
  if (sectionIds.includes('climate')) {
    usedFields.add('rainfall');
    usedFields.add('temperature');
  }
  if (sectionIds.includes('forecast')) usedFields.add('prediction');
  const contributingDistricts = new Set(records.map((v) => v.district));
  const references = [
    ...allHistory
      .filter((v) => contributingDistricts.has(v.district))
      .flatMap((record) =>
        record.references.filter((ref) => {
          if (!ref.selected || !usedFields.has(ref.field)) return false;
          if (record.year >= r.start) return true;
          if (sectionIds.includes('climate') && ['rainfall', 'temperature'].includes(ref.field))
            return true;
          return (
            sectionIds.some((id) => ['risk', 'readiness'].includes(id)) &&
            record.year >= r.start - 1 &&
            ['cases', 'population', 'incidence'].includes(ref.field)
          );
        }),
      ),
    ...performanceReferences,
  ];
  const uniqueReferences = [
    ...new Map(
      references.map((ref) => [
        `${ref.datasetId}:${ref.district}:${ref.year}:${ref.field}:${ref.value}`,
        ref,
      ]),
    ).values(),
  ];
  add(
    'provenance',
    [
      'Always included. Version values are source checksums; a checksum identifies content, not scientific verification. The field evidence ledger includes selected analytical variables and historical inputs used for anomalies and annual change. Sources outside the period are reference context, not report-period observations.',
    ],
    [
      table(
        'Data provenance',
        [
          ['dataset', 'Dataset'],
          ['source', 'Source'],
          ['version', 'Dataset version / checksum'],
          ['status', 'Verification status'],
          ['created', 'Source registration date'],
          ['scope', 'Scope'],
        ],
        provenanceRows,
      ),
      table(
        'Selected field evidence',
        [
          ['district', 'District'],
          ['year', 'Year'],
          ['field', 'Field'],
          ['value', 'Value'],
          ['source', 'Source dataset'],
          ['version', 'Checksum'],
          ['status', 'Verification status'],
        ],
        uniqueReferences.map((ref) => ({
          district: ref.district,
          year: ref.year,
          field: ref.field,
          value: ref.value,
          source: ref.dataset,
          version: ref.checksum,
          status: ref.classification,
        })),
      ),
    ],
  );
  add('limitations', [...new Set(limitations)]);
  return structuredClone({
    schema: 'malariascope-research-report-v1',
    disclaimer: reportDisclaimer,
    metadata: {
      title: r.title.trim(),
      type: r.type,
      period: { start: r.start, end: r.end },
      district: r.district,
      generatedAt: now,
      analysisDate: now,
      displayTimezone: 'Asia/Bangkok',
      dataVersion: versions,
      suppliedDataVersions: suppliedScope
        ? Object.entries(supplied.provenance ?? {})
            .filter(([name]) => name !== 'boundaries.geojson')
            .map(([name, meta]) => ({
              name,
              checksum: meta.sha256 ?? null,
              source: meta.source ?? null,
              classification: meta.classification ?? 'UNVERIFIED',
            }))
        : [],
      analyticalConfiguration: {
        model: r.model,
        incidenceThresholds: thresholds,
        riskMethod: 'Observed incidence only',
        forecastMetric: 'MAE',
        forecastCohort: 'Common loaded validation pairs',
        spatialPermutations: 999,
        spatialSeed: r.end,
        scenarioOutputsExcluded: true,
        alertRules: sectionIds.includes('alerts') ? state.rules : [],
      },
      selectedFilters: {
        district: r.district,
        start: r.start,
        end: r.end,
        model: r.model,
        risk: r.risk,
        region: r.region,
      },
      activeDataset: state.active,
    },
    sections: sections.sort(
      (a, b) =>
        reportSections.findIndex(([id]) => id === a.id) -
        reportSections.findIndex(([id]) => id === b.id),
    ),
    map: sectionIds.includes('map') ? map : null,
    trend: sectionIds.includes('trend') ? trend : null,
    selectedSections: sectionIds,
    knownLimitations: [...new Set(limitations)],
  });
}
export type ResearchReport = ReturnType<typeof buildResearchReport>;
export function reportCSV(report: ResearchReport) {
  const encode = (value: Cell) => {
    if (value === null) return '';
    if (typeof value === 'number') return String(value);
    const safe = /^\s*[=+@-]/.test(value) ? "'" + value : value;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const columns = ['section', 'table', 'record', 'district', 'year', 'field', 'value'];
  const rows: Cell[][] = [
    [
      'Metadata',
      'Report metadata',
      1,
      null,
      null,
      'Research-prototype disclaimer',
      report.disclaimer,
    ],
    ['Metadata', 'Report metadata', 2, null, null, 'Report title', report.metadata.title],
    ['Metadata', 'Report metadata', 3, null, null, 'Analysis date', report.metadata.analysisDate],
    [
      'Metadata',
      'Report metadata',
      4,
      null,
      null,
      'Selected filters',
      JSON.stringify(report.metadata.selectedFilters),
    ],
    [
      'Metadata',
      'Report metadata',
      5,
      null,
      null,
      'Analytical configuration',
      JSON.stringify(report.metadata.analyticalConfiguration),
    ],
  ];
  report.knownLimitations.forEach((limit, index) =>
    rows.push(['Limitations', 'Known limitations', index + 1, null, null, 'Limitation', limit]),
  );
  for (const section of report.sections)
    for (const t of section.tables)
      t.rows.forEach((row, index) => {
        for (const col of t.columns)
          rows.push([
            section.title,
            t.title,
            index + 1,
            row.district ?? null,
            row.year ?? null,
            col.label,
            row[col.key] ?? null,
          ]);
      });
  return [columns.join(','), ...rows.map((row) => row.map(encode).join(','))].join('\r\n');
}
