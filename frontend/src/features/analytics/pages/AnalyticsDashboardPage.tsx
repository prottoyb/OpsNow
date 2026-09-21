import { PageHeading } from '../../../components/ui/PageHeading';
import type { TabDefinition } from '../../../components/ui/Tabs';
import { Tabs } from '../../../components/ui/Tabs';
import { useAuth } from '../../auth/useAuth';
import { useTicketCategories } from '../../tickets/useTickets';
import { AgentAnalyticsPanel } from '../components/AgentAnalyticsPanel';
import { AnalyticsFilterBar } from '../components/AnalyticsFilterBar';
import { CategoryAnalyticsPanel } from '../components/CategoryAnalyticsPanel';
import { SlaAnalyticsPanel } from '../components/SlaAnalyticsPanel';
import { TicketAnalyticsPanel } from '../components/TicketAnalyticsPanel';
import { useCanViewAgentAnalytics } from '../useAnalytics';
import type { AnalyticsTab } from '../useAnalyticsParams';
import { useAnalyticsParams } from '../useAnalyticsParams';

/**
 * Staff-only management dashboard (routed through `AnalyticsDashboardRoute`,
 * which renders "page not found" for anyone else). Agent performance is
 * narrower still — TeamLead and Administrator — so that tab is not offered to
 * a SupportAgent and its request is never made. Both are UI courtesies; the
 * backend's `@Roles()` guards are the enforcement.
 *
 * Only the visible tab requests data (`active`), so opening the dashboard is
 * one request, not four; a tab's figures stay cached once loaded.
 */
export function AnalyticsDashboardPage() {
  const { user } = useAuth();
  const canViewAgents = useCanViewAgentAnalytics();
  const categoriesQuery = useTicketCategories();
  const {
    filters,
    tab,
    query,
    rangeError,
    setFilters,
    setTab,
    clearFilters,
    hasActiveFilters,
  } = useAnalyticsParams(user?.id ?? '', canViewAgents);

  const panelProps = (id: AnalyticsTab) => ({
    query,
    rangeError,
    active: tab === id,
  });

  const tabs: TabDefinition[] = [
    {
      id: 'tickets',
      label: 'Tickets',
      panel: <TicketAnalyticsPanel {...panelProps('tickets')} />,
    },
    {
      id: 'sla',
      label: 'SLA',
      panel: <SlaAnalyticsPanel {...panelProps('sla')} />,
    },
    {
      id: 'categories',
      label: 'Categories',
      panel: <CategoryAnalyticsPanel {...panelProps('categories')} />,
    },
  ];
  if (canViewAgents) {
    tabs.push({
      id: 'agents',
      label: 'Agent performance',
      panel: <AgentAnalyticsPanel {...panelProps('agents')} />,
    });
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeading>Dashboard</PageHeading>

      <AnalyticsFilterBar
        filters={filters}
        categories={categoriesQuery.data ?? []}
        rangeError={rangeError}
        hasActiveFilters={hasActiveFilters}
        onChange={setFilters}
        onClear={clearFilters}
      />

      <Tabs
        label="Analytics views"
        tabs={tabs}
        activeId={tab}
        onChange={(id) => setTab(id as AnalyticsTab)}
      />
    </section>
  );
}
