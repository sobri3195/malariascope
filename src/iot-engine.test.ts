import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSensors,
  validateTelemetry,
  sensorHealth,
  iotAlerts,
  simulationFrame,
  districtSensorSummary,
} from './iot/iot-engine.ts';
import { validateFeedURL, mqttSubscribe, mqttConnect, connectFeed } from './iot/live-adapters.ts';
const sensor = {
  sensor_id: 'fixture',
  sensor_name: 'Isolated acceptance sensor',
  sensor_type: 'weather station',
  district: 'Jayapura',
  installation_type: 'Research plot',
  data_source: 'Automated test only',
  verification_status: 'USER IMPORT',
};
const sensors = validateSensors([sensor]);
const read = (
  value: unknown,
  variable = 'rainfall_mm',
  unit = 'mm',
  timestamp = '2026-01-01T00:00:00Z',
) => ({
  sensor_id: 'fixture',
  value,
  variable,
  unit,
  timestamp,
  received_timestamp: '2026-01-02T00:00:00Z',
});
test('empty sensor datasets stay empty; coordinates are optional but never fabricated as zero', () => {
  assert.deepEqual(validateSensors([]), []);
  assert.deepEqual(districtSensorSummary([], []), []);
  assert.equal(sensors[0].latitude, undefined);
  for (const coords of [
    { latitude: '', longitude: '' },
    { latitude: 20 },
    { latitude: 91, longitude: 2 },
  ])
    assert.throws(() => validateSensors([{ ...sensor, ...coords }]), /coordinates|location/);
  assert.throws(() => validateSensors([sensor, sensor]), /Duplicate/);
});
test('credentials, private addresses, sensitive metadata and imported simulations are rejected atomically', () => {
  for (const fields of [
    { military_location: 'x' },
    { data_source: '192.168.1.2' },
    { password: 'secret' },
    { simulation: true },
    { simulation: 'true' },
    { source: 'SIMULATED SENSOR STREAM — NOT OBSERVED DATA' },
  ])
    assert.throws(() => validateSensors([{ ...sensor, ...fields }]));
  assert.throws(() => validateTelemetry([{ ...read(5), simulation: true }], sensors), /Simulated/);
});
test('telemetry preserves invalid and missing measurements, units and delayed synchronization', () => {
  const { readings, issues } = validateTelemetry(
    [
      read(-1),
      read(101, 'humidity_pct', '%'),
      read(120, 'battery_pct', '%'),
      read(10, 'temperature_c', 'F'),
      read(null),
      read(5),
    ],
    sensors,
  );
  assert.equal(readings.length, 6);
  assert.equal(readings[0].value, -1);
  assert.ok(issues.some((i) => i.reason.includes('Duplicate')));
  assert.equal(readings[4].value, null);
  assert.ok(readings.every((r) => r.quality_flag !== 'VALID'));
  const delayed = validateTelemetry([read(5)], sensors).readings[0];
  assert.equal(delayed.measurement_timestamp, '2026-01-01T00:00:00Z');
  assert.equal(delayed.received_timestamp, '2026-01-02T00:00:00Z');
  assert.equal(delayed.quality_flag, 'VALID');
});
test('health and alerts derive thresholds and missing coverage without malaria directives', () => {
  assert.equal(sensorHealth(sensors[0], []).status, 'NOT CONNECTED');
  const outlier = validateTelemetry([read(-50, 'temperature_c', '°C')], sensors).readings;
  assert.equal(
    sensorHealth(sensors[0], outlier, undefined, Date.parse('2026-01-01T01:00Z')).status,
    'DEGRADED',
  );
  const rows = validateTelemetry([read(120), read(10, 'battery_pct', '%')], sensors).readings;
  const alerts = iotAlerts(sensors, rows, undefined, Date.parse('2026-01-04'));
  assert.ok(alerts.some((a) => a.metric === 'Sensor Offline'));
  assert.ok(alerts.some((a) => a.metric === 'Low Battery'));
  assert.ok(alerts.some((a) => a.metric === 'Rainfall Threshold'));
  assert.equal(
    sensorHealth(sensors[0], rows, undefined, Date.parse('2026-01-01T01:00Z')).status,
    'DEGRADED',
  );
  assert.equal(districtSensorSummary(sensors, rows)[0].rainfall, 120);
  assert.deepEqual(iotAlerts(sensors, rows, undefined, Date.parse('2026-01-04')), alerts);
});
test('deterministic simulation labels every measurement and never has invented coordinates', () => {
  const frame = simulationFrame(1, 'Jayapura', Date.parse('2026-01-01'));
  assert.equal(frame.sensor.simulation, true);
  assert.equal(frame.sensor.latitude, undefined);
  assert.ok(
    frame.readings.every(
      (r) => r.simulation && r.source === 'SIMULATED SENSOR STREAM — NOT OBSERVED DATA',
    ),
  );
  assert.deepEqual(frame, simulationFrame(1, 'Jayapura', Date.parse('2026-01-01')));
  assert.throws(() => validateTelemetry(frame.readings, sensors));
});
test('optional adapters reject unsafe URLs; MQTT frames require no credentials', () => {
  for (const url of [
    'http://example.com',
    'https://127.0.0.1',
    'https://10.0.0.1',
    'https://example.com?token=secret',
    'https://user:pw@example.com',
  ])
    assert.throws(() => validateFeedURL(url, 'HTTP polling'));
  assert.equal(validateFeedURL('wss://example.com', 'MQTT over WebSocket').protocol, 'wss:');
  assert.equal(mqttConnect()[0], 0x10);
  assert.equal(mqttSubscribe('public/environment')[0], 0x82);
  assert.throws(() => mqttSubscribe('secret'));
});
test('optional HTTP adapter failure reports an error and leaves caller data untouched', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error('Isolated unavailable feed');
  };
  try {
    const statuses: string[] = [],
      values: unknown[] = [];
    const stop = connectFeed({
      adapter: 'HTTP polling',
      url: 'https://example.com',
      topic: '',
      seconds: 60,
      onStatus: (s) => statuses.push(s),
      onData: (d) => values.push(d),
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    stop();
    assert.ok(statuses.some((s) => s.startsWith('ERROR')));
    assert.deepEqual(values, []);
  } finally {
    globalThis.fetch = original;
  }
});
