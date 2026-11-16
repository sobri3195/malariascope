import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const script = readFileSync(new URL('../public/mobile-sw.js', import.meta.url), 'utf8');
function worker(options: { openFailure?: boolean; putFailure?: boolean; vary?: boolean } = {}) {
  const handlers = new Map<string, (event: any) => void>(),
    messages: any[] = [];
  const cache = {
    put: async () => {
      if (options.putFailure) throw Error('Quota');
    },
    match: async (_key: unknown, config?: { ignoreVary?: boolean }) =>
      options.vary && !config?.ignoreVary ? undefined : new Response('cached'),
  };
  const self = {
    location: { origin: 'https://example.test' },
    clients: { matchAll: async () => [], claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener: (key: string, handler: (event: any) => void) => handlers.set(key, handler),
  };
  runInNewContext(
    script,
    {
      self,
      URL,
      Headers,
      Response,
      Date,
      caches: {
        open: async () => {
          if (options.openFailure) throw Error('Cache denied');
          return cache;
        },
      },
      fetch: async () => new Response('network', { status: 200 }),
    },
    { timeout: 1000 },
  );
  return { handlers, messages };
}
test('mobile warm-up checks Vary-insensitive cached URLs and acknowledges the requesting client', async () => {
  const w = worker({ vary: true });
  let pending: Promise<unknown> | undefined;
  w.handlers.get('message')!({
    data: { type: 'CACHE_VISITED', urls: ['https://example.test/assets/test.js'] },
    source: { postMessage: (m: unknown) => w.messages.push(m) },
    waitUntil: (p: Promise<unknown>) => {
      pending = p;
    },
  });
  await pending;
  assert.ok(w.messages.some((m) => m.type === 'MALARIASCOPE_CACHE_STATUS' && m.ready === true));
});
for (const options of [{ putFailure: true }, { openFailure: true }])
  test(`mobile network response remains available when cache fails: ${JSON.stringify(options)}`, async () => {
    const w = worker(options);
    let pending: Promise<Response> | undefined;
    w.handlers.get('fetch')!({
      request: {
        url: 'https://example.test/data/research-summary.json',
        method: 'GET',
        mode: 'cors',
      },
      respondWith: (p: Promise<Response>) => {
        pending = p;
      },
    });
    const response = await pending;
    assert.equal(response?.status, 200);
    assert.equal(await response?.text(), 'network');
  });
test('mobile worker does not cache uploads or private endpoints', () => {
  const w = worker();
  let intercepted = false;
  for (const [url, method] of [
    ['https://example.test/api/private', 'GET'],
    ['https://example.test/data/research-summary.json', 'POST'],
    ['https://external.test/data/research-summary.json', 'GET'],
  ])
    w.handlers.get('fetch')!({
      request: { url, method, mode: 'cors' },
      respondWith: () => {
        intercepted = true;
      },
    });
  assert.equal(intercepted, false);
});
