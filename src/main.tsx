import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { Provider } from './store';
const Desktop = lazy(() => import('./DesktopApp'));
const Mobile = lazy(() => import('./mobile/MobileApp'));
const Workstation = lazy(() => import('./desktop/DesktopWorkstation'));
const IoT = lazy(() => import('./iot/IoTApp'));
const Watch = lazy(() => import('./watch/WatchApp'));
class ApplicationBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main style={{ padding: 24, fontFamily: 'system-ui' }}>
        <h1>Research workspace unavailable</h1>
        <p>
          A required application asset could not be loaded. Reconnect and reload. Local evidence and
          review state remain in browser storage.
        </p>
        <button style={{ minHeight: 44 }} onClick={() => location.reload()}>
          Reload workspace
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
function ApplicationRouter() {
  const { pathname } = useLocation();
  return (
    <Suspense
      fallback={
        <main role="status" style={{ padding: 24, fontFamily: 'system-ui' }}>
          <h1>Loading research workspace…</h1>
          <p>Your local research state is preserved.</p>
        </main>
      }
    >
      {pathname === '/iot' || pathname.startsWith('/iot/') ? (
        <IoT />
      ) : pathname === '/aplikasi-desktop' || pathname.startsWith('/aplikasi-desktop/') ? (
        <Workstation />
      ) : pathname === '/smartwatch' || pathname === '/smartwatch/' ? (
        <Watch />
      ) : pathname === '/mobile' || pathname.startsWith('/mobile/') ? (
        <Mobile />
      ) : (
        <Desktop />
      )}
    </Suspense>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ApplicationBoundary>
      <BrowserRouter>
        <Provider>
          <ApplicationRouter />
        </Provider>
      </BrowserRouter>
    </ApplicationBoundary>
  </React.StrictMode>,
);
