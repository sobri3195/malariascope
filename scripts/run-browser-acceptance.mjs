import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const suites = (await readdir(new URL('../tests/', import.meta.url)))
  .filter((name) => name.endsWith('.mjs'))
  .sort();
const workers = Number(process.env.BROWSER_WORKERS || 2);
if (!Number.isInteger(workers) || workers < 1 || workers > 4)
  throw Error('BROWSER_WORKERS must be 1–4.');
if (!suites.length) throw Error('No browser acceptance suites found.');
let next = 0;
const failures = [];
async function run(name) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['tests/' + name], {
      cwd: root,
      env: { ...process.env, APP_URL: process.env.APP_URL || 'http://127.0.0.1:4173' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '',
      timeout = false;
    const capture = (data) => {
      output = (output + data).slice(-24000);
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    const timer = setTimeout(() => {
      timeout = true;
      child.kill('SIGTERM');
    }, 240000);
    child.on('error', (e) => {
      output += e.message;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 || timeout) {
        failures.push(name);
        console.error(`FAIL ${name}${timeout ? ' (timeout)' : ''}\n${output}`);
      } else console.log(`PASS ${name}`);
      resolve();
    });
  });
}
await Promise.all(
  Array.from({ length: Math.min(workers, suites.length) }, async () => {
    while (next < suites.length) await run(suites[next++]);
  }),
);
console.log(`Browser acceptance: ${suites.length - failures.length}/${suites.length} passed.`);
if (failures.length) process.exitCode = 1;
