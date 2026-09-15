import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { ErrorState, InlineNotice } from '../../../components/ui/ErrorState';
import { PageHeading } from '../../../components/ui/PageHeading';
import { FullPageSpinner, Spinner } from '../../../components/ui/Spinner';
import { Tabs } from '../../../components/ui/Tabs';
import { toApiError } from '../../../lib/api/errors';
import { formatDateTime, fullName, toDateTimeAttribute } from '../../../lib/format';
import type {
  CommentVisibility,
  Ticket,
  TicketPriority,
  TicketStatus,
  UpdateTicketInput,
} from '../../../types/api';
import { useAuth, useIsStaff } from '../../auth/useAuth';
import { AssignmentControl } from '../components/AssignmentControl';
import { CommentForm } from '../components/CommentForm';
import { CommentList } from '../components/CommentList';
import { HistoryList } from '../components/HistoryList';
import { PriorityControl } from '../components/PriorityControl';
import { StatusControl } from '../components/StatusControl';
import { TicketForm } from '../components/TicketForm';
import type { TicketFormValues } from '../components/TicketForm';
import { statusLabel } from '../transitions';
import {
  TicketPriorityBadge,
  TicketStatusBadge,
} from '../components/TicketStatusBadge';
import {
  useCreateTicketComment,
  useRefetchTicket,
  useTicket,
  useTicketCategories,
  useTicketComments,
  useTicketHistory,
  useUpdateTicket,
  useUpdateTicketAssignment,
  useUpdateTicketPriority,
  useUpdateTicketStatus,
} from '../useTickets';

interface Notice {
  tone: 'warning' | 'success';
  text: string;
}

const CONFLICT_TEXT =
  'Someone else changed this ticket while you were working on it. The latest version has been reloaded — please review it and try again.';

