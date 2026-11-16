import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const run = promisify(execFile);
export class FetchFailure extends Error {
  constructor(message, status = 0, kind = 'failed', retryAt = null) {
    super(message);
    this.status = status;
    this.kind = kind;
    this.retryAt = retryAt;
  }
}
export function checkedUrl(input, hosts) {
  const url = new URL(input);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !hosts.includes(url.hostname) ||
    (url.port && url.port !== '443')
  )
    throw new FetchFailure('URL di luar sumber HTTPS yang dikonfigurasi.', 0, 'review-required');
  return url.href;
}
export async function curlTransport(url, { timeoutMs, maxBytes }) {
  const directory = await mkdtemp(join(tmpdir(), 'malaria-http-'));
  try {
    const body = join(directory, 'body'),
      headersFile = join(directory, 'headers');
    let result;
    try {
      result = await run(
        'curl',
        [
          '--silent',
          '--show-error',
          '--max-time',
          String(timeoutMs / 1000),
          '--max-filesize',
          String(maxBytes),
          '--proto',
          '=https',
          '--dump-header',
          headersFile,
          '--output',
          body,
          '--write-out',
          '%{http_code}',
          url,
        ],
        { maxBuffer: 65536, timeout: timeoutMs + 2000 },
      );
    } catch (e) {
      const msg = String(e.stderr || e.message);
      if (/exceeds|Maximum file size|size exceeded/i.test(msg))
        throw new FetchFailure('Unduhan melebihi batas ukuran.', 0, 'review-required');
      if (/(?:response|code) 403|Domain forbidden/i.test(msg))
        throw new FetchFailure('Akses sumber ditolak kebijakan jaringan (HTTP 403).', 403);
      throw new FetchFailure(/timed out|timeout/i.test(msg) ? 'Timeout penarikan sumber.' : msg);
    }
    const bytes = await readFile(body);
    if (bytes.length > maxBytes)
      throw new FetchFailure('Unduhan melebihi batas ukuran.', 0, 'review-required');
    const blocks = (await readFile(headersFile, 'utf8')).trim().split(/\r?\n\r?\n/);
    const last = blocks.at(-1) || '';
    const headers = {};
    for (const line of last.split(/\r?\n/).slice(1)) {
      const i = line.indexOf(':');
      if (i > 0) headers[line.slice(0, i).toLowerCase()] = line.slice(i + 1).trim();
    }
    return { status: Number(result.stdout), headers, body: bytes };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
export function retryDelay(value, now) {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const time = Date.parse(value);
  return Number.isFinite(time) ? Math.max(0, time - now) : null;
}
export function createDownloader({
  hosts,
  transport = curlTransport,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  clock = Date.now,
  attempts = 3,
  timeoutMs = 20000,
  maxBytes = 32 * 1024 * 1024,
  maxDelayMs = 30000,
} = {}) {
  return async function download(input, options = {}) {
    let url = checkedUrl(input, hosts),
      redirects = 0;
    const limit = options.maxBytes ?? maxBytes;
    for (let attempt = 0; attempt < attempts; attempt++) {
      let response;
      try {
        response = await transport(url, { timeoutMs, maxBytes: limit });
      } catch (e) {
        if (
          e.kind === 'review-required' ||
          e.kind === 'retry-later' ||
          e.status === 403 ||
          attempt + 1 === attempts
        )
          throw e;
        await sleep(Math.min(1000 * 2 ** attempt, maxDelayMs));
        continue;
      }
      if (response.body.length > limit)
        throw new FetchFailure('Unduhan melebihi batas ukuran.', 0, 'review-required');
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (++redirects > 3 || !response.headers.location)
          throw new FetchFailure('Redirect sumber tidak sah.');
        url = checkedUrl(new URL(response.headers.location, url), hosts);
        attempt--;
        continue;
      }
      if (response.status >= 200 && response.status < 300) return { ...response, url };
      const transient = [408, 429, 500, 502, 503, 504].includes(response.status);
      const requested = retryDelay(response.headers['retry-after'], clock());
      const retryAt = requested !== null ? new Date(clock() + requested).toISOString() : null;
      if (!transient || attempt + 1 === attempts)
        throw new FetchFailure(
          `HTTP ${response.status} dari sumber resmi.`,
          response.status,
          'failed',
          transient ? retryAt : null,
        );
      const delay = requested ?? Math.min(1000 * 2 ** attempt, maxDelayMs);
      if (delay > maxDelayMs)
        throw new FetchFailure(
          `Retry-After ${delay} ms: pemeriksaan ditunda sampai ${new Date(clock() + delay).toISOString()}.`,
          response.status,
          'retry-later',
          retryAt,
        );
      await sleep(delay);
    }
    throw new FetchFailure('Batas percobaan penarikan tercapai.');
  };
}
