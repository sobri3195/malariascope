import { useState } from 'react';
import { useStore } from './store';
import { normalize, download } from './analytics';
type Entry = {
  district: string;
  officialCode: string;
  validFrom: number;
  validTo: number;
  source: string;
  license: string;
};
export default function BoundaryCrosswalk() {
  const { state, year, district } = useStore();
  const [entries, setEntries] = useState<Entry[]>(() => {
      try {
        const a = JSON.parse(localStorage.getItem('malariascope-boundary-crosswalk') || '[]');
        return Array.isArray(a) ? a : [];
      } catch {
        return [];
      }
    }),
    [error, setError] = useState('');
  const current = entries.filter(
    (e) =>
      e.validFrom <= year &&
      e.validTo >= year &&
      (district === 'All districts' || normalize(e.district) === normalize(district)),
  );
  return (
    <section className="panel">
      <h2>Administrative code & boundary crosswalk</h2>
      <p>
        Geometry vintage: {state.geometrySource?.created || 'Not connected'}. Source:{' '}
        {state.geometrySource?.name || 'Not connected'}. Import explicit official-code statements
        with validity periods and provenance. Statements remain USER IMPORT; supplied shape IDs are
        never relabeled as official codes.
      </p>
      <label>
        Import boundary crosswalk
        <input
          type="file"
          accept=".json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file)
              void file
                .text()
                .then((t) => {
                  const rows: unknown = JSON.parse(t);
                  if (
                    !Array.isArray(rows) ||
                    rows.some(
                      (r) =>
                        !r ||
                        !['district', 'officialCode', 'source', 'license'].every(
                          (k) => typeof r[k] === 'string' && r[k].trim(),
                        ) ||
                        !Number.isInteger(r.validFrom) ||
                        !Number.isInteger(r.validTo) ||
                        r.validFrom > r.validTo,
                    )
                  )
                    throw Error(
                      'Crosswalk requires district, officialCode, validFrom, validTo, source and license',
                    );
                  for (let i = 0; i < rows.length; i++)
                    for (let j = i + 1; j < rows.length; j++)
                      if (
                        (normalize(rows[i].district) === normalize(rows[j].district) ||
                          rows[i].officialCode === rows[j].officialCode) &&
                        Math.max(rows[i].validFrom, rows[j].validFrom) <=
                          Math.min(rows[i].validTo, rows[j].validTo)
                      )
                        throw Error('Conflicting crosswalk validity windows');
                  localStorage.setItem('malariascope-boundary-crosswalk', JSON.stringify(rows));
                  setEntries(rows);
                  setError('');
                })
                .catch((e) => setError(String(e)));
          }}
        />
      </label>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>District</th>
              <th>Declared official code</th>
              <th>Validity</th>
              <th>Active source match</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {current.map((e) => {
              const rows =
                state.datasets
                  .find((d) => d.id === state.active)
                  ?.rows.filter(
                    (r) => normalize(r.district) === normalize(e.district) && r.year === year,
                  ) || [];
              return (
                <tr key={e.district + e.validFrom}>
                  <td>{e.district}</td>
                  <td>{e.officialCode}</td>
                  <td>
                    {e.validFrom}–{e.validTo}
                  </td>
                  <td>
                    {rows.some((r) => r.district_code === e.officialCode)
                      ? 'CODE MATCH'
                      : 'REVIEW NAME/CODE CROSSWALK'}
                  </td>
                  <td>
                    {e.source} · {e.license}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!current.length && <p>No imported official-code crosswalk for the selected period.</p>}
      <button
        className="button"
        onClick={() =>
          download('administrative-crosswalk.json', {
            classification: 'USER IMPORT — NOT INDEPENDENTLY VERIFIED',
            year,
            entries: current,
          })
        }
      >
        Export current crosswalk
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
