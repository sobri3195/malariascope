import { chromium } from '@playwright/test';
const base=process.env.APP_URL||'http://127.0.0.1:5173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH||'/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base+'/dashboard');
await page.getByRole('heading', { name: 'Command Dashboard', exact: true }).waitFor();
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/malariascope-desktop.png', fullPage: true });
console.log('Dashboard loaded', await page.locator('.metric').allTextContents());
await page.getByLabel('Global year').selectOption('2020');
if (!(await page.locator('.metric').first().innerText()).includes('104,544'))
  throw Error('Year filter did not update aggregate');
const csv =
  'district,year,cases,population,rainfall,temperature,prediction,model\nTest District,2024,100,1000,1200,25,90,Random Forest\nTest District,2025,200,1000,1400,26,170,Random Forest\nSecond District,2025,600,1000,1500,27,550,Random Forest\nThird District,2025,100,1000,1300,24,80,Random Forest\n';
await page.goto(base+'/data-center');
await page
  .getByLabel('Import dataset')
  .setInputFiles({ name: 'test-only-fixture.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
await page.getByRole('button', { name: 'Load validated data' }).click();
await page.getByText('Dataset loaded. Existing datasets were preserved.').waitFor();
await page.goto(base+'/dashboard');
await page.getByLabel('Global year').selectOption('2025');
if (!(await page.locator('.metric').first().innerText()).includes('900'))
  throw Error('Import total incorrect');
await page.goto(base+'/early-warning');
await page.getByLabel('Rule threshold', { exact:true }).first().fill('150');
await page.getByRole('button', { name:'Save rule', exact:true }).first().click();
await page.goto(base+'/alerts');
await page.getByLabel('Status for Test District').first().selectOption('ACKNOWLEDGED');
await page.reload();
if ((await page.getByLabel('Status for Test District').first().inputValue()) !== 'ACKNOWLEDGED')
  throw Error('Acknowledgement not persisted');
await page.goto(base+'/force-health');
await page.getByLabel('Readiness district',{exact:true}).selectOption('Test District');
await page.getByLabel('Readiness domain',{exact:true}).selectOption('diagnostics');
await page.getByLabel('Diagnostic capability documented',{exact:true}).selectOption('AVAILABLE');
await page.reload();
if ((await page.getByLabel('Diagnostic capability documented',{exact:true}).inputValue()) !== 'AVAILABLE')
  throw Error('Checklist not persisted');
await page.goto(base+'/data-center');
await page
  .getByLabel('Import dataset')
  .setInputFiles({
    name: 'bad.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('district,year\nTest,2025\n'),
  });
if (await page.getByRole('button', { name: 'Load validated data' }).isEnabled())
  throw Error('Missing fields allowed');
await page
  .getByLabel('Import dataset')
  .setInputFiles({
    name: 'duplicates.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('district,year,cases\nTest,2025,1\nTEST.,2025,2\n'),
  });
if (await page.getByRole('button', { name: 'Load validated data' }).isEnabled())
  throw Error('Duplicates allowed');
// Geometries and values below are isolated test fixtures, never production seed evidence.
const geometry={type:'FeatureCollection',features:['Test District','Second District','Third District'].map((name,i)=>({type:'Feature',properties:{district:name},geometry:{type:'Polygon',coordinates:[[[138+i,-3.8],[139+i,-3.8],[139+i,-3.6],[138+i,-3.6],[138+i,-3.8]]]}}))};
await page.getByLabel('Import dataset').setInputFiles({name:'test-only-geometry.geojson',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(geometry))});
await page.getByRole('button',{name:'Load validated data'}).click();
await page.getByText('Administrative geometry connected.').waitFor();
await page.goto(base+'/spatial-analysis');
await page.getByRole('button',{name:'Run spatial analysis',exact:true}).click();
await page.getByRole('heading',{name:'Global spatial association · loaded observations'}).waitFor();
if(await page.locator('.spatial-stats strong').last().innerText()!=='3')throw Error('Spatial matching failed');
await page.goto(base+'/risk-map');await page.getByRole('button',{name:'Layers',exact:true}).click();await page.getByLabel('Map indicator').selectOption('risk');
await page.locator('.leaflet-interactive').first().click({force:true});await page.getByLabel('District intelligence drawer').waitFor();
await page.getByLabel('Close district drawer').click();await page.getByLabel('Global district').selectOption('All districts');
await page.goto(base+'/risk-intelligence');await page.getByLabel('Global model').selectOption('Random Forest');await page.getByLabel('Risk mode').selectOption('MODEL-ASSISTED RISK');
await page.getByRole('button',{name:'How was this risk calculated?'}).first().click();await page.getByRole('dialog',{name:'Risk calculation'}).waitFor();await page.keyboard.press('Escape');if(await page.getByRole('dialog').count())throw Error('Dialog Escape failed');
await page.getByLabel('Risk mode').selectOption('SPATIAL RISK');await page.getByRole('table',{name:'District risk calculations'}).waitFor();
if((await page.locator('tbody').innerText()).includes('INSUFFICIENT DATA'))throw Error('Spatial risk did not use loaded neighbors');
await page.goto(base+'/settings');await page.getByLabel('Snapshot name').fill('Browser acceptance snapshot');await page.getByRole('button',{name:'Save snapshot'}).click();
await page.goto(base+'/reports');await page.getByLabel('Report type').selectOption('Model Performance Report');await page.getByRole('button',{name:'Generate report'}).click();
const [reportDownload]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export JSON',exact:true}).click()]);if(reportDownload.suggestedFilename()!=='analytical-report.json')throw Error('Report export failed');
await page.goto(base+'/scenario');const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('malariascope-v1')).datasets);await page.locator('.form-row').first().locator('input').fill('500');const [scenarioDownload]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Save scenario separately'}).click()]);if(scenarioDownload.suggestedFilename()!=='exploratory-scenario.json')throw Error('Scenario export failed');const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('malariascope-v1')).datasets);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Scenario changed observed dataset');
for (const route of [
  'dashboard',
  'risk-map',
  'surveillance',
  'district-intelligence',
  'climate',
  'forecasting',
  'model-benchmarking',
  'spatial-analysis',
  'early-warning',
  'risk-intelligence',
  'force-health',
  'scenario',
  'data-center',
  'data-quality',
  'reports',
  'alerts',
  'audit',
  'settings',
  'methodology',
  'provenance',
  'about',
  'presentation',
]) {
  await page.goto(`${base}/${route}`);
  await page.locator('h1').first().waitFor();
  if (await page.locator('.fatal').count()) throw Error(`Route crashed: ${route}`);
}
await page.evaluate(() => localStorage.clear());
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base+'/dashboard');
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/malariascope-mobile.png', fullPage: true });
if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1))
  throw Error('Mobile overflow');
console.log('Browser routes and import/alerts/readiness flows passed. Page errors:', errors);
if (errors.length) throw Error(errors.join('\n'));
await browser.close();
