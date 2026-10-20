export const referenceVersion = 'research-brief-2026-10-21-v1';
export const referenceStatus = 'BRIEF-REPORTED · PRIMARY DOCUMENTS NOT REVIEWED';
export const referenceCitation =
  'User-supplied MALARIASCOPE Research Intelligence master brief, sections 2 and 6–12; received 21 October 2026. Named primary documents were not attached.';
export const indicatorDefinitions = [
  {
    field: 'cases',
    name: 'Recorded malaria episodes',
    definition: 'Source-reported annual episodes in the selected district cohort',
    unit: 'episodes/year',
    denominator: 'None; count is not a population-adjusted rate',
    kind: 'Supplied observed extraction',
  },
  {
    field: 'observedApi',
    name: 'Reported annual parasite incidence',
    definition: 'Source-supplied annual episodes per 1,000 source-defined at-risk residents',
    unit: 'episodes per 1,000 at-risk residents/year',
    denominator: 'Source-defined 2025 at-risk population; not preceding-year general population',
    kind: 'Supplied indicator',
  },
  {
    field: 'population',
    name: 'Population at risk',
    definition: 'Denominator supplied with the 2025 snapshot only',
    unit: 'at-risk residents',
    denominator: 'Not applicable',
    kind: 'Supplied denominator',
  },
  {
    field: 'recalculatedApi',
    name: 'Recalculated observed API',
    definition: 'Recorded episodes / same-year available at-risk population × 1,000',
    unit: 'episodes per 1,000 at-risk residents/year',
    denominator: 'Same district and year only; unavailable before 2025',
    kind: 'Derived; separate from rounded reported API',
  },
  {
    field: 'rainfall',
    name: 'Annual rainfall',
    definition:
      'Supplied annual district-centroid aggregate; raw monthly conversion not independently reproduced',
    unit: 'mm/year',
    denominator: 'Annual source aggregation',
    kind: 'Supplied environmental aggregate',
  },
  {
    field: 'temperature',
    name: 'Annual mean temperature',
    definition: 'Supplied annual district-centroid feature',
    unit: '°C',
    denominator: 'Day weighting described in the brief; raw monthly records unavailable',
    kind: 'Supplied environmental aggregate',
  },
  {
    field: 'humidity',
    name: 'Annual relative humidity',
    definition: 'Supplied annual district-centroid feature',
    unit: '%',
    denominator: 'Day weighting described in the brief; raw monthly records unavailable',
    kind: 'Supplied environmental aggregate',
  },
] as const;
export const primaryDocuments = [
  'MALARIASCOPE_AMMM2026_Full_Paper(1).docx',
  'ABSTRACT_FINAL_MALARIASCOPE_ DEVELOPMENT AND TEMPORAL VALIDATION OF MACHINE LEARNING AND GEOSPATIAL MALARIA INTELLIGENCE FOR FORCE HEALTH PROTECTION IN INDONESIAN PAPUA(1).docx',
  'MALARIASCOPE_FINAL(3).pptx',
];
export const scopes = [
  {
    id: 'panel',
    name: 'Eight-district modeling panel',
    definition:
      'Balanced annual district outcomes, 2020–2025; Supiori excluded. Geographic membership follows the supplied study registry, not an asserted current-province crosswalk.',
    level: 'Study ADM2 cohort',
    period: '2020–2025',
    source: 'surveillance-balanced-2020-2025.csv',
    available: true,
  },
  {
    id: 'snapshot',
    name: 'Nine-unit 2025 observed snapshot',
    definition:
      'Independent descriptive 2025 snapshot including Supiori; never appended to the balanced modeling panel.',
    level: 'Study ADM2 snapshot',
    period: '2025 only',
    source: 'surveillance-2025-all-nine.csv',
    available: true,
  },
  {
    id: 'papua-context',
    name: 'Six-province Indonesian Papua context',
    definition:
      'Wider regional contextual reporting; no compatible six-province row-level dataset or denominator is connected.',
    level: 'Six-province context',
    period: 'Source-dependent; unconnected',
    source: null,
    available: false,
  },
  {
    id: 'history',
    name: 'Historical national / regional publications',
    definition:
      'Historical narrative periods remain unresolved: 2011–2020 versus 2010–2019. These publications are not the annual forecasting panel.',
    level: 'Publication-defined scope',
    period: 'Unresolved historical period',
    source: null,
    available: false,
  },
  {
    id: 'asean',
    name: 'ASEAN geographic context',
    definition:
      'Eleven country boundaries are available for exploration. Country-level surveillance and external validation of the Papua model are not established.',
    level: 'ADM0 context',
    period: 'No connected surveillance period',
    source: 'asean-metadata.json',
    available: false,
  },
] as const;
export type ScopeId = (typeof scopes)[number]['id'];
export const modelKeys = {
  Persistence: 'persistence',
  'Ridge Regression — no climate': 'ridge_no_climate',
  'Ridge Regression': 'ridge_climate',
  'Random Forest': 'random_forest',
  'Gradient Boosting': 'gradient_boosting',
} as const;
export type StudyModel = keyof typeof modelKeys;
export type Metric = 'mae' | 'rmse' | 'r2';
export const benchmarkReferences = [
  {
    model: 'Persistence',
    validation: { mae: 10750.5, rmse: 13321.8, r2: null },
    test: { mae: 10425.5, rmse: 17906.7, r2: 0.4 },
  },
  {
    model: 'Ridge Regression — no climate',
    validation: { mae: 12091.9, rmse: 14413.4, r2: null },
    test: { mae: 12676.4, rmse: 17270.4, r2: 0.442 },
  },
  {
    model: 'Ridge Regression',
    validation: { mae: 12167.7, rmse: 14325.3, r2: null },
    test: { mae: 12787.2, rmse: 17239.7, r2: 0.444 },
  },
  {
    model: 'Random Forest',
    validation: { mae: 11059.8, rmse: 14182.3, r2: null },
    test: { mae: 12690.3, rmse: 18502, r2: 0.36 },
  },
  {
    model: 'Gradient Boosting',
    validation: { mae: 12281.7, rmse: 15239, r2: null },
    test: { mae: 13271.7, rmse: 18871.3, r2: 0.334 },
  },
] as const;
export const reportedAssociations = {
  rainfall: { rho: -0.57, interval: [-0.736, -0.232], unit: 'mm/year' },
  temperature: { rho: -0.05, interval: null, unit: '°C' },
  humidity: { rho: -0.111, interval: null, unit: '%' },
} as const;
export const reconciliationTasks = [
  {
    id: 'PRIMARY_DOCUMENTS_MISSING',
    issue: 'The paper, abstract and slides named in the brief were not attached.',
    impact: 'New numerical references cannot be checked against the primary full paper.',
    required:
      'Review the actual documents, source tables and publication versions; retain brief-reported status until then.',
  },
  {
    id: 'HISTORICAL_PERIOD',
    issue: 'Manuscript narrative: 2011–2020; dataset-characteristics table: 2010–2019.',
    impact: 'Historical periods cannot be treated as a single canonical series.',
    required: 'Reconcile the original reports and manuscript definitions.',
  },
  {
    id: 'ABSTRACT_CONTEXT_PERIOD',
    issue:
      'The brief reports an abstract title spanning 2011–2026; forecasting outcomes end in 2025.',
    impact: '2026 contextual partial-year reporting is not a held-out annual outcome.',
    required:
      'Inspect the original abstract and distinguish publication context from complete outcome years.',
  },
  {
    id: 'GEOGRAPHIC_MEMBERSHIP',
    issue:
      'The brief calls the panel current Papua Province; existing artifacts identify Papua study districts.',
    impact:
      'Do not assert a current-province administrative crosswalk or merge six-province context.',
    required: 'Confirm the study geography and time-valid official administrative identifiers.',
  },
  {
    id: 'CLIMATE_PREPROCESSING',
    issue:
      'NASA POWER monthly 2019–2025 extraction and raw units are described in the brief, but only annual 2020–2025 extracts are connected.',
    impact:
      'Monthly precipitation conversions, day weighting and 2019 raw features cannot be independently reproduced.',
    required:
      'Supply monthly source records, parameter units, centroid definitions, retrieval metadata and transformations.',
  },
] as const;
export const climateMethod = {
  provider: 'NASA POWER, as described in the brief; original monthly extraction unavailable',
  rawPeriod: '2019–2025 monthly centroid observations (brief description)',
  connectedPeriod: '2020–2025 annual supplied climate features',
  precipitation:
    'Convert a verified monthly mean daily precipitation rate in mm/day to monthly mm using the actual number of days, then sum complete monthly totals. Check the original parameter/unit before conversion.',
  temperatureHumidity:
    'Annual mean = sum(monthly mean × calendar days) / total observed calendar days, only after checking complete monthly coverage and source units.',
  limitation:
    'No raw monthly climate records or monthly malaria outcomes are supplied. Reported correlations are ecological, not causal effects.',
};
