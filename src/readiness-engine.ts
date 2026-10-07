import { normalize } from './analytics.ts';
import {
  aggregateEvidence,
  readinessDomains,
  type EvidenceDataset,
  type Record360,
  type Reference,
} from './district-intelligence.ts';
import { defaultResearchModel, observedRiskInput } from './risk-engine.ts';
import { inspectScientificIntegrity } from './scientific-integrity.ts';
export const readinessStates = ['READY', 'REVIEW', 'ATTENTION', 'INSUFFICIENT DATA'] as const;
export const checklistStates = [
  'NOT REVIEWED',
  'AVAILABLE',
  'LIMITED',
  'UNAVAILABLE',
  'NOT APPLICABLE',
] as const;
export type ChecklistState = (typeof checklistStates)[number];
export const readinessDomainDefinitions = [
  {
    id: 'surveillance',
    label: 'Surveillance awareness',
    legacy: 'Surveillance awareness',
    category: 'Surveillance evidence review',
  },
  {
    id: 'diagnostics',
    label: 'Diagnostics',
    legacy: 'Diagnostic-resource review',
    category: 'Diagnostic evidence review',
  },
  {
    id: 'prevention',
    label: 'Prevention resources',
    legacy: 'Preventive-resource planning',
    category: 'Prevention documentation review',
  },
  {
    id: 'staffing',
    label: 'Staffing preparedness',
    legacy: 'Staffing preparedness',
    category: 'Staffing documentation review',
  },
  {
    id: 'referral',
    label: 'Referral readiness',
    legacy: 'Referral preparedness',
    category: 'Referral documentation review',
  },
  {
    id: 'evacuation',
    label: 'Evacuation preparedness',
    legacy: 'Evacuation preparedness',
    category: 'Evacuation documentation review',
  },
  {
    id: 'communication',
    label: 'Communication preparedness',
    legacy: 'Communication preparedness',
    category: 'Communication documentation review',
  },
  {
    id: 'data',
    label: 'Data readiness',
    legacy: 'Data readiness',
    category: 'Data quality and provenance review',
  },
] as const;
export type ReadinessDomain = (typeof readinessDomainDefinitions)[number]['id'];
export const readinessPolicy = Object.freeze({
  version: 1,
  highBurdenCases: 20000,
  highBurdenOperator: '>',
  diagnosticAttention:
    'Elevated observed burden or incidence, with unconfirmed diagnostic checklist availability. A rise uses adjacent observed incidence values only.',
});
export type ChecklistMetadata = { status: string; note: string; updatedAt: string };
export type ReadinessMetadata = Record<string, Record<string, ChecklistMetadata>>;
export const readinessChecklistKey = (district: string, year: number) =>
  `${normalize(district)}:${year}`;
export function safeChecklistState(value: unknown): ChecklistState {
  return checklistStates.includes(value as ChecklistState)
    ? (value as ChecklistState)
    : 'NOT REVIEWED';
}
export type EvidenceGroup = 'Known' | 'Unknown' | 'Not Connected' | 'Derived' | 'User-entered';
export type ReadinessEvidence = {
  group: EvidenceGroup;
  label: string;
  value: number | string | null;
  unit?: string;
  year: number;
  source: string;
  references: Reference[];
  note?: string;
  updatedAt?: string | null;
};
const validCases = (record: Record360 | undefined) =>
  record?.values.cases !== null &&
  record?.values.cases !== undefined &&
  Number.isSafeInteger(record.values.cases) &&
  record.values.cases >= 0
    ? record.values.cases
    : null;
