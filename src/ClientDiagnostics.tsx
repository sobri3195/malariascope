import { useEffect, useState } from 'react';
import { download } from './analytics';
type Event = { time: string; kind: string; path: string };
export default function ClientDiagnostics() {
  const [events, setEvents] = useState<Event[]>([]);
  useEffect(() => {
    const add = (kind: string) =>
      setEvents((prev) =>
        [{ time: new Date().toISOString(), kind, path: location.pathname }, ...prev].slice(0, 50),
      );
    const error = () => add('Application/resource error');
    const rejected = () => add('Unhandled asynchronous failure');
    window.addEventListener('error', error, true);
    window.addEventListener('unhandledrejection', rejected);
    return () => {
      window.removeEventListener('error', error, true);
      window.removeEventListener('unhandledrejection', rejected);
    };
  }, []);
  return (
    <section className="panel">
      <h2>Session diagnostics</h2>
      <p>
        {events.length} failures observed while this diagnostics panel was open. Counts do not
        establish uptime or scientific validity. No dataset values, credentials or URL query
        parameters are recorded or transmitted.
      </p>
      <button
        className="button"
        onClick={() =>
          download('session-diagnostics.json', { events, scope: 'Local panel session' })
        }
      >
        Export diagnostics
      </button>
      {events.map((e, i) => (
        <p key={i}>
          {e.time} · {e.kind} · {e.path}
        </p>
      ))}
    </section>
  );
}
