import { useEffect, useState } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { download } from '../analytics';
import {
  EvidenceSection,
  ScopePanel,
  StudyBenchmarkPanel,
  StudyClimatePanel,
  StudyDiagnosticsPanel,
  StudyProvenancePanel,
} from './Panels';
import { modelKeys, referenceStatus, scopes, type ScopeId } from './contract';
import { cohortExport, scopeSummary } from './engine';
import { evidenceCsv } from '../methodology-evidence';
import './research-evidence.css';
const tabs = [
  'Cohorts & annual data',
  'Benchmarks',
  'Prediction diagnostics',
  'Climate evidence',
  'Provenance',
  'Interface status',
] as const;
const sectionIds = [
  'cohorts',
  'benchmarks',
  'diagnostics',
  'climate',
  'provenance',
  'interfaces',
] as const;
const workflow = [
  ['/dashboard', 'Overview'],
  ['/asean-map', 'Interactive maps'],
  ['/surveillance', 'Annual surveillance'],
  ['/climate', 'Climate'],
  ['/model-benchmarking', 'Model laboratory'],
  ['/forecasting/failure-analysis', 'Prediction diagnostics'],
  ['/spatial-analysis', 'Spatial analytics'],
  ['/data-center', 'Dataset explorer'],
  ['/data-quality', 'Data quality'],
  ['/methodology', 'Methodology'],
  ['/research-operations', 'Integrations'],
];
const interfaces = [
  {
    name: 'Web research dashboard',
    state: 'Functional browser application with supplied historical evidence',
    link: '/dashboard',
    limit: 'No live surveillance feed or operational outcome validation established.',
  },
  {
    name: 'Mobile research interface',
    state: 'Responsive browser research interface',
    link: '/mobile',
    limit:
      'Not a separately certified native application; browser cache is not evidence freshness.',
  },
  {
    name: 'Desktop workstation',
    state: 'Shared browser geospatial workstation',
    link: '/aplikasi-desktop',
    limit: 'No independent decision-support or usability validation established.',
  },
  {
    name: 'Environmental IoT',
    state: 'Registry/adapters and separately labeled simulation implemented',
    link: '/iot',
    limit:
      'Live connectivity is not inferred from an adapter. Real telemetry requires a legitimate source; simulated values are not observations.',
  },
  {
    name: 'Smartwatch research view',
    state: 'Browser research demonstration',
    link: '/smartwatch',
    limit:
      'No native device, clinical diagnosis, personnel-risk model or authenticated operational alert delivery established.',
  },
  {
    name: 'Shared services',
    state: 'Optional authenticated FastAPI/SQLite service implementation',
    link: '/research-operations',
    limit:
      'A static Vercel build does not start Python. Deployment, users, credentials and actual delivery require owner configuration.',
  },
];
export default function ResearchIntelligence() {
  const {
    research: p,
    researchError,
    retryResearch,
    year,
    setYear,
    district,
    setDistrict,
    model,
    setModel,
  } = useStore();
  const [params, setParams] = useSearchParams(),
    query = params.toString();
  const parseScope = (query: string): ScopeId => {
    const value = new URLSearchParams(query).get('researchScope');
    return scopes.some((s) => s.id === value) ? (value as ScopeId) : 'panel';
  };
  const parseSection = (query: string) => {
    const value = new URLSearchParams(query).get('researchSection');
    return sectionIds.includes(value as (typeof sectionIds)[number]) ? value! : 'cohorts';
  };
  const [scope, setScope] = useState<ScopeId>(() => parseScope(query)),
    [section, setSection] = useState(() => parseSection(query)),
    [message, setMessage] = useState('');
  useEffect(() => {
    setScope(parseScope(query));
    setSection(parseSection(query));
  }, [query]);
  const change = (key: 'researchScope' | 'researchSection', value: string) => {
    if (key === 'researchScope') setScope(value as ScopeId);
    else setSection(value);
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set(key, value);
        return next;
      },
      { replace: true },
    );
  };
  if (!p)
    return (
      <div className="research-evidence-workspace">
        <h1>Research Intelligence</h1>
        <p role={researchError ? 'alert' : 'status'}>
          {researchError || 'Loading checksummed study package…'}
        </p>
        {researchError && (
          <button className="button" onClick={retryResearch}>
            Retry study evidence
          </button>
        )}
      </div>
    );
  const summary = scopeSummary(p, scope, year, district),
    years = [...new Set([year, 2020, 2021, 2022, 2023, 2024, 2025])].sort(),
    allDistricts = p.registry.districts.map((d: any) => String(d.canonicalName));
  const exportSelected = (csv: boolean) => {
    try {
      const value = cohortExport(p, scope, year, district);
      if (csv) download('selected-research-cohort.csv', evidenceCsv(value), true);
      else download('selected-research-cohort.json', value);
      setMessage(
        `Selected ${scope} scope and ${year} records exported with source metadata. Unavailable scopes contain no invented observations.`,
      );
    } catch (error) {
      setMessage(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  return (
    <div className="research-evidence-workspace">
      <header className="evidence-heading">
        <div>
          <span className="evidence-eyebrow">PAPUA RESEARCH · EXPLICIT COHORTS</span>
          <h1>Research Intelligence</h1>
          <p>
            Follow a result from its analytical population to its records, model comparison and
            source.
          </p>
        </div>
        <NavLink to="/asean-map">Open ASEAN geographic context →</NavLink>
      </header>
      <nav className="evidence-workflow" aria-label="Research workflow navigation">
        {workflow.map(([href, name]) => (
          <NavLink key={href} to={href}>
            {name}
          </NavLink>
        ))}
      </nav>
      <p className="evidence-warning">
        Fixed study evidence workspace. Imported datasets and synthetic demos remain in their
        existing workflows. New manuscript references: {referenceStatus}. They do not overwrite
        original artifacts.
      </p>
      <div className="evidence-controls evidence-shared-controls">
        <label>
          Analytical cohort
          <select
            aria-label="Analytical cohort"
            value={scope}
            onChange={(e) => change('researchScope', e.target.value)}
          >
            {scopes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Shared reporting year
          <select
            aria-label="Research reporting year"
            value={year}
            onChange={(e) => setYear(+e.target.value)}
          >
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <label>
          Shared district
          <select
            aria-label="Research district"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
          >
            <option>All districts</option>
            {allDistricts.map((d: string) => (
              <option key={d}>{d}</option>
            ))}
            {district !== 'All districts' && !allDistricts.includes(district) && (
              <option>{district}</option>
            )}
          </select>
        </label>
        <label>
          Shared hindcast model
          <select
            aria-label="Research model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {Object.keys(modelKeys).map((m) => (
              <option key={m}>{m}</option>
            ))}
            {!Object.hasOwn(modelKeys, model) && <option>{model}</option>}
          </select>
        </label>
      </div>
      <p className="evidence-selection">
        Selected scope: <strong>{scopes.find((s) => s.id === scope)?.name}</strong> · {year} ·{' '}
        {district} · {model} · {summary.selected.length} connected outcome records. The benchmark
        references remain a fixed eight-district evaluation; all subset calculations are labeled.
      </p>
      <nav className="evidence-tabs" aria-label="Research intelligence sections">
        {sectionIds.map((id, index) => (
          <button
            key={id}
            aria-pressed={section === id}
            onClick={() => change('researchSection', id)}
          >
            {tabs[index]}
          </button>
        ))}
      </nav>
      {section === 'cohorts' && (
        <>
          <ScopePanel scope={scope} />
          {scope === 'snapshot' && (
            <EvidenceSection title="Reported spatial evidence">
              <p>
                Fixed nine-unit 2025 snapshot: supplied Global Moran’s I {p.spatialResult.moranI},
                permutation p = {p.spatialResult.pValue},{' '}
                {p.spatialResult.permutations?.toLocaleString('en-GB')} permutations. Global
                clustering was not established at α=0.05.
              </p>
              <p>
                Supplied weights: {p.spatialResult.neighbors_definition}; {p.spatialResult.weights}.
                This is a reported full-snapshot result, not a recalculation for the selected
                district/year. New queen-contiguity analyses in the spatial lab use their own
                parameters and are not the same analysis.
              </p>
              <NavLink to="/spatial-analysis">Inspect the existing spatial lab</NavLink>
            </EvidenceSection>
          )}
        </>
      )}
      {section === 'benchmarks' && <StudyBenchmarkPanel />}
      {section === 'diagnostics' && <StudyDiagnosticsPanel scope={scope} />}
      {section === 'climate' && <StudyClimatePanel />}
      {section === 'provenance' && <StudyProvenancePanel />}
      {section === 'interfaces' && (
        <>
          <EvidenceSection title="System and integration status">
            <div className="evidence-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Interface</th>
                    <th>Implemented capability</th>
                    <th>Limit / prerequisite</th>
                  </tr>
                </thead>
                <tbody>
                  {interfaces.map((i) => (
                    <tr key={i.name}>
                      <th scope="row">
                        <NavLink to={i.link}>{i.name}</NavLink>
                      </th>
                      <td>{i.state}</td>
                      <td>{i.limit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              This inventory describes implementation, not a live connectivity, uptime or
              clinical-validation check. No successful service connection, sensor reading or
              notification is fabricated.
            </p>
          </EvidenceSection>
          <EvidenceSection title="Force health protection research limits">
            <p>
              Aggregate civilian episodes support human-reviewed research into service preparedness
              and historical burden. They do not estimate individual personnel infection risk,
              military attack rates, readiness inventories or deployment outcomes. Mobility,
              personnel, intervention and diagnostic-access determinants are not present in the
              study model.
            </p>
            <p>
              Preparedness is a proposed research application. There are no tactical
              recommendations, diagnosis, treatment instructions or validated operational warning
              probabilities.
            </p>
            <NavLink to="/force-health">Open the human-reviewed preparedness workspace</NavLink>
          </EvidenceSection>
        </>
      )}
      <section className="evidence-export-bar" aria-label="Selected research evidence export">
        <button className="button" onClick={() => exportSelected(false)}>
          Export selected cohort JSON
        </button>
        <button className="button" onClick={() => exportSelected(true)}>
          Export selected cohort CSV
        </button>
        <p role="status" aria-live="polite">
          {message ||
            'Exports use the selected cohort, year and district with source versions, checksums, units and explicit missingness. No cross-scope aggregate is created.'}
        </p>
      </section>
    </div>
  );
}