const ratio = (record: Record360 | undefined) => {
  if (!record) return null;
  const value = observedRiskInput(record).value;
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
};
export function assessDistrictReadiness(input: {
  district: string;
  year: number;
  current?: Record360;
  previous?: Record360;
  checklist?: Record<string, string>;
  metadata?: Record<string, ChecklistMetadata>;
  thresholds?: readonly number[];
  sourceQualityIssues?: string[];
}) {
  const { district, year } = input,
    current = input.current?.year === year ? input.current : undefined,
    previous = input.previous?.year === year - 1 ? input.previous : undefined,
    checklist = input.checklist || {},
    metadata = input.metadata || {};
  const thresholds =
    input.thresholds?.length === 3 &&
    input.thresholds.every(
      (n, i) => Number.isFinite(n) && n >= 0 && (i === 0 || n > input.thresholds![i - 1]),
    )
      ? [...input.thresholds]
      : [...defaultResearchModel.thresholds];
  const cases = validCases(current),
    previousCases = validCases(previous),
    incidence = ratio(current),
    previousIncidence = ratio(previous),
    population =
      current?.values.population !== null &&
      current?.values.population !== undefined &&
      Number.isFinite(current.values.population) &&
      current.values.population > 0
        ? current.values.population
        : null;
  const casesChange =
    cases !== null && previousCases !== null && previousCases > 0
      ? ((cases - previousCases) / previousCases) * 100
      : null;
  const incidenceChange =
    incidence !== null && previousIncidence !== null && previousIncidence > 0
      ? ((incidence - previousIncidence) / previousIncidence) * 100
      : null;
  const risingIncidence =
    incidence !== null && previousIncidence !== null && incidence > previousIncidence;
  const highBurden = cases !== null && cases > readinessPolicy.highBurdenCases,
    highIncidence = incidence !== null && incidence >= thresholds[1];
  const currentReferences = current?.references.filter((ref) => ref.selected) || [],
    previousReferences = previous?.references.filter((ref) => ref.selected) || [];
  const sourceIssues = [
    ...new Set([...(current?.issues || []), ...(input.sourceQualityIssues || [])]),
  ];
  const evidence: ReadinessEvidence[] = [];
  function valueEvidence(
    label: string,
    value: number | null,
    unit: string,
    refs: Reference[],
    period = year,
  ) {
    evidence.push({
      group: value === null ? 'Unknown' : 'Known',
      label,
      value,
      unit,
      year: period,
      source: refs.length ? 'Loaded source records' : 'Required source information unavailable',
      references: refs,
    });
  }
  valueEvidence(
    'Observed malaria cases',
    cases,
    'cases',
    currentReferences.filter((ref) => ref.field === 'cases'),
  );
  valueEvidence(
    'Population',
    population,
    'people',
    currentReferences.filter((ref) => ref.field === 'population'),
  );
  valueEvidence(
    'Previous observed malaria cases',
    previousCases,
    'cases',
    previousReferences.filter((ref) => ref.field === 'cases'),
    year - 1,
  );
  valueEvidence(
    'Source-supplied incidence',
    current?.values.incidence ?? null,
    'per 1,000',
    currentReferences.filter((ref) => ref.field === 'incidence'),
  );
  const incidenceReferences = current ? observedRiskInput(current).references : [];
  const previousIncidenceReferences = previous ? observedRiskInput(previous).references : [];
  const caseReferences = currentReferences.filter((ref) => ref.field === 'cases');
  const previousCaseReferences = previousReferences.filter((ref) => ref.field === 'cases');
  const derived = (
    label: string,
    value: number | string | null,
    unit?: string,
    references: Reference[] = incidenceReferences,
    period = year,
  ) =>
    evidence.push({
      group: value === null ? 'Unknown' : 'Derived',
      label,
      value,
      unit,
      year: period,
      source: 'Deterministic calculation from loaded source fields',
      references,
    });
  derived('Observed incidence', incidence, 'per 1,000');
  derived(
    'Previous observed incidence',
    previousIncidence,
    'per 1,000',
    previousIncidenceReferences,
    year - 1,
  );
  derived('Case year-over-year change', casesChange, '%', [
    ...caseReferences,
    ...previousCaseReferences,
  ]);
  derived('Incidence year-over-year change', incidenceChange, '%', [
    ...incidenceReferences,
    ...previousIncidenceReferences,
  ]);
  derived(
    'High retrospective burden',
    cases === null ? null : highBurden ? 'YES' : 'NO',
    undefined,
    caseReferences,
  );
  derived('High observed incidence', incidence === null ? null : highIncidence ? 'YES' : 'NO');
  derived(
    'Rising adjacent incidence',
    incidence === null || previousIncidence === null ? null : risingIncidence ? 'YES' : 'NO',
    undefined,
    [...incidenceReferences, ...previousIncidenceReferences],
  );
  derived(
    'Unresolved source conflict / quality errors',
    currentReferences.length ? sourceIssues.length : null,
    'notes',
    [],
  );
  const cells = readinessDomainDefinitions.map((domain) => {
    const items = readinessDomains[domain.legacy].map((item) => {
      const status = safeChecklistState(checklist[item]),
        entry = metadata[item],
        validMetadata = entry?.status === status;
      return {
        item,
        status,
        note: validMetadata ? entry.note : '',
        updatedAt: validMetadata ? entry.updatedAt : null,
      };
    });
    const active = items.filter((item) => item.status !== 'NOT APPLICABLE'),
      gaps = active.filter((item) => item.status === 'LIMITED' || item.status === 'UNAVAILABLE'),
      unreviewed = active.filter((item) => item.status === 'NOT REVIEWED'),
      available = active.filter((item) => item.status === 'AVAILABLE'),
      anyEntry = items.some((item) => item.status !== 'NOT REVIEWED' || item.note);
    const missingInformation = [
      `An independent ${domain.label.toLowerCase()} evidence source is not connected; local checklist entries are not external verification.`,
      ...unreviewed.map((item) => `${item.item}: availability or review status is not documented.`),
    ];
    if (domain.id === 'surveillance' && (cases === null || incidence === null))
      missingInformation.push(
        'Selected-year observed cases and a valid incidence denominator or supplied ratio.',
      );
    if (domain.id === 'data') {
      if (cases === null) missingInformation.push('Valid selected-year observed malaria cases.');
      if (population === null)
        missingInformation.push('A documented positive population denominator.');
      if (
        !currentReferences.length ||
        currentReferences.some((ref) => !ref.checksum || !ref.source)
      )
        missingInformation.push('Contributing source provenance and checksum.');
    }
    const contextUsed =
      domain.id === 'surveillance' || domain.id === 'diagnostics' || domain.id === 'data';
    const triggeringData: ReadinessEvidence[] = contextUsed
      ? evidence
          .filter(
            (entry) =>
              entry.group === 'Known' || entry.group === 'Derived' || entry.group === 'Unknown',
          )
          .map((entry) => ({ ...entry }))
      : [];
    triggeringData.push(
      ...items.map((item) => ({
        group:
          item.status === 'NOT REVIEWED' && !item.note
            ? ('Unknown' as const)
            : ('User-entered' as const),
        label: item.item,
        value: item.status,
        year,
        source: 'Local district-year checklist; not an independently verified resource feed',
        references: [],
        note: item.note,
        updatedAt: item.updatedAt,
      })),
    );
    let state: (typeof readinessStates)[number], reason: string, rule: string;
    if (gaps.length) {
      state = 'ATTENTION';
      rule = 'R1: at least one applicable local item is LIMITED or UNAVAILABLE';
      reason = `Local checklist records ${gaps.map((item) => `${item.item}: ${item.status}`).join('; ')}. This is a documented evidence gap requiring human review.`;
    } else if (domain.id === 'diagnostics' && (highBurden || highIncidence) && unreviewed.length) {
      state = 'ATTENTION';
      rule = 'R2: elevated observed burden or incidence AND unconfirmed diagnostic checklist items';
      reason = `${highBurden ? `High retrospective malaria burden (${cases} cases > ${readinessPolicy.highBurdenCases})` : `High observed incidence (${incidence} per 1,000 ≥ ${thresholds[1]})`}${risingIncidence ? ` and rising adjacent incidence (${previousIncidence} → ${incidence} per 1,000)` : ''} are present, while diagnostic-resource availability is not connected to a resource dataset and ${unreviewed.length} diagnostic checklist item(s) remain unreviewed.`;
    } else if (
      (domain.id === 'surveillance' && (cases === null || incidence === null)) ||
      (domain.id === 'data' &&
        (cases === null ||
          population === null ||
          !currentReferences.length ||
          currentReferences.some((ref) => !ref.checksum || !ref.source)))
    ) {
      state = 'INSUFFICIENT DATA';
      rule = 'R3: required surveillance or data-provenance inputs unavailable';
      reason =
        'Required observed evidence is unavailable; local checklist entries cannot establish completeness of missing source data.';
    } else if ((domain.id === 'surveillance' || domain.id === 'data') && sourceIssues.length > 0) {
      state = 'REVIEW';
      rule = 'R4: selected-year source conflict or data-quality issue present';
      reason = `${sourceIssues.length} source conflict or data-quality note(s) remain visible. Local checklist completion does not resolve source discrepancies.`;
    } else if (active.length > 0 && available.length === active.length) {
      state = 'READY';
      rule = 'R5: every applicable checklist item is explicitly AVAILABLE';
      reason = `All ${active.length} applicable item(s) are locally marked AVAILABLE${items.length > active.length ? `; ${items.length - active.length} item(s) are explicitly NOT APPLICABLE` : ''}. READY describes documented checklist completion, not independently verified resource capacity.`;
    } else if (!active.length) {
      state = 'INSUFFICIENT DATA';
      rule = 'R6: all checklist items are NOT APPLICABLE';
      reason =
        'All items are marked NOT APPLICABLE; no applicable readiness evidence exists from which to establish READY.';
      missingInformation.push('An applicable assessment basis for this domain.');
    } else if (
      anyEntry ||
      ((domain.id === 'surveillance' || domain.id === 'data') && cases !== null)
    ) {
      state = 'REVIEW';
      rule = 'R7: partial local checklist or available observed context awaiting review';
      reason = anyEntry
        ? `${available.length}/${active.length} applicable items are locally marked AVAILABLE; the remaining evidence needs review.`
        : 'Loaded observed context is available, but district-year checklist reviews are not completed.';
    } else {
      state = 'INSUFFICIENT DATA';
      rule = 'R8: no applicable documented resource readiness evidence';
      reason =
        'Resource readiness evidence is not connected and the local checklist is unreviewed. Availability is not inferred from malaria burden.';
    }
    const entriesRecorded = items.filter(
      (item) => item.status !== 'NOT REVIEWED' || item.note,
    ).length;
    const evidenceStatus = `${contextUsed && currentReferences.length ? 'Loaded surveillance context; ' : ''}${contextUsed && (incidence !== null || cases !== null) ? 'deterministically derived context; ' : ''}${entriesRecorded ? `${entriesRecorded} user-entered checklist item(s); ` : ''}resource-feed availability not independently connected or verified`;
    return {
      domain: domain.id,
      label: domain.label,
      legacy: domain.legacy,
      state,
      reason,
      rule,
      triggeringData,
      evidenceStatus,
      missingInformation,
      suggestedReviewCategory: domain.category,
      items,
    };
  });
  for (const cell of cells) {
    evidence.push({
      group: 'Not Connected',
      label: `${cell.label}: independent readiness evidence source`,
      value: 'No district-year resource/assessment feed is connected',
      year,
      source: 'This application has no connected readiness resource registry for this domain',
      references: [],
    });
    for (const item of cell.items) {
      if (item.status === 'NOT REVIEWED')
        evidence.push({
          group: 'Unknown',
          label: item.item,
          value: null,
          year,
          source: 'Readiness availability/review has not been documented',
          references: [],
        });
      if (item.status !== 'NOT REVIEWED' || item.note)
        evidence.push({
          group: 'User-entered',
          label: item.item,
          value: item.status,
          year,
          source: 'Local district-year checklist',
          references: [],
          note: item.note,
          updatedAt: item.updatedAt,
        });
    }
  }
  return {
    district,
    year,
    cells,
    evidence,
    context: {
      cases,
      population,
      incidence,
      previousCases,
      previousIncidence,
      casesChange,
      incidenceChange,
      risingIncidence,
      highBurden,
      highIncidence,
    },
    policy: { ...readinessPolicy, incidenceThresholds: thresholds },
    sourceIssues,
    sourceVerification:
      currentReferences.length &&
      currentReferences.every((ref) => ref.classification === 'VERIFIED')
        ? 'Contributing inputs labeled VERIFIED by registry; not independently audited'
        : 'Inputs missing or not all labeled VERIFIED; local checklist entries remain User-entered',
  };
}
export type DistrictReadiness = ReturnType<typeof assessDistrictReadiness>;
export function buildReadinessMatrix(input: {
  datasets: EvidenceDataset[];
  active: string;
  year: number;
  model: string;
  checklists: Record<string, Record<string, string>>;
  metadata?: ReadinessMetadata;
  manualDistricts?: string[];
  thresholds?: readonly number[];
  records?: Record360[];
}) {
  const joined = aggregateEvidence(input.datasets, input.active, input.model);
  const quality = inspectScientificIntegrity(input.datasets, null, {
    year: input.year,
    model: input.model,
    now: new Date().toISOString(),
  });
  const identities = new Map<string, { district: string; records: Record360[] }>();
  for (const record of input.records || joined.records) {
    const key = record.code ? 'code:' + record.code : 'name:' + normalize(record.district);
    const entry = identities.get(key) || { district: record.district, records: [] };
    entry.records.push(record);
    identities.set(key, entry);
  }
  for (const district of input.manualDistricts || [])
    if (
      typeof district === 'string' &&
      district.trim() &&
      district.trim().length <= 100 &&
      !Array.from(identities.values()).some(
        (entry) => normalize(entry.district) === normalize(district),
      )
    )
      identities.set('name:' + normalize(district), { district: district.trim(), records: [] });
  const districts = [...identities.values()]
    .sort((a, b) => a.district.localeCompare(b.district))
    .map((entry) => {
      const key = readinessChecklistKey(entry.district, input.year);
      return assessDistrictReadiness({
        district: entry.district,
        year: input.year,
        current: entry.records.find((r) => r.year === input.year),
        previous: entry.records.find((r) => r.year === input.year - 1),
        checklist: input.checklists[key],
        metadata: input.metadata?.[key],
        sourceQualityIssues: quality
          .filter((report) =>
            entry.records
              .find((r) => r.year === input.year)
              ?.references.some((ref) => ref.selected && ref.datasetId === report.dataset.id),
          )
          .flatMap((report) =>
            report.issues
              .filter((issue) => issue.severity === 'ERROR' || issue.severity === 'BLOCKING')
              .map(
                (issue) =>
                  `${report.dataset.name} · ${issue.row ?? 'Dataset'} · ${issue.field}: ${issue.issue}`,
              ),
          ),
        thresholds: input.thresholds,
      });
    });
  return {
    districts,
    identityIssues: joined.identityIssues,
    year: input.year,
    model: input.model,
    sourceDatasets: joined.datasets.map((dataset) => ({
      id: dataset.id,
      name: dataset.name,
      source: dataset.source,
      classification: dataset.classification || 'USER IMPORT',
      checksum: dataset.checksum,
    })),
    policy: readinessPolicy,
  };
}