export function TicketDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isStaff = useIsStaff();

  const ticketQuery = useTicket(id);
  const commentsQuery = useTicketComments(id);
  // Not requested at all for an Employee: the endpoint is staff-only and
  // would only ever answer 403.
  const historyQuery = useTicketHistory(id, isStaff);
  const categoriesQuery = useTicketCategories();
  const refetchTicket = useRefetchTicket(id);

  const updateTicket = useUpdateTicket(id);
  const updateStatus = useUpdateTicketStatus(id);
  const updatePriority = useUpdateTicketPriority(id);
  const updateAssignment = useUpdateTicketAssignment(id);
  const createComment = useCreateTicketComment(id);

  const [activeTab, setActiveTab] = useState('comments');
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editMessages, setEditMessages] = useState<string[]>([]);
  const [commentMessages, setCommentMessages] = useState<string[]>([]);

  /**
   * Shared failure handling for every mutation on this page.
   *
   * 403 and 409 both mean "the server's view of this ticket is no longer the
   * one this page was rendered from", so both show an inline explanation AND
   * refetch — leaving the stale view on screen would invite the user to retry
   * the same doomed action.
   *
   * Both also close the edit form. The refetch can flip `canEditDetails` to
   * false (e.g. the requester's ticket has left `New`), and a form left open
   * over a ticket the server will no longer accept edits to is a dead end: its
   * Save button re-submits the same doomed request indefinitely, while the
   * explanation of *why* editing stopped never renders.
   */
  function closeEditForm() {
    setEditing(false);
    setEditMessages([]);
  }

  function handleMutationError(error: unknown, setMessages?: (m: string[]) => void) {
    const apiError = toApiError(error);

    if (apiError.isConflict) {
      setNotice({ tone: 'warning', text: CONFLICT_TEXT });
      closeEditForm();
      refetchTicket();
      return;
    }
    if (apiError.isForbidden) {
      setNotice({ tone: 'warning', text: apiError.messages[0] });
      closeEditForm();
      refetchTicket();
      return;
    }
    if (setMessages) {
      setMessages(apiError.messages);
      return;
    }
    setNotice({ tone: 'warning', text: apiError.messages[0] });
  }

  if (ticketQuery.isPending) {
    return <FullPageSpinner label="Loading ticket" />;
  }

  if (ticketQuery.isError) {
    return renderLoadError(ticketQuery.error, () => void ticketQuery.refetch());
  }

  const ticket = ticketQuery.data;
  const canEditDetails = isStaff || ticket.status === 'New';

  function handleEditSubmit(values: TicketFormValues) {
    setEditMessages([]);

    // Minimal diff only. `forbidNonWhitelisted` turns any extra property into
    // a 400, so a fetched ticket is never spread into the body. An unchanged
    // field is omitted rather than resent.
    const input: UpdateTicketInput = {};
    if (values.subject !== ticket.subject) input.subject = values.subject;
    if (values.description !== ticket.description) {
      input.description = values.description;
    }
    if (values.categoryId !== '' && values.categoryId !== ticket.category?.id) {
      input.categoryId = values.categoryId;
    }

    if (Object.keys(input).length === 0) {
      setEditing(false);
      return;
    }

    updateTicket.mutate(input, {
      onSuccess: () => {
        setEditing(false);
        setNotice({ tone: 'success', text: 'Ticket updated.' });
      },
      onError: (error) => handleMutationError(error, setEditMessages),
    });
  }

  function handleStatusChange(status: TicketStatus) {
    setNotice(null);
    updateStatus.mutate(status, {
      onSuccess: (updated) =>
        setNotice({
          tone: 'success',
          // statusLabel, not the raw enum: "In progress", not "InProgress".
          text: `Status changed to ${statusLabel(updated.status)}.`,
        }),
      onError: (error) => handleMutationError(error),
    });
  }

  function handlePriorityChange(priority: TicketPriority) {
    setNotice(null);
    updatePriority.mutate(priority, {
      onSuccess: () => setNotice({ tone: 'success', text: 'Priority updated.' }),
      onError: (error) => handleMutationError(error),
    });
  }

  function handleAssignmentChange(assigneeId: string | null) {
    setNotice(null);
    updateAssignment.mutate(assigneeId, {
      onSuccess: () =>
        setNotice({
          tone: 'success',
          text: assigneeId ? 'Ticket assigned to you.' : 'Ticket unassigned.',
        }),
      onError: (error) => handleMutationError(error),
    });
  }

  function handleCommentSubmit(
    body: string,
    visibility: CommentVisibility,
    onSubmitted: () => void,
  ) {
    setCommentMessages([]);
    createComment.mutate(
      { body, visibility },
      {
        onSuccess: () => {
          // Only now is it safe to clear the composer.
          onSubmitted();
          setNotice({ tone: 'success', text: 'Comment posted.' });
        },
        onError: (error) => handleMutationError(error, setCommentMessages),
      },
    );
  }

  const commentsPanel = (
    <div className="flex flex-col gap-4">
      {commentsQuery.isPending ? <Spinner label="Loading comments" /> : null}
      {commentsQuery.isError ? (
        <ErrorState
          title="Could not load comments"
          messages={toApiError(commentsQuery.error).messages}
          onRetry={() => void commentsQuery.refetch()}
        />
      ) : null}
      {commentsQuery.isSuccess ? (
        <CommentList
          comments={commentsQuery.data.data}
          canSeeInternal={isStaff}
        />
      ) : null}
      <CommentForm
        canPostInternal={isStaff}
        submitting={createComment.isPending}
        serverMessages={commentMessages}
        onSubmit={handleCommentSubmit}
      />
    </div>
  );

  const historyPanel = (
    <div className="flex flex-col gap-4">
      {historyQuery.isPending ? <Spinner label="Loading history" /> : null}
      {historyQuery.isError ? (
        <ErrorState
          title="Could not load history"
          messages={toApiError(historyQuery.error).messages}
          onRetry={() => void historyQuery.refetch()}
        />
      ) : null}
      {historyQuery.isSuccess ? (
        <HistoryList entries={historyQuery.data.data} />
      ) : null}
    </div>
  );

  const tabs = [
    { id: 'comments', label: 'Comments', panel: commentsPanel },
    // The History tab exists for staff only.
    ...(isStaff
      ? [{ id: 'history', label: 'History', panel: historyPanel }]
      : []),
  ];

  return (
    <section className="flex flex-col gap-6">
      <PageHeading>
        #{ticket.ticketNumber} — {ticket.subject}
      </PageHeading>

      <div className="flex flex-wrap items-center gap-2">
        <TicketStatusBadge status={ticket.status} />
        <TicketPriorityBadge priority={ticket.priority} />
        {ticket.category ? (
          <span className="text-sm text-slate-600">{ticket.category.name}</span>
        ) : null}
      </div>

      {/*
        The live region is rendered unconditionally and the notice swapped
        inside it. A region inserted into the DOM already containing its text
        is not reliably announced — assistive technology has to be observing
        the node before the content changes.
      */}
      <div aria-live="polite" aria-atomic="true">
        {notice ? (
          <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <article className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">Details</h2>
            {/*
              Gated on `canEditDetails` as well as `editing`: a refetch after a
              403 can withdraw edit permission, and the form must not survive
              that.
            */}
            {editing && canEditDetails ? (
              <div className="mt-3">
                <TicketForm
                  mode="edit"
                  initialValues={{
                    subject: ticket.subject,
                    description: ticket.description,
                    categoryId: ticket.category?.id ?? '',
                    priority: ticket.priority,
                  }}
                  categories={categoriesQuery.data ?? []}
                  submitting={updateTicket.isPending}
                  serverMessages={editMessages}
                  submitLabel="Save changes"
                  onSubmit={handleEditSubmit}
                  onCancel={() => {
                    setEditing(false);
                    setEditMessages([]);
                  }}
                />
              </div>
            ) : (
              <>
                {/* Plain text node; line breaks preserved by CSS only. */}
                <p className="user-content mt-2 text-sm text-slate-800">
                  {ticket.description}
                </p>
                {canEditDetails ? (
                  <div className="mt-4">
                    <Button
                      variant="secondary"
                      onClick={() => setEditing(true)}
                    >
                      Edit details
                    </Button>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-600">
                    This ticket can no longer be edited because work has
                    started on it.
                  </p>
                )}
              </>
            )}
          </article>

          <Tabs
            tabs={tabs}
            activeId={activeTab}
            onChange={setActiveTab}
            label="Ticket activity"
          />
        </div>

        <aside className="flex flex-col gap-6">
          <section className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">Status</h2>
            <div className="mt-3">
              <StatusControl
                status={ticket.status}
                role={user?.role ?? 'Employee'}
                submitting={updateStatus.isPending}
                onChange={handleStatusChange}
              />
            </div>
          </section>

          {/* Priority and assignment are staff-only affordances. */}
          {isStaff ? (
            <section className="rounded-md border border-slate-200 bg-white p-4">
              <h2 className="text-base font-semibold text-slate-900">
                Triage
              </h2>
              <div className="mt-3 flex flex-col gap-4">
                <PriorityControl
                  priority={ticket.priority}
                  submitting={updatePriority.isPending}
                  onChange={handlePriorityChange}
                />
                <AssignmentControl
                  assignee={ticket.assignee}
                  currentUserId={user?.id ?? ''}
                  submitting={updateAssignment.isPending}
                  onAssign={handleAssignmentChange}
                />
              </div>
            </section>
          ) : null}

          <TicketMetadata ticket={ticket} />
        </aside>
      </div>
    </section>
  );
}

function TicketMetadata({ ticket }: { ticket: Ticket }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-slate-900">About</h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="font-medium text-slate-700">Requester</dt>
        <dd className="text-slate-800">{fullName(ticket.requester)}</dd>
        <dt className="font-medium text-slate-700">Assignee</dt>
        <dd className="text-slate-800">
          {ticket.assignee ? fullName(ticket.assignee) : 'Unassigned'}
        </dd>
        <dt className="font-medium text-slate-700">Created</dt>
        <dd className="text-slate-800">
          <time dateTime={toDateTimeAttribute(ticket.createdAt)}>
            {formatDateTime(ticket.createdAt)}
          </time>
        </dd>
        <dt className="font-medium text-slate-700">Updated</dt>
        <dd className="text-slate-800">
          <time dateTime={toDateTimeAttribute(ticket.updatedAt)}>
            {formatDateTime(ticket.updatedAt)}
          </time>
        </dd>
        {ticket.reopenedCount > 0 ? (
          <>
            <dt className="font-medium text-slate-700">Reopened</dt>
            <dd className="text-slate-800">{ticket.reopenedCount} time(s)</dd>
          </>
        ) : null}
      </dl>
    </section>
  );
}

