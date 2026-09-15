import { HttpResponse, http } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { IDS, employeeUser } from '../../../mocks/fixtures';
import { mockState, resetMockState } from '../../../mocks/handlers';
import { server } from '../../../mocks/server';
import { renderApp } from '../../../test/renderApp';

const BASE = '*/api/v1';

async function renderCreatePage() {
  renderApp({ route: '/tickets/new' });
  await screen.findByRole('heading', { name: 'New ticket' });
  await screen.findByLabelText(/subject/i);
}

describe('ticket creation — form', () => {
  it('builds optgroups from the flat category list and keeps parents selectable', async () => {
    resetMockState({ currentUser: employeeUser });

    await renderCreatePage();

    const select = screen.getByLabelText('Category');
    const groups = within(select).getAllByRole('group');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveAttribute('label', 'Hardware');

    // The parent is repeated inside its own group as a selectable option:
    // the backend accepts any active category, parent or leaf.
    const hardwareOptions = within(groups[0]).getAllByRole('option');
    expect(hardwareOptions.map((o) => o.textContent)).toEqual([
      'Hardware',
      'Laptop',
    ]);

    const allOptions = within(select).getAllByRole('option');
    expect(allOptions.map((o) => o.textContent)).toEqual([
      'No category',
      'Network',
      'Software',
      'Hardware',
      'Laptop',
    ]);
  });

  it('lets any role choose the initial priority', async () => {
    resetMockState({ currentUser: employeeUser });

    await renderCreatePage();

    const select = screen.getByLabelText('Priority');
    expect(select).toHaveValue('Medium');
    expect(
      within(select).getAllByRole('option').map((o) => o.textContent),
    ).toEqual(['Low', 'Medium', 'High', 'Critical']);
  });

  it('pre-checks required fields without calling the API', async () => {
    resetMockState({ currentUser: employeeUser });
    let posted = 0;
    server.use(
      http.post(`${BASE}/tickets`, () => {
        posted += 1;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    const user = userEvent.setup();

    await renderCreatePage();
    await user.click(screen.getByRole('button', { name: /create ticket/i }));

    expect(await screen.findByText('Enter a subject.')).toBeInTheDocument();
    expect(screen.getByText('Describe the problem.')).toBeInTheDocument();
    expect(posted).toBe(0);
    // Errors are wired to their fields for assistive tech.
    expect(screen.getByLabelText(/subject/i)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('creates a ticket and navigates to it', async () => {
    resetMockState({ currentUser: employeeUser, tickets: [] });
    const user = userEvent.setup();

    await renderCreatePage();

    await user.type(screen.getByLabelText(/subject/i), 'Monitor flickers');
    await user.type(
      screen.getByLabelText(/description/i),
      'It flickers every few minutes.',
    );
    await user.selectOptions(screen.getByLabelText('Category'), IDS.categoryLaptop);
    await user.selectOptions(screen.getByLabelText('Priority'), 'High');
    await user.click(screen.getByRole('button', { name: /create ticket/i }));

    expect(
      await screen.findByRole('heading', { name: /monitor flickers/i }),
    ).toBeInTheDocument();
    await waitFor(() => expect(mockState.tickets).toHaveLength(1));
    expect(mockState.tickets[0].priority).toBe('High');
    expect(mockState.tickets[0].category?.id).toBe(IDS.categoryLaptop);
  });

  it('omits categoryId entirely when no category is chosen', async () => {
    resetMockState({ currentUser: employeeUser, tickets: [] });
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${BASE}/tickets`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { statusCode: 400, message: ['stop here'] },
          { status: 400 },
        );
      }),
    );
    const user = userEvent.setup();

    await renderCreatePage();
    await user.type(screen.getByLabelText(/subject/i), 'No category');
    await user.type(screen.getByLabelText(/description/i), 'Body text');
    await user.click(screen.getByRole('button', { name: /create ticket/i }));

    await screen.findByText('stop here');
    // `forbidNonWhitelisted` rejects unknown keys and categoryId has no null
    // allowance, so the key must be absent rather than empty or null.
    expect('categoryId' in body).toBe(false);
  });

  it('renders every message from a class-validator 400 response', async () => {
    resetMockState({ currentUser: employeeUser });
    server.use(
      http.post(`${BASE}/tickets`, () =>
        HttpResponse.json(
          {
            statusCode: 400,
            timestamp: 't',
            path: '/api/v1/tickets',
            message: [
              'subject must be shorter than or equal to 255 characters',
              'description should not be empty',
            ],
          },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();

    await renderCreatePage();
    await user.type(screen.getByLabelText(/subject/i), 'Anything');
    await user.type(screen.getByLabelText(/description/i), 'Anything');
    await user.click(screen.getByRole('button', { name: /create ticket/i }));

    expect(
      await screen.findByText(
        'subject must be shorter than or equal to 255 characters',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('description should not be empty'),
    ).toBeInTheDocument();
  });

  it('surfaces a category loading failure instead of an empty picker', async () => {
    resetMockState({ currentUser: employeeUser });
    server.use(
      http.get(`${BASE}/ticket-categories`, () =>
        HttpResponse.json({ statusCode: 500, message: 'db down' }, { status: 500 }),
      ),
    );

    renderApp({ route: '/tickets/new' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not load categories/i,
    );
    expect(screen.queryByLabelText(/subject/i)).not.toBeInTheDocument();
  });
});
