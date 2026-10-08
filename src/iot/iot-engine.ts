export const units = {
  rainfall_mm: 'mm',
  temperature_c: '°C',
  humidity_pct: '%',
  pressure_hpa: 'hPa',
  battery_pct: '%',
  mosquito_count: 'count',
} as const;
export type Variable = keyof typeof units;
export type Sensor = {
  sensor_id: string;
  sensor_name: string;
  sensor_type: string;
  district: string;
  district_code?: string;
  latitude?: number;
  longitude?: number;
  installation_type: string;
  status?: 'MAINTENANCE';
  last_seen?: string;
  battery?: number;
  firmware?: string;
  data_source: string;
  verification_status: 'PUBLIC RESEARCH' | 'AUTHORIZED RESEARCH' | 'USER IMPORT' | 'SIMULATION';
  simulation?: boolean;
};
export type Reading = {
  timestamp: string;
  measurement_timestamp: string;
  received_timestamp: string;
  sensor_id: string;
  district_code?: string;
  variable: Variable;
  value: number | null;
  unit: string;
  quality_flag: 'VALID' | 'WARNING' | 'INVALID' | 'MISSING';
  source: string;
  simulation?: boolean;
};
export type IoTIssue = {
  row: number;
  field: string;
  severity: 'WARNING' | 'INVALID' | 'MISSING';
  reason: string;
};
export type IoTSettings = {
  offlineHours: number;
  lowBattery: number;
  gapHours: number;
  rainfallThreshold: number;
  temperatureZ: number;
  humidityZ: number;
  refreshSeconds: number;
};
export const defaultIoTSettings: IoTSettings = {
  offlineHours: 24,
  lowBattery: 20,
  gapHours: 6,
  rainfallThreshold: 100,
  temperatureZ: 2,
  humidityZ: 2,
  refreshSeconds: 60,
};
const restricted =
  /military|soldier|troop|deployment|tactical|barracks|garrison|personnel|patient|vehicle|aircraft|unit_location|route|password|secret|token|api.?key|wifi|broker_credentials|private.?address/i;
