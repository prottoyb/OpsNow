import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { AppProviders } from './providers';
import { AppRoutes } from './router';

/**
 * The outer boundary is the backstop for the shell itself — the layout, the
 * providers, the login page — none of which sit inside AppLayout's
 * page-level boundary. It has no reset key because there is no navigation
 * left to recover through if the router or a provider is the thing that
 * threw; reloading is the only honest option at that point.
 */
export function App() {
  return (
    <ErrorBoundary title="OpsNow could not start">
      <BrowserRouter>
        <AppProviders>
          <AppRoutes />
        </AppProviders>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