function renderLoadError(error: unknown, retry: () => void) {
  const apiError = toApiError(error);

  /*
   * 404 copy must never hint that the ticket might exist but belong to
   * someone else. The backend returns 404 rather than 403 for an out-of-scope
   * ticket precisely so an Employee cannot confirm another employee's ticket
   * exists (ADR-019); wording it as "not yours" would hand that back.
   */
  if (apiError.isNotFound) {
    return (
      <section className="flex flex-col gap-4">
        <PageHeading>Ticket not found</PageHeading>
        <p className="text-sm text-slate-600">
          We could not find that ticket.
        </p>
        <Link
          to="/tickets"
          className="text-sm font-medium text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Back to tickets
        </Link>
      </section>
    );
  }

  // `ParseUUIDPipe` runs before the handler, so a malformed id is a 400, not
  // a 404 — the same "no such ticket" outcome needs its own branch.
  if (apiError.isValidationError) {
    return (
      <section className="flex flex-col gap-4">
        <PageHeading>Invalid ticket reference</PageHeading>
        <p className="text-sm text-slate-600">
          That ticket reference is not valid.
        </p>
        <Link
          to="/tickets"
          className="text-sm font-medium text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Back to tickets
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <PageHeading>Ticket</PageHeading>
      <ErrorState
        title="Could not load this ticket"
        messages={apiError.messages}
        onRetry={retry}
      />
    </section>
  );
}