export function safeIoTObject(row: Record<string, unknown>) {
  if (
    Object.keys(row).some((k) => restricted.test(k)) ||
    Object.values(row).some(
      (v) =>
        typeof v === 'string' &&
        (restricted.test(v) ||
          /\b(?:192\.168\.|10\.\d+\.\d+\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(v)),
    )
  )
    throw Error(
      'Restricted, identifying or credential metadata is not accepted by environmental IoT.',
    );
  if (
    row.simulation === true ||
    ['true', '1'].includes(String(row.simulation).trim().toLowerCase()) ||
    String(row.verification_status).toUpperCase() === 'SIMULATION' ||
    Object.values(row).some((v) => typeof v === 'string' && /SIMULATED SENSOR STREAM/i.test(v))
  )
    throw Error('Simulated imports cannot enter observed IoT data. Use isolated Simulation Mode.');
}
export function validateSensors(input: unknown): Sensor[] {
  if (!Array.isArray(input)) throw Error('Sensor registry requires a JSON array.');
  const seen = new Set<string>();
  return input.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row))
      throw Error('Every sensor must be an object');
    safeIoTObject(row);
    for (const k of [
      'sensor_id',
      'sensor_name',
      'sensor_type',
      'district',
      'installation_type',
      'data_source',
    ])
      if (typeof row[k] !== 'string' || !row[k].trim())
        throw Error(`Sensor row ${index + 1}: missing ${k}`);
    if (
      !/weather|environment|rain|temperature|humidity|pressure|battery|mosquito/i.test(
        row.sensor_type,
      )
    )
      throw Error('Only environmental research sensor types are accepted.');
    if (seen.has(row.sensor_id)) throw Error('Duplicate sensor ID');
    seen.add(row.sensor_id);
    const result: Sensor = {
      sensor_id: row.sensor_id,
      sensor_name: row.sensor_name,
      sensor_type: row.sensor_type,
      district: row.district,
      installation_type: row.installation_type,
      data_source: row.data_source,
      verification_status: ['PUBLIC RESEARCH', 'AUTHORIZED RESEARCH', 'USER IMPORT'].includes(
        row.verification_status,
      )
        ? row.verification_status
        : 'USER IMPORT',
    };
    if (row.district_code) result.district_code = String(row.district_code);
    if (row.latitude != null || row.longitude != null) {
      if (
        row.latitude == null ||
        row.longitude == null ||
        String(row.latitude).trim() === '' ||
        String(row.longitude).trim() === ''
      )
        throw Error('Both non-empty coordinates are required when providing a sensor location.');
      const lat = Number(row.latitude),
        lon = Number(row.longitude);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        Math.abs(lat) > 90 ||
        Math.abs(lon) > 180
      )
        throw Error('Invalid sensor coordinates.');
      result.latitude = lat;
      result.longitude = lon;
    }
    if (row.last_seen) {
      if (!Number.isFinite(Date.parse(row.last_seen))) throw Error('Invalid sensor last_seen');
      result.last_seen = row.last_seen;
    }
    if (row.battery != null) {
      const battery = Number(row.battery);
      if (!Number.isFinite(battery) || battery < 0 || battery > 100)
        throw Error('Invalid sensor battery');
      result.battery = battery;
    }
    if (row.firmware) result.firmware = String(row.firmware);
    if (row.status === 'MAINTENANCE') result.status = 'MAINTENANCE';
    return result;
  });
}
export function validateTelemetry(
  input: Record<string, unknown>[],
  sensors: Sensor[],
  received = new Date().toISOString(),
) {
  const issues: IoTIssue[] = [],
    seen = new Set<string>();
  const readings: Reading[] = input.map((raw, index) => {
    safeIoTObject(raw);
    const issue = (field: string, severity: IoTIssue['severity'], reason: string) =>
      issues.push({ row: index + 1, field, severity, reason });
    const time = String(raw.measurement_timestamp ?? raw.timestamp ?? ''),
      sensor = String(raw.sensor_id ?? ''),
      variable = String(raw.variable) as Variable,
      unit = String(raw.unit ?? ''),
      value =
        raw.value === null || raw.value === undefined || String(raw.value).trim() === ''
          ? null
          : Number(raw.value);
    if (!Number.isFinite(Date.parse(time)))
      issue('timestamp', 'INVALID', 'Missing or invalid measurement timestamp');
    if (!sensors.some((s) => s.sensor_id === sensor))
      issue('sensor_id', 'INVALID', 'Sensor is not registered');
    if (!(variable in units)) issue('variable', 'INVALID', 'Unsupported environmental variable');
    else if (unit !== units[variable])
      issue('unit', 'INVALID', 'Unsupported unit; no automatic conversion');
    if (value === null) issue('value', 'MISSING', 'Measurement value is missing');
    else if (
      !Number.isFinite(value) ||
      (['rainfall_mm', 'mosquito_count'].includes(variable) && value < 0) ||
      (['humidity_pct', 'battery_pct'].includes(variable) && (value < 0 || value > 100)) ||
      (variable === 'mosquito_count' && !Number.isSafeInteger(value))
    )
      issue('value', 'INVALID', 'Impossible measurement');
    else if (
      (variable === 'temperature_c' && (value < -40 || value > 60)) ||
      (variable === 'pressure_hpa' && (value < 800 || value > 1100))
    )
      issue('value', 'WARNING', 'Reading is outside the research plausibility range; retained');
    const arrival = String(raw.received_timestamp ?? received);
    if (
      !Number.isFinite(Date.parse(arrival)) ||
      (Number.isFinite(Date.parse(time)) && Date.parse(arrival) < Date.parse(time))
    )
      issue(
        'received_timestamp',
        'INVALID',
        'Synchronization time cannot precede measurement time',
      );
    const key = sensor + '|' + variable + '|' + time;
    if (seen.has(key))
      issue('timestamp', 'INVALID', 'Duplicate sensor-variable measurement timestamp');
    seen.add(key);
    if (
      raw.quality_flag === 'INVALID' ||
      raw.quality_flag === 'MISSING' ||
      raw.quality_flag === 'WARNING'
    )
      issue('quality_flag', raw.quality_flag, 'Source quality flag retained');
    const flags = issues.filter((i) => i.row === index + 1).map((i) => i.severity);
    return {
      timestamp: time,
      measurement_timestamp: time,
      received_timestamp: arrival,
      sensor_id: sensor,
      district_code: raw.district_code ? String(raw.district_code) : undefined,
      variable,
      value: Number.isFinite(value) ? value : null,
      unit,
      quality_flag: flags.includes('INVALID')
        ? 'INVALID'
        : flags.includes('MISSING')
          ? 'MISSING'
          : flags.length
            ? 'WARNING'
            : 'VALID',
      source: String(raw.source ?? 'Local environmental import'),
    };
  });
  return { readings, issues };
}
export type SensorStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'MAINTENANCE' | 'NOT CONNECTED';
export function sensorHealth(
  sensor: Sensor,
  readings: Reading[],
  settings = defaultIoTSettings,
  now = Date.now(),
) {
  const all = readings.filter((r) => r.sensor_id === sensor.sensor_id),
    valid = all
      .filter((r) => ['VALID', 'WARNING'].includes(r.quality_flag) && r.value !== null)
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)),
    latest = valid.at(-1),
    last = latest?.timestamp ?? sensor.last_seen;
  const battery =
    valid.filter((r) => r.variable === 'battery_pct').at(-1)?.value ?? sensor.battery ?? null;
  const age = last ? Math.max(0, (now - Date.parse(last)) / 3600000) : null;
  const missing = all.filter((r) => r.quality_flag === 'MISSING').length,
    invalid = all.filter((r) => r.quality_flag === 'INVALID').length;
  const gaps: { from: string; to: string; hours: number }[] = [];
  for (const variable of Object.keys(units)) {
    const series = valid.filter((r) => r.variable === variable);
    for (let i = 1; i < series.length; i++) {
      const hours =
        (Date.parse(series[i].timestamp) - Date.parse(series[i - 1].timestamp)) / 3600000;
      if (hours > settings.gapHours)
        gaps.push({ from: series[i - 1].timestamp, to: series[i].timestamp, hours });
    }
  }
  const status: SensorStatus =
    sensor.status === 'MAINTENANCE'
      ? 'MAINTENANCE'
      : !latest
        ? 'NOT CONNECTED'
        : age !== null && age > settings.offlineHours
          ? 'OFFLINE'
          : (battery !== null && battery < settings.lowBattery) ||
              invalid ||
              missing ||
              gaps.length ||
              all.some((r) => r.quality_flag === 'WARNING')
            ? 'DEGRADED'
            : 'ONLINE';
  return {
    sensor,
    status,
    latest,
    lastSeen: last ?? null,
    age,
    battery,
    missing,
    invalid,
    gaps,
    completeness: all.length ? (valid.length / all.length) * 100 : null,
    outlierRate: all.length
      ? (all.filter((r) => r.quality_flag === 'WARNING').length / all.length) * 100
      : null,
  };
}
export type IoTAlert = {
  id: string;
  sensor: string;
  district: string;
  metric: string;
  value: number | null;
  threshold: number | null;
  timestamp: string;
  reason: string;
  severity: 'WARNING' | 'ATTENTION';
  simulation: boolean;
};
export function iotAlerts(
  sensors: Sensor[],
  readings: Reading[],
  settings = defaultIoTSettings,
  now = Date.now(),
): IoTAlert[] {
  return sensors.flatMap((s) => {
    const h = sensorHealth(s, readings, settings, now),
      alerts: IoTAlert[] = [];
    const add = (
      metric: string,
      value: number | null,
      threshold: number | null,
      reason: string,
      time = h.lastSeen ?? new Date(now).toISOString(),
    ) =>
      alerts.push({
        id: s.sensor_id + '|' + metric + '|' + time,
        sensor: s.sensor_id,
        district: s.district,
        metric,
        value,
        threshold,
        timestamp: time,
        reason,
        severity: 'ATTENTION',
        simulation: !!s.simulation,
      });
    if (h.status === 'OFFLINE')
      add(
        'Sensor Offline',
        h.age,
        settings.offlineHours,
        'No recent accepted measurement; this is sensor health, not a malaria warning.',
      );
    if (!h.latest) add('No Reading', null, null, 'No valid environmental measurement connected.');
    if (h.battery !== null && h.battery < settings.lowBattery)
      add(
        'Low Battery',
        h.battery,
        settings.lowBattery,
        'Latest battery is below the configured threshold.',
      );
    if (h.missing >= 2)
      add('Repeated Missing Values', h.missing, 2, 'At least two source measurements are missing.');
    if (h.invalid)
      add(
        'Invalid Reading',
        h.invalid,
        0,
        'Invalid measurements are retained in the quality report and excluded from analytical summaries.',
      );
    if (h.gaps.length)
      add(
        'Time Gap',
        Math.max(...h.gaps.map((g) => g.hours)),
        settings.gapHours,
        'Measurement intervals exceed the configured gap.',
      );
    const valid = readings
      .filter(
        (r) =>
          r.sensor_id === s.sensor_id &&
          r.value !== null &&
          ['VALID', 'WARNING'].includes(r.quality_flag),
      )
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    const rain = valid.filter((r) => r.variable === 'rainfall_mm').at(-1);
    if (rain && rain.value! > settings.rainfallThreshold)
      add(
        'Rainfall Threshold',
        rain.value,
        settings.rainfallThreshold,
        'Latest rainfall measurement exceeds the configured threshold; accumulation interval is source-defined.',
        rain.timestamp,
      );
    for (const variable of ['temperature_c', 'humidity_pct'] as const) {
      const series = valid.filter((r) => r.variable === variable),
        last = series.at(-1),
        past = series.slice(0, -1);
      if (last && past.length >= 3) {
        const mean = past.reduce((s, r) => s + r.value!, 0) / past.length,
          sd = Math.sqrt(past.reduce((s, r) => s + (r.value! - mean) ** 2, 0) / (past.length - 1)),
          z = sd ? (last.value! - mean) / sd : null,
          threshold = variable === 'temperature_c' ? settings.temperatureZ : settings.humidityZ;
        if (z !== null && Math.abs(z) > threshold)
          add(
            variable === 'temperature_c' ? 'Temperature Anomaly' : 'Humidity Anomaly',
            z,
            threshold,
            'Absolute historical sample z-score exceeds the configured threshold.',
            last.timestamp,
          );
      }
    }
    return alerts;
  });
}
export function districtSensorSummary(
  sensors: Sensor[],
  readings: Reading[],
  settings = defaultIoTSettings,
  now = Date.now(),
) {
  return [...new Set(sensors.map((s) => s.district))].map((district) => {
    const group = sensors.filter((s) => s.district === district),
      valid = readings.filter(
        (r) =>
          group.some((s) => s.sensor_id === r.sensor_id) &&
          r.value !== null &&
          ['VALID', 'WARNING'].includes(r.quality_flag),
      );
    const mean = (variable: Variable) => {
      const latest = group
        .map((s) =>
          valid
            .filter((r) => r.sensor_id === s.sensor_id && r.variable === variable)
            .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
            .at(-1),
        )
        .filter((r) => r !== undefined);
      return latest.length ? latest.reduce((sum, r) => sum + r!.value!, 0) / latest.length : null;
    };
    return {
      district,
      sensors: group.length,
      sensorsWithReadings: group.filter((s) => valid.some((r) => r.sensor_id === s.sensor_id))
        .length,
      latest:
        valid.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).at(-1)?.timestamp ??
        null,
      rainfall: mean('rainfall_mm'),
      temperature: mean('temperature_c'),
      humidity: mean('humidity_pct'),
      completeness:
        (group.filter((s) => valid.some((r) => r.sensor_id === s.sensor_id)).length /
          group.length) *
        100,
      alerts: iotAlerts(group, readings, settings, now).length,
      simulation: group.some((s) => s.simulation),
    };
  });
}
export function simulationFrame(step: number, district: string, start: number) {
  const sensor: Sensor = {
    sensor_id: 'SIM-ENV-1',
    sensor_name: 'Environmental interface demonstration',
    sensor_type: 'weather station',
    district,
    installation_type: 'In-memory demonstration',
    data_source: 'Isolated deterministic simulation',
    verification_status: 'SIMULATION',
    simulation: true,
  };
  const timestamp = new Date(start + step * 60000).toISOString();
  const values: Partial<Record<Variable, number>> = {
    rainfall_mm: 10 + (step % 5) * 3,
    temperature_c: 25 + Math.sin(step / 3),
    humidity_pct: 80 + Math.sin(step / 4) * 4,
    battery_pct: Math.max(5, 100 - step),
  };
  const readings = Object.entries(values).map(([variable, value]) => ({
    sensor_id: sensor.sensor_id,
    timestamp,
    measurement_timestamp: timestamp,
    received_timestamp: timestamp,
    variable: variable as Variable,
    value: value!,
    unit: units[variable as Variable],
    quality_flag: 'VALID' as const,
    source: 'SIMULATED SENSOR STREAM — NOT OBSERVED DATA',
    simulation: true,
  }));
  return { sensor, readings };
}
