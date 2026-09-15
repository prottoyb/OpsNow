import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { LoginPage } from '../features/auth/LoginPage';
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
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
