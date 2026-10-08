export type Adapter = 'HTTP polling' | 'WebSocket' | 'MQTT over WebSocket';
export function validateFeedURL(value: string, adapter: Adapter) {
  const url = new URL(value);
  if (
    url.protocol !== (adapter === 'HTTP polling' ? 'https:' : 'wss:') ||
    url.username ||
    url.password ||
    /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname) ||
    url.hostname.endsWith('.local') ||
    url.hostname.endsWith('.localhost') ||
    /^(0\.|169\.254\.|\[::|\[f[cd]|\[fe80)/i.test(url.hostname) ||
    [...url.searchParams.keys()].some((k) => /key|token|password|secret/i.test(k))
  )
    throw Error(
      'Use a public secure feed URL without credentials, private addresses or secret query parameters.',
    );
  return url;
}
const encode = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  return [bytes.length >> 8, bytes.length & 255, ...bytes];
};
function packet(header: number, bytes: number[]) {
  const size = [];
  let n = bytes.length;
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n) b |= 128;
    size.push(b);
  } while (n);
  return new Uint8Array([header, ...size, ...bytes]);
}
export function mqttConnect() {
  return packet(0x10, [
    ...encode('MQTT'),
    4,
    2,
    0,
    60,
    ...encode('malariascope-' + crypto.randomUUID()),
  ]);
}
export function mqttSubscribe(topic: string) {
  if (!topic || topic.length > 256 || /password|secret|token|military|personnel/i.test(topic))
    throw Error('Use a public environmental topic only.');
  return packet(0x82, [0, 1, ...encode(topic), 0]);
}
export function connectFeed(options: {
  adapter: Adapter;
  url: string;
  topic: string;
  seconds: number;
  onData: (data: unknown) => void;
  onStatus: (status: string) => void;
}) {
  const url = validateFeedURL(options.url, options.adapter);
  if (options.adapter === 'HTTP polling') {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
        if (!response.ok) throw Error('HTTP feed unavailable');
        options.onData(await response.json());
        options.onStatus('CONNECTED');
      } catch {
        if (!controller.signal.aborted)
          options.onStatus('ERROR — optional live feed unavailable; local data remain usable.');
      }
    };
    void load();
    const timer = setInterval(() => void load(), Math.max(5, options.seconds) * 1000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }
  const socket =
    options.adapter === 'MQTT over WebSocket' ? new WebSocket(url, ['mqtt']) : new WebSocket(url);
  socket.binaryType = 'arraybuffer';
  let buffer = new Uint8Array(0);
  socket.onopen = () => {
    options.onStatus('PARTIAL — awaiting validated telemetry');
    if (options.adapter === 'MQTT over WebSocket') socket.send(mqttConnect());
  };
  socket.onmessage = (e) => {
    try {
      if (options.adapter === 'WebSocket') {
        options.onData(JSON.parse(String(e.data)));
        options.onStatus('CONNECTED');
        return;
      }
      const incoming = new Uint8Array(e.data);
      if (buffer.length + incoming.length > 1048576) throw Error('Environmental packet too large');
      const next = new Uint8Array(buffer.length + incoming.length);
      next.set(buffer);
      next.set(incoming, buffer.length);
      buffer = next;
      while (buffer.length > 1) {
        let complete = false;
        let size = 0,
          multiplier = 1,
          i = 1;
        while (i < buffer.length) {
          const byte = buffer[i++];
          size += (byte & 127) * multiplier;
          multiplier *= 128;
          if (!(byte & 128)) {
            complete = true;
            break;
          }
          if (i > 5) throw Error('Invalid MQTT frame');
        }
        if (!complete || i + size > buffer.length) return;
        const header = buffer[0],
          body = buffer.slice(i, i + size);
        buffer = buffer.slice(i + size);
        if (header >> 4 === 2) {
          if (body[1] !== 0) throw Error('Broker connection rejected');
          socket.send(mqttSubscribe(options.topic));
        } else if (header >> 4 === 3) {
          if ((header & 6) !== 0)
            throw Error('Only anonymous QoS 0 environmental messages supported');
          const topicLength = (body[0] << 8) | body[1];
          options.onData(JSON.parse(new TextDecoder().decode(body.slice(topicLength + 2))));
          options.onStatus('CONNECTED');
        }
      }
    } catch {
      options.onStatus('ERROR — invalid live environmental payload; local data remain usable.');
    }
  };
  socket.onerror = () =>
    options.onStatus('ERROR — optional live feed unavailable; local data remain usable.');
  socket.onclose = () => options.onStatus('NOT CONNECTED');
  const ping = setInterval(() => {
    if (socket.readyState === WebSocket.OPEN && options.adapter === 'MQTT over WebSocket')
      socket.send(new Uint8Array([0xc0, 0]));
  }, 30000);
  return () => {
    clearInterval(ping);
    socket.close();
  };
}
