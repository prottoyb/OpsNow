import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AssetCreatePage } from '../features/assets/pages/AssetCreatePage';
import { AssetDetailPage } from '../features/assets/pages/AssetDetailPage';
import { AssetListPage } from '../features/assets/pages/AssetListPage';
import { AnalyticsDashboardPage } from '../features/analytics/pages/AnalyticsDashboardPage';
import { AuditLogPage } from '../features/audit/pages/AuditLogPage';
import { useCanViewAudit } from '../features/audit/useAudit';
import { LoginPage } from '../features/auth/LoginPage';
import { useIsStaff } from '../features/auth/useAuth';
import { ArticleCreatePage } from '../features/knowledge-base/pages/ArticleCreatePage';
import { ArticleDetailPage } from '../features/knowledge-base/pages/ArticleDetailPage';
import { ArticleListPage } from '../features/knowledge-base/pages/ArticleListPage';
import { SlaDashboardPage } from '../features/sla/pages/SlaDashboardPage';
import { TicketCreatePage } from '../features/tickets/pages/TicketCreatePage';
import { TicketDetailPage } from '../features/tickets/pages/TicketDetailPage';
import { TicketListPage } from '../features/tickets/pages/TicketListPage';
import { AppLayout } from './AppLayout';
import { NotFoundPage } from './NotFoundPage';
import { ProtectedRoute } from './ProtectedRoute';

/**
 * Keyed by ticket id so navigating between two tickets remounts the page.
 * The detail page holds local UI state (open edit form, active tab, last
 * notice) that belongs to one ticket; without this, going from A to B would
 * carry A's "Ticket updated." notice or open editor over B.
 */
function TicketDetailRoute() {
  const { id = '' } = useParams<{ id: string }>();
  return <TicketDetailPage key={id} />;
}

/**
 * The SLA dashboard is staff-only. A non-staff user gets the app's ordinary
 * "page not found" rather than a page that mounts and then shows a 403: the
 * dashboard's queries never run for them, so there is nothing to 403 on, and
 * confirming that a page exists but is off-limits tells them more than they
 * need to know. The real gate is the backend's `@Roles()` guard — this only
 * decides what is offered.
 */
function SlaDashboardRoute() {
  return useIsStaff() ? <SlaDashboardPage /> : <NotFoundPage />;
}

/**
 * Keyed by asset id for the same reason as `TicketDetailRoute`: the page
 * holds local UI state (open edit form, active tab, last notice) that
 * belongs to one asset.
 */
function AssetDetailRoute() {
  const { id = '' } = useParams<{ id: string }>();
  return <AssetDetailPage key={id} />;
}

/**
 * Asset creation is staff-only on the backend (`POST /assets`). Same
 * precedent as `SlaDashboardRoute`: an Employee gets the ordinary "page not
 * found" rather than a page that mounts and then fails.
 */
function AssetCreateRoute() {
  return useIsStaff() ? <AssetCreatePage /> : <NotFoundPage />;
}

/**
 * Keyed by article id for the same reason as `TicketDetailRoute`: the page
 * holds local UI state (open edit form, active tab, last notice, an unsent
 * feedback comment) that belongs to one article.
 */
function ArticleDetailRoute() {
  const { id = '' } = useParams<{ id: string }>();
  return <ArticleDetailPage key={id} />;
}

/**
 * Article creation is staff-only on the backend (`POST /kb-articles`). Same
 * precedent as `AssetCreateRoute`: an Employee gets the ordinary "page not
 * found" rather than a page that mounts and then fails.
 */
function ArticleCreateRoute() {
  return useIsStaff() ? <ArticleCreatePage /> : <NotFoundPage />;
}

/**
 * The analytics dashboard is staff-only on the backend (`GET /analytics/*`).
 * Same precedent as `SlaDashboardRoute`: anyone else gets the ordinary "page
 * not found" rather than a page that mounts and then fails. The agent tab
 * inside it is narrower again and gated in the page itself.
 */
function AnalyticsDashboardRoute() {
  return useIsStaff() ? <AnalyticsDashboardPage /> : <NotFoundPage />;
}

/**
 * The audit log is Administrator-only on the backend (`GET /audit-logs`), a
 * narrower gate than staff. Anyone else gets the ordinary "page not found"
 * and the page never mounts, so its query never fires.
 */
function AuditLogRoute() {
  return useCanViewAudit() ? <AuditLogPage /> : <NotFoundPage />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/tickets" replace />} />
        <Route path="/tickets" element={<TicketListPage />} />
        <Route path="/tickets/new" element={<TicketCreatePage />} />
        <Route path="/tickets/:id" element={<TicketDetailRoute />} />
        <Route path="/assets" element={<AssetListPage />} />
        <Route path="/assets/new" element={<AssetCreateRoute />} />
        <Route path="/assets/:id" element={<AssetDetailRoute />} />
        {/* Open to every role: self-service search is the half of the
            knowledge base that exists for Employees. */}
        <Route path="/kb" element={<ArticleListPage />} />
        <Route path="/kb/new" element={<ArticleCreateRoute />} />
        <Route path="/kb/:id" element={<ArticleDetailRoute />} />
        <Route path="/sla" element={<SlaDashboardRoute />} />
        <Route path="/dashboard" element={<AnalyticsDashboardRoute />} />
        <Route path="/audit" element={<AuditLogRoute />} />
        <Route path="*"element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
