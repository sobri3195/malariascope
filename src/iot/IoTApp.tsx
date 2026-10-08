import BrandMark from '../BrandMark';
import { useState, useEffect, useMemo, useRef, lazy, Suspense, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { useStore } from '../store';
import { getDistrictObservation, getObservedApi } from '../research-data/research';
import {
  units,
  defaultIoTSettings,
  validateSensors,
  validateTelemetry,
  sensorHealth,
  iotAlerts,
  districtSensorSummary,
  simulationFrame,
  type Sensor,
  type Reading,
  type IoTIssue,
  type Variable,
  type IoTSettings,
} from './iot-engine';
import { connectFeed, type Adapter } from './live-adapters';
import '../styles.css';
import './iot.css';
const SensorMap = lazy(() => import('./IoTMap'));
const label = 'SIMULATED SENSOR STREAM — NOT OBSERVED DATA';
type LocalData = {
  sensors: Sensor[];
  readings: Reading[];
  issues: IoTIssue[];
  imported: string;
  source: string;
  version: string;
};
const empty: LocalData = {
  sensors: [],
  readings: [],
  issues: [],
  imported: '',
  source: 'Local public data files — no sensors supplied',
  version: 'iot-empty-v1',
};
function restore<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}
function download(name: string, value: unknown, format = 'JSON') {
  const text =
    format === 'CSV'
      ? Papa.unparse(Array.isArray(value) ? value : [], { escapeFormulae: true })
      : JSON.stringify(value, null, 2);
  const url = URL.createObjectURL(
    new Blob([text], { type: format === 'CSV' ? 'text/csv' : 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name + '.' + format.toLowerCase();
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function IoTApp() {
  const { research, state, year, district, setDistrict } = useStore();
  const [data, setData] = useState<LocalData>(() => restore('malariascope-iot-data', empty)),
    [settings, setSettings] = useState<IoTSettings>(() =>
      restore('malariascope-iot-settings', defaultIoTSettings),
    );
  const [notice, setNotice] = useState(''),
    [preview, setPreview] = useState<LocalData | null>(null),
    [selected, setSelected] = useState(''),
    [variable, setVariable] = useState<Variable>('temperature_c'),
    [period, setPeriod] = useState('All available'),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [layer, setLayer] = useState('Sensor Availability'),
    [format, setFormat] = useState('JSON'),
    [alertStatus, setAlertStatus] = useState<Record<string, string>>(() =>
      restore('malariascope-iot-alerts', {}),
    );
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(
      () => setClock(Date.now()),
      Math.max(5, settings.refreshSeconds) * 1000,
    );
    return () => clearInterval(timer);
  }, [settings.refreshSeconds]);
  const [simulation, setSimulation] = useState(false),
    [running, setRunning] = useState(false),
    [speed, setSpeed] = useState(1000),
    [simReadings, setSimReadings] = useState<Reading[]>([]),
    [simSensor, setSimSensor] = useState<Sensor | null>(null);
  const step = useRef(0),
    start = useRef(Date.now());
  const [adapter, setAdapter] = useState<Adapter>('HTTP polling'),
    [url, setURL] = useState(''),
    [topic, setTopic] = useState(''),
    [live, setLive] = useState('NOT CONNECTED');
  const stop = useRef<(() => void) | null>(null),
    dataRef = useRef(data);
  dataRef.current = data;
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const results = await Promise.all(
          [
            '/data/iot/sensor-registry.json',
            '/data/iot/environmental-readings.csv',
            '/data/iot/iot-metadata.json',
          ].map(async (path) => {
            const response = await fetch(path);
            if (!response.ok) throw Error('Local IoT files unavailable');
            return response.text();
          }),
        );
        const sensors = validateSensors(JSON.parse(results[0])),
          rows = Papa.parse<Record<string, unknown>>(results[1], {
            header: true,
            skipEmptyLines: true,
          }).data,
          validated = validateTelemetry(rows, sensors),
          metadata = JSON.parse(results[2]);
        if (!cancelled && !dataRef.current.sensors.length)
          setData({
            ...empty,
            sensors,
            ...validated,
            source: metadata.source || empty.source,
            version: metadata.version || empty.version,
          });
      } catch {
        if (!cancelled)
          setNotice(
            'Optional local IoT files unavailable. Local import and Simulation Mode remain usable.',
          );
      }
    }
    void load();
    return () => {
      cancelled = true;
      stop.current?.();
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('malariascope-iot-data', JSON.stringify(data));
      localStorage.setItem('malariascope-iot-settings', JSON.stringify(settings));
      localStorage.setItem('malariascope-iot-alerts', JSON.stringify(alertStatus));
    } catch {
      setNotice(
        'Local storage unavailable; this session remains usable. Exports can preserve your data.',
      );
    }
  }, [data, settings, alertStatus]);
  useEffect(() => {
    if (!running || !simulation) return;
    const timer = setInterval(() => {
      const frame = simulationFrame(
        step.current++,
        district === 'All districts' ? 'Jayapura' : district,
        start.current,
      );
      setSimSensor(frame.sensor);
      setSimReadings((rows) => [...rows, ...frame.readings].slice(-2000));
    }, speed);
    return () => clearInterval(timer);
  }, [running, simulation, speed, district]);
  const sensors = simulation ? (simSensor ? [simSensor] : []) : data.sensors,
    readings = simulation ? simReadings : data.readings;
  const now = simulation ? start.current + Math.max(0, step.current - 1) * 60000 : clock;
  const health = sensors.map((s) => sensorHealth(s, readings, settings, now)),
    alerts = iotAlerts(sensors, readings, settings, now),
    summary = districtSensorSummary(sensors, readings, settings, now);
  const latest = readings
    .filter((r) => r.quality_flag !== 'INVALID')
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .at(-1);
  const sync = readings
    .map((r) => r.received_timestamp)
    .sort()
    .at(-1);
  const accepted = readings.filter(
    (r) => r.value !== null && ['VALID', 'WARNING'].includes(r.quality_flag),
  );
  const batteries = health.map((h) => h.battery).filter((v): v is number => v !== null);
  const detail = health.find((h) => h.sensor.sensor_id === selected);
  const filtered = useMemo(() => {
    const series = readings.filter(
      (r) =>
        (!selected || r.sensor_id === selected) &&
        (district === 'All districts' ||
          sensors.find((s) => s.sensor_id === r.sensor_id)?.district === district),
    );
    const latestTime = Math.max(
      ...series.map((r) => Date.parse(r.timestamp)).filter(Number.isFinite),
    );
    const hours = (
      { '1 hour': 1, '24 hours': 24, '7 days': 168, '30 days': 720 } as Record<string, number>
    )[period];
    return series
      .filter((r) =>
        period === 'Custom'
          ? (!from || Date.parse(r.timestamp) >= Date.parse(from)) &&
            (!to || Date.parse(r.timestamp) <= Date.parse(to))
          : !hours || Date.parse(r.timestamp) >= latestTime - hours * 3600000,
      )
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  }, [readings, sensors, selected, district, period, from, to]);
  const selectSensor = useCallback((id: string) => setSelected(id), []);
  async function importFile(file: File, kind: 'registry' | 'telemetry') {
    try {
      const text = await file.text();
      let parsed: unknown;
      if (file.name.endsWith('.json')) parsed = JSON.parse(text);
      else {
        const csv = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          skipEmptyLines: true,
        });
        if (csv.errors.length) throw Error('CSV parsing failed: ' + csv.errors[0].message);
        parsed = csv.data;
      }
      const sensors = kind === 'registry' ? validateSensors(parsed) : data.sensors;
      if (!Array.isArray(parsed)) throw Error('Import requires an array of records.');
      const result = validateTelemetry(kind === 'telemetry' ? parsed : data.readings, sensors);
      setPreview({
        sensors,
        ...result,
        imported: new Date().toISOString(),
        source: file.name,
        version: 'local-' + Date.now(),
      });
      setNotice('Import validated. Review issues before confirming local environmental data.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Import failed');
    }
  }
  function connect() {
    try {
      stop.current?.();
      setLive('PARTIAL — connecting');
      stop.current = connectFeed({
        adapter,
        url,
        topic,
        seconds: settings.refreshSeconds,
        onStatus: setLive,
        onData: (payload) => {
          if (!Array.isArray(payload)) throw Error('Feed must provide an array of typed telemetry');
          const current = dataRef.current;
          const result = validateTelemetry([...current.readings, ...payload], current.sensors);
          setData({
            ...current,
            ...result,
            imported: new Date().toISOString(),
            source: 'Optional public environmental feed',
            version: 'live-' + Date.now(),
          });
        },
      });
    } catch (error) {
      setLive('ERROR');
      setNotice(error instanceof Error ? error.message : 'Optional feed unavailable');
    }
  }
  const exportData = (name: string, value: unknown) =>
    download(
      name,
      simulation
        ? Array.isArray(value)
          ? value.map((row) => ({ ...row, simulation: true, warning: label }))
          : value
        : value,
      format,
    );
  return (
    <div className={'iot-app' + (simulation ? ' iot-simulation' : '')}>
      <header>
        <div>
          <h1 className="malariascope-brand-line">
            <BrandMark size={36} />
            <span>MALARIASCOPE IoT</span>
          </h1>
          <p>Environmental Surveillance & Sensor Intelligence · research prototype</p>
        </div>
        <nav>
          <Link to="/aplikasi-desktop">Desktop</Link>
          <Link to="/dashboard">Research workspace</Link>
          <Link to="/mobile">Mobile</Link>
        </nav>
      </header>
      {simulation && (
        <aside className="iot-warning" role="status">
          <strong>SIMULATION MODE ACTIVE</strong>
          <p>{label}. All displayed values and exports are isolated demonstrations.</p>
        </aside>
      )}
      <div className="iot-toolbar">
        <label>
          District
          <select value={district} onChange={(e) => setDistrict(e.target.value)}>
            <option>All districts</option>
            {[
              ...new Set([
                ...(research?.registry.districts.map((d: any) => d.canonicalName) || []),
                ...sensors.map((s) => s.district),
              ]),
            ]
              .sort()
              .map((d) => (
                <option key={d}>{d}</option>
              ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={simulation}
            onChange={(e) => {
              setSimulation(e.target.checked);
              setRunning(false);
              setSelected('');
            }}
          />{' '}
          Simulation Mode
        </label>
        {simulation && (
          <>
            <button onClick={() => setRunning(true)}>Start Simulation</button>
            <button onClick={() => setRunning(false)}>Pause</button>
            <button
              onClick={() => {
                setRunning(false);
                setSimReadings([]);
                setSimSensor(null);
                step.current = 0;
                start.current = Date.now();
              }}
            >
              Reset
            </button>
            <label>
              Speed
              <select value={speed} onChange={(e) => setSpeed(+e.target.value)}>
                <option value={2000}>0.5×</option>
                <option value={1000}>1×</option>
                <option value={250}>4×</option>
              </select>
            </label>
          </>
        )}
      </div>
      <p role="status">{notice}</p>
      {!simulation && !sensors.length && (
        <section className="panel">
          <h2>No IoT sensor dataset connected.</h2>
          <p>
            Import legitimate environmental sensor records and readings. No production sensor
            measurements have been supplied.
          </p>
        </section>
      )}
      <section className="iot-metrics" aria-label="IoT dashboard metrics">
        {Object.entries({
          'Connected Sensors': health.filter((h) => h.status === 'ONLINE').length,
          'Offline Sensors': health.filter((h) => h.status === 'OFFLINE').length,
          'Warning Sensors': health.filter((h) => h.status === 'DEGRADED').length,
          'Latest Reading': latest?.timestamp ?? 'Not connected',
          'Data Completeness': readings.length
            ? ((accepted.length / readings.length) * 100).toFixed(1) + '%'
            : 'Not connected',
          'Average Battery': batteries.length
            ? (batteries.reduce((a, b) => a + b, 0) / batteries.length).toFixed(1) + '%'
            : 'Not connected',
          'Environmental Alerts': alerts.length,
          'Last Synchronization': sync ?? 'Not connected',
        }).map(([key, value]) => (
          <article key={key}>
            <strong>{key}</strong>
            <p>{value}</p>
            {simulation && <small>{label}</small>}
          </article>
        ))}
      </section>
      <details className="panel">
        <summary>IoT data status and settings</summary>
        <div className="iot-grid">
          {Object.entries({
            'Sensor Registry': sensors.length ? 'CONNECTED' : 'NOT CONNECTED',
            Telemetry: readings.length ? 'CONNECTED' : 'NOT CONNECTED',
            'Live Stream': live,
            'Environmental Data': accepted.length ? 'CONNECTED' : 'NOT CONNECTED',
            'GIS Link': state.geometry ? 'CONNECTED' : 'NOT CONNECTED',
            'Malaria Integration': research
              ? 'CONNECTED — annual retrospective context'
              : 'NOT CONNECTED',
          }).map(([key, value]) => (
            <p key={key}>
              {key}: {simulation && key !== 'GIS Link' ? 'SIMULATION' : value}
            </p>
          ))}
        </div>
        <p>
          Completeness = accepted measurements / all supplied measurements × 100. Missing expected
          sampling schedules are unknown, so this is not an estimate of uncollected readings.
        </p>
        <div className="iot-toolbar">
          {Object.entries(settings).map(([key, value]) => (
            <label key={key}>
              {key}
              <input
                type="number"
                min={key === 'refreshSeconds' ? 5 : 0.1}
                step="any"
                value={value}
                onChange={(e) => {
                  const next = +e.target.value;
                  if (Number.isFinite(next) && next > 0 && (key !== 'lowBattery' || next <= 100))
                    setSettings({ ...settings, [key]: next });
                }}
              />
            </label>
          ))}
        </div>
        <h3>Optional live adapter</h3>
        <p>
          Public secure environmental feeds only. No credentials are stored. A broker failure leaves
          local imports usable.
        </p>
        <label>
          Adapter
          <select value={adapter} onChange={(e) => setAdapter(e.target.value as Adapter)}>
            {['HTTP polling', 'WebSocket', 'MQTT over WebSocket'].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>
          Public feed URL
          <input
            value={url}
            onChange={(e) => setURL(e.target.value)}
            placeholder="https://public-environmental-feed.example"
          />
        </label>
        {adapter === 'MQTT over WebSocket' && (
          <label>
            Public topic
            <input value={topic} onChange={(e) => setTopic(e.target.value)} />
          </label>
        )}
        <button onClick={connect} disabled={simulation}>
          Connect optional feed
        </button>
        <button
          onClick={() => {
            stop.current?.();
            stop.current = null;
            setLive('NOT CONNECTED');
          }}
        >
          Disconnect
        </button>
      </details>
      <section className="panel">
        <h2>Local data ingestion</h2>
        <p>
          Registry and telemetry accept CSV or JSON. Imports remain environmental USER IMPORT data,
          separate from the verified study package.
        </p>
        <label>
          Import Sensor Registry
          <input
            aria-label="Import sensor registry"
            type="file"
            accept=".csv,.json"
            disabled={simulation}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file, 'registry');
              e.target.value = '';
            }}
          />
        </label>
        <label>
          Import Telemetry
          <input
            aria-label="Import telemetry"
            type="file"
            accept=".csv,.json"
            disabled={simulation}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file, 'telemetry');
              e.target.value = '';
            }}
          />
        </label>
        {preview && (
          <div className="iot-import-preview">
            <p>
              {preview.sensors.length} sensors · {preview.readings.length} readings ·{' '}
              {preview.issues.length} quality issues. Invalid measurements remain flagged and are
              excluded from summaries.
            </p>
            <button
              onClick={() => {
                setData(preview);
                setPreview(null);
                setNotice('Environmental dataset saved locally.');
              }}
            >
              Confirm Environmental Import
            </button>
            <button onClick={() => setPreview(null)}>Cancel import</button>
            <pre>{JSON.stringify(preview.issues.slice(0, 20), null, 2)}</pre>
          </div>
        )}
      </section>
      <div className="iot-grid">
        <section className="panel">
          <h2>Sensor Registry</h2>
          {sensors.map((sensor) => {
            const h = health.find((h) => h.sensor.sensor_id === sensor.sensor_id)!;
            return (
              <button
                className="iot-sensor-card"
                key={sensor.sensor_id}
                onClick={() => setSelected(sensor.sensor_id)}
              >
                <strong>{sensor.sensor_name}</strong>
                <span>
                  {sensor.sensor_id} · {sensor.district} · {h.status}
                </span>
                <span>
                  {sensor.verification_status} · Battery {h.battery ?? 'unknown'} · Last seen{' '}
                  {h.lastSeen ?? 'unknown'}
                </span>
                {simulation && <small>{label}</small>}
              </button>
            );
          })}
          {!sensors.length && <p>No sensors registered.</p>}
        </section>
        <section className="panel">
          <h2>Sensor Detail</h2>
          {detail ? (
            <>
              <h3>{detail.sensor.sensor_name}</h3>
              <dl>
                {Object.entries({
                  ...detail.sensor,
                  status: detail.status,
                  latestReading: detail.latest
                    ? detail.latest.value + ' ' + detail.latest.unit
                    : 'Unknown',
                  lastSeen: detail.lastSeen,
                  missingData: detail.missing,
                  invalidReadings: detail.invalid,
                  outlierRate: detail.outlierRate,
                }).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{String(value ?? 'Unknown')}</dd>
                  </div>
                ))}
              </dl>
              <p>
                Time gaps: {detail.gaps.length}. Connectivity history below is derived from supplied
                timestamps, not measured network uptime.
              </p>
              {detail.gaps.map((gap, i) => (
                <p key={i}>
                  {gap.from} → {gap.to}: {gap.hours.toFixed(1)} hours
                </p>
              ))}
            </>
          ) : (
            <p>Select a sensor or map marker.</p>
          )}
        </section>
      </div>
      <section className="panel">
        <h2>Sensor Coverage Map</h2>
        <label>
          Environmental layer
          <select value={layer} onChange={(e) => setLayer(e.target.value)}>
            {[
              'Rainfall',
              'Temperature',
              'Humidity',
              'Sensor Availability',
              'Data Completeness',
            ].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <p>
          Gray = no connected observation. Teal = sensor coverage, not normal conditions or
          interpolated district climate. Layer summaries use each sensor’s latest accepted reading.
        </p>
        {!accepted.length && <p>Environmental sensor data not available.</p>}
        <Suspense fallback={<p>Loading local vector map…</p>}>
          <SensorMap
            sensors={sensors}
            readings={readings}
            settings={settings}
            layer={layer}
            onSelect={selectSensor}
          />
        </Suspense>
        {simulation && <p>{label}; demonstration sensors have no invented coordinates.</p>}
      </section>
      <section className="panel">
        <h2>Environmental Telemetry Timeline</h2>
        <div className="iot-toolbar">
          <label>
            Sensor
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">All sensors</option>
              {sensors.map((s) => (
                <option key={s.sensor_id} value={s.sensor_id}>
                  {s.sensor_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Variable
            <select value={variable} onChange={(e) => setVariable(e.target.value as Variable)}>
              {Object.keys(units)
                .filter((v) => !readings.length || readings.some((r) => r.variable === v))
                .map((v) => (
                  <option key={v}>{v}</option>
                ))}
            </select>
          </label>
          <label>
            Period
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {['All available', '1 hour', '24 hours', '7 days', '30 days', 'Custom'].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          {period === 'Custom' && (
            <>
              <label>
                From
                <input
                  type="datetime-local"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                To
                <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </>
          )}
        </div>
        <p>
          Windows are anchored to the latest supplied measurement. Unsupported or empty periods show
          no data.
        </p>
        {simulation && <p>{label}</p>}
        {filtered.some(
          (r) => r.variable === variable && ['VALID', 'WARNING'].includes(r.quality_flag),
        ) ? (
          <div>
            {sensors
              .filter(
                (s) =>
                  (!selected || selected === s.sensor_id) &&
                  filtered.some(
                    (r) =>
                      r.sensor_id === s.sensor_id &&
                      r.variable === variable &&
                      ['VALID', 'WARNING'].includes(r.quality_flag),
                  ),
              )
              .map((s) => (
                <div key={s.sensor_id} className="iot-chart">
                  <p>
                    {s.sensor_name} · {simulation ? label : s.verification_status}
                  </p>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={filtered.filter(
                        (r) =>
                          r.sensor_id === s.sensor_id &&
                          r.variable === variable &&
                          ['VALID', 'WARNING'].includes(r.quality_flag),
                      )}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timestamp" hide />
                      <YAxis />
                      <Tooltip />
                      <Line
                        dataKey="value"
                        name={variable + ' (' + units[variable] + ')'}
                        stroke={simulation ? '#b07817' : '#087f78'}
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
          </div>
        ) : (
          <p>No available observations for this variable and period.</p>
        )}
        <details>
          <summary>View Provenance</summary>
          <p>
            Dataset {data.version} · source {simulation ? label : data.source} · import time{' '}
            {simulation ? 'In-memory' : data.imported || 'Not imported'}
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    'Sensor',
                    'Variable',
                    'Measurement time',
                    'Received time',
                    'Value',
                    'Unit',
                    'Quality',
                    'Source',
                    'Verification',
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i}>
                    <td>{r.sensor_id}</td>
                    <td>{r.variable}</td>
                    <td>{r.measurement_timestamp}</td>
                    <td>{r.received_timestamp}</td>
                    <td>{r.value ?? 'Missing'}</td>
                    <td>{r.unit}</td>
                    <td>{r.quality_flag}</td>
                    <td>{r.source}</td>
                    <td>{sensors.find((s) => s.sensor_id === r.sensor_id)?.verification_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <section className="panel">
        <h2>Analytical IoT Alerts</h2>
        <p>Environmental and sensor-health signals only; no clinical or operational directives.</p>
        {!alerts.length && <p>No environmental alerts generated.</p>}
        {alerts.map((alert) => (
          <article className="iot-alert" key={alert.id}>
            <h3>
              {alert.metric} · {alert.severity}
            </h3>
            <p>
              {alert.sensor} · {alert.district} · {alert.timestamp}
            </p>
            <p>
              Value {alert.value ?? 'Unavailable'} · threshold {alert.threshold ?? 'Not applicable'}
            </p>
            <p>{alert.reason}</p>
            {simulation && <p>{label}</p>}
            <label>
              Status
              <select
                value={alertStatus[alert.id] || 'NEW'}
                onChange={(e) => setAlertStatus({ ...alertStatus, [alert.id]: e.target.value })}
              >
                <option>NEW</option>
                <option>ACKNOWLEDGED</option>
                <option>REVIEWED</option>
              </select>
            </label>
          </article>
        ))}
      </section>
      <section className="panel">
        <h2>IoT Data Quality</h2>
        <p>
          {simulation
            ? 'Simulation quality is isolated from observed imports.'
            : `${data.issues.length} retained validation issues.`}
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Row</th>
                <th>Field</th>
                <th>Flag</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {(!simulation ? data.issues : []).map((issue, i) => (
                <tr key={i}>
                  <td>{issue.row}</td>
                  <td>{issue.field}</td>
                  <td>{issue.severity}</td>
                  <td>{issue.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {health.map((h) => (
          <p key={h.sensor.sensor_id}>
            {h.sensor.sensor_id}: {h.status} · missing {h.missing} · invalid {h.invalid} · gaps{' '}
            {h.gaps.length} · accepted-reading completeness{' '}
            {h.completeness?.toFixed(1) ?? 'Unknown'}%
          </p>
        ))}
      </section>
      <section className="panel">
        <h2>District Environmental Summary & Malaria Comparison</h2>
        <p>
          Exploratory association — not causal inference. Latest sensor measurements and annual
          retrospective malaria counts have different time resolution. No correlation or district
          estimates are inferred from unmatched periods.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  'District',
                  'Sensor coverage',
                  'Latest reading',
                  'Rainfall mm',
                  'Temperature °C',
                  'Humidity %',
                  'Completeness',
                  'Alerts',
                  'Malaria year',
                  'Observed cases',
                  'Observed API per 1,000',
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr key={row.district}>
                  <td>
                    {row.district}
                    {simulation && <small>{label}</small>}
                  </td>
                  <td>
                    {row.sensorsWithReadings}/{row.sensors}
                  </td>
                  <td>{row.latest ?? 'Unknown'}</td>
                  <td>{row.rainfall ?? 'Unavailable'}</td>
                  <td>{row.temperature ?? 'Unavailable'}</td>
                  <td>{row.humidity ?? 'Unavailable'}</td>
                  <td>{row.completeness}%</td>
                  <td>{row.alerts}</td>
                  <td>{year}</td>
                  <td>
                    {research
                      ? (getDistrictObservation(research, row.district, year)?.cases ??
                        'Not available')
                      : 'Not available'}
                  </td>
                  <td>
                    {research
                      ? (getObservedApi(research, row.district, year) ?? 'Not available')
                      : 'Not available'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Sensor coverage is registered sensors with accepted readings / registered sensors, not
          geographic or population representativeness. No sensor data are estimated for uncovered
          districts.
        </p>
      </section>
      <section className="panel iot-report">
        <h2>IoT Environmental Surveillance Report</h2>
        <p>
          Research prototype · generated {new Date().toISOString()} · dataset{' '}
          {simulation ? 'In-memory simulation' : data.version} · district {district} · variable{' '}
          {variable} · period {period}
        </p>
        <p>
          Source {simulation ? label : data.source} · {sensors.length} sensors · {readings.length}{' '}
          readings · {alerts.length} alerts. Imported data are not independently verified. Expected
          sampling schedules, calibration, causal relationships and representativeness are not
          established. Live adapters are optional; no broker is required.
        </p>
        {simulation && <p>{label}</p>}
        <label>
          Export format
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option>JSON</option>
            <option>CSV</option>
          </select>
        </label>
        {[
          ['Sensor Registry', sensors],
          ['Filtered Telemetry', filtered],
          ['IoT Alerts', alerts.map((a) => ({ ...a, status: alertStatus[a.id] || 'NEW' }))],
          ['Data Quality Report', simulation ? [] : data.issues],
          ['District Environmental Summary', summary],
        ].map(([name, value]) => (
          <button key={String(name)} onClick={() => exportData(String(name), value)}>
            Export {String(name)}
          </button>
        ))}
        <button onClick={() => window.print()}>Print / Save report as PDF</button>
      </section>
    </div>
  );
}
