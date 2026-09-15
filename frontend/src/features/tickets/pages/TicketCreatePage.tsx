import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageHeading } from '../../../components/ui/PageHeading';
import { Spinner } from '../../../components/ui/Spinner';
import { toApiError } from '../../../lib/api/errors';
import type { CreateTicketInput } from '../../../types/api';
import { TicketForm } from '../components/TicketForm';
import type { TicketFormValues } from '../components/TicketForm';
import { useCreateTicket, useTicketCategories } from '../useTickets';

export function TicketCreatePage() {
  const navigate = useNavigate();
  const categoriesQuery = useTicketCategories();
  const createTicket = useCreateTicket();
  const [serverMessages, setServerMessages] = useState<string[]>([]);

  function handleSubmit(values: TicketFormValues) {
    setServerMessages([]);

    // A minimal body: `forbidNonWhitelisted` rejects anything the DTO does
    // not declare, and `categoryId` must be omitted rather than sent empty.
    const input: CreateTicketInput = {
      subject: values.subject,
      description: values.description,
      priority: values.priority,
    };
    if (values.categoryId !== '') {
      input.categoryId = values.categoryId;
    }

    createTicket.mutate(input, {
      onSuccess: (ticket) => navigate(`/tickets/${ticket.id}`),
      onError: (error) => setServerMessages(toApiError(error).messages),
    });
  }

  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <PageHeading>New ticket</PageHeading>

      {categoriesQuery.isPending ? <Spinner label="Loading categories" /> : null}

      {/*
        A category is optional on `CreateTicketDto`, so a failed category
        fetch must not take raising a ticket offline — it degrades to a
        non-blocking notice above a form that still works without a category.
        The form waits for `isPending` to clear only so the dropdown does not
        render empty and then repopulate on every load.
      */}
      {categoriesQuery.isError ? (
        <ErrorState
          title="Could not load categories"
          messages={[
            ...toApiError(categoriesQuery.error).messages,
            'You can still raise the ticket without choosing a category.',
          ]}
          onRetry={() => void categoriesQuery.refetch()}
        />
      ) : null}

      {!categoriesQuery.isPending ? (
        <TicketForm
          mode="create"
          initialValues={{
            subject: '',
            description: '',
            categoryId: '',
            priority: 'Medium',
          }}
          categories={categoriesQuery.data ?? []}
          submitting={createTicket.isPending}
          serverMessages={serverMessages}
          submitLabel="Create ticket"
          onSubmit={handleSubmit}
          onCancel={() => navigate('/tickets')}
        />
      ) : null}
    </section>
  );
}
