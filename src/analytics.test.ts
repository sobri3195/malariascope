import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validate,
  incidence,
  change,
  evaluate,
  risk,
  performance,
  correlation,
  normalize,
  metric,
  toCSV,
} from './analytics.ts';
test('imports reject missing fields, negative burden, invalid population and empty input', () => {
  assert.equal(validate([{ district: 'A', year: 2025 }]).issues[0].severity, 'ERROR');
  assert.ok(validate([{ district: 'A', year: 2025, cases: -1 }]).issues.length);
  assert.ok(validate([{ district: 'A', year: 2025, cases: 1, population: 0 }]).issues.length);
  assert.ok(validate([]).issues.length);
});
test('duplicate district-years are detected across case and punctuation variations', () => {
  const r = validate([
    { district: 'Jayapura', year: 2025, cases: 1 },
    { district: 'JAYAPURA.', year: 2025, cases: 2 },
  ]);
  assert.ok(r.issues.some((i) => i.message.includes('Duplicate')));
  assert.equal(normalize('  Mamberamo   Raya.'), 'mamberamo raya '.trim());
});
test('incidence, risk and change preserve unavailable values', () => {
  const a = { district: 'A', year: 2024, cases: 100, population: 1000 },
    b = { district: 'A', year: 2025, cases: 200, population: 1000 };
  assert.equal(incidence(b), 200);
  assert.equal(risk(b), 'MODERATE');
  assert.equal(change(b, [a, b]), 100);
  assert.equal(incidence({ ...b, population: undefined }), null);
  assert.equal(risk({ ...b, population: undefined }), 'INSUFFICIENT DATA');
});
test('alerts respect enabled rules and never trigger on missing inputs', () => {
  const rows = [{ district: 'A', year: 2025, cases: 300 }];
  const rule = {
    id: '1',
    metric: 'incidence' as const,
    operator: '>' as const,
    value: 10,
    enabled: true,
    severity: 'WATCH',
  };
  assert.equal(evaluate(rows, [rule]).length, 0);
  assert.equal(evaluate(rows, [{ ...rule, metric: 'cases' }]).length, 1);
  assert.equal(evaluate(rows, [{ ...rule, metric: 'cases', enabled: false }]).length, 0);
});
test('validation metrics use paired observations and handle constant outcomes', () => {
  const p = performance([
    { district: 'A', year: 2025, cases: 10, prediction: 12 },
    { district: 'B', year: 2025, cases: 20, prediction: 16 },
  ]);
  assert.equal(p?.mae, 3);
  assert.equal(p?.rmse, Math.sqrt(10));
  assert.equal(p?.r2, 0.6);
  assert.equal(performance([]), null);
  assert.equal(
    correlation([
      [1, 2],
      [2, 4],
      [3, 6],
    ]),
    1,
  );
});

test('compound rules combine actual metrics and scope alert identity by dataset',()=>{const rows=[{district:'A',year:2024,cases:10},{district:'A',year:2025,cases:20}];const rule={id:'compound',metric:'cases' as const,operator:'>' as const,value:15,enabled:true,severity:'WATCH',join:'AND' as const,secondary:{metric:'change' as const,operator:'>' as const,value:50}};const alerts=evaluate(rows,[rule],'dataset-a');assert.equal(alerts.length,1);assert.ok(alerts[0].reason.includes('AND'));assert.notEqual(alerts[0].id,evaluate(rows,[rule],'dataset-b')[0].id);assert.equal(evaluate(rows,[{...rule,secondary:{...rule.secondary,value:150}}]).length,0);});

test('climate and prediction alert metrics require enough historical evidence',()=>{const rows=[2021,2022,2023,2024].map((year,i)=>({district:'A',year,cases:100+i*10,rainfall:100+i*10,prediction:200}));assert.equal(metric(rows[0],rows,'rainfall_anomaly'),null);assert.ok(metric(rows[3],rows,'rainfall_anomaly')!>1);assert.equal(metric(rows[3],rows,'consecutive_increase'),3);assert.equal(metric(rows[3],rows,'missing_fields'),2);assert.equal(metric(rows[3],rows,'climate_age'),0);});

test('CSV export retains numeric signs and protects text formula cells',()=>{const csv=toCSV([{district:'=SUM(A1:A2)',year:2025,cases:1,temperature:-2}]);assert.ok(csv.includes("\"'=SUM(A1:A2)\""));assert.ok(csv.includes(',-2,'));});

test('district resolver keeps city and regency identities separate',()=>{assert.equal(normalize('Kabupaten Jayapura'),'jayapura');assert.equal(normalize('Jayapura Regency'),'jayapura');assert.equal(normalize('Jayapura City'),'kota jayapura');assert.notEqual(normalize('Jayapura City'),normalize('Jayapura Regency'));});

import {moran} from './moran.ts';
test('Moran permutation results are reproducible and reject undefined variance',()=>{const input={names:['A','B','C','D'],values:[10,20,60,80],neighbors:[[1],[0,2],[1,3],[2]]};const a=moran(input,99,2025),b=moran(input,99,2025);assert.deepEqual(a,b);assert.equal(a.expected,-1/3);assert.equal(a.distribution.length,99);assert.ok(a.pValue>=.01&&a.pValue<=1);assert.throws(()=>moran({...input,values:[1,1,1,1]},99));assert.throws(()=>moran(input,0));});
