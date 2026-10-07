/* Dedicated /mobile scope; caches public research assets, never uploaded records. */
const CACHE = 'malariascope-mobile-v2';
const PUBLIC = [
  '/data/research-summary.json',
  '/data/model-performance.json',
  '/data/spatial-analysis.json',
  '/data/data-provenance.json',
  '/data/boundaries.geojson',
  '/data/geography/papua-context.geojson',
  '/data/geography/geometry-metadata.json',
];
const allowed = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith('/assets/') || PUBLIC.includes(url.pathname));
async function save(cache, key, response) {
  if (!response.ok) return;
  const headers = new Headers(response.headers);
  headers.set('X-Malariascope-Cached-At', new Date().toISOString());
  await cache.put(
    key,
    new Response(await response.clone().arrayBuffer(), { status: response.status, headers }),
  );
}
async function warm(urls = []) {
  const cache = await caches.open(CACHE);
  await Promise.all(
    [
      '/mobile',
      ...PUBLIC,
      ...urls.filter((s) => {
        try {
          return allowed(new URL(s));
        } catch {
          return false;
        }
      }),
    ].map(async (url) => {
      try {
        const r = await fetch(url);
        if (r.ok) await save(cache, url, r);
      } catch {
        /* Keep an existing cached copy. */
      }
    }),
  );
  const visited = urls.filter((s) => {
    try {
      return allowed(new URL(s));
    } catch {
      return false;
    }
  });
  const complete = await Promise.all(
    ['/mobile', ...PUBLIC, ...visited].map((url) => cache.match(url)),
  );
  if (visited.length && complete.every(Boolean)) {
    for (const client of await self.clients.matchAll())
      client.postMessage({ type: 'MALARIASCOPE_CACHE_READY' });
  }
}
self.addEventListener('install', (event) => {
  event.waitUntil(warm().then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CACHE_VISITED')
    event.waitUntil(warm(Array.isArray(event.data.urls) ? event.data.urls : []));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url),
    nav =
      event.request.mode === 'navigate' &&
      (url.pathname === '/mobile' || url.pathname.startsWith('/mobile/'));
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    (!nav && !allowed(url))
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE),
        key = nav ? '/mobile' : event.request;
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          await save(cache, key, response);
          return response;
        }
        throw Error('Public asset unavailable');
      } catch {
        // Public same-origin files do not vary by Origin; module requests carry
        // Origin while the warm-up fetches do not. Preserve the exact URL key.
        const cached = await cache.match(key, { ignoreVary: true });
        if (!cached)
          return new Response('This mobile module has not been cached. Reconnect to load it.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          });
        const headers = new Headers(cached.headers);
        headers.set('X-Malariascope-Cached', 'true');
        return new Response(await cached.arrayBuffer(), { status: cached.status, headers });
      }
    })(),
  );
});
