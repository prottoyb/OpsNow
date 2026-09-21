import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Boom({ shouldThrow }: { shouldThrow: boolean }): React.JSX.Element {
  if (shouldThrow) {
    // A thrown value can carry anything the failing code was holding. This
    // one carries something that must NOT reach the screen, which is what
    // the leak assertion below checks.
    throw new Error('internal note: agent salary spreadsheet');
  }
  return <p>Page content</p>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs the caught error itself, and the boundary logs it again on
    // purpose. Neither is a test failure; silence both so a passing run is
    // not full of red.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('replaces a crashed subtree with an announced fallback instead of a blank page', () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('This page could not be displayed');
    expect(
      screen.getByRole('button', { name: 'Reload the page' }),
    ).toBeInTheDocument();
  });

  it('never renders the thrown error message', () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );

    expect(document.body.textContent).not.toContain('salary');
    expect(document.body.textContent).not.toContain('internal note');
  });

  it('uses the caller-supplied title', () => {
    render(
      <ErrorBoundary title="OpsNow could not start">
        <Boom shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'OpsNow could not start',
    );
  });

  it('recovers when the reset key changes, as it does on navigation', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [route, setRoute] = useState('/broken');
      return (
        <>
          <button onClick={() => setRoute('/healthy')}>Go elsewhere</button>
          <ErrorBoundary resetKey={route}>
            <Boom shouldThrow={route === '/broken'} />
          </ErrorBoundary>
        </>
      );
    }

    render(<Harness />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Go elsewhere' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('stays in the error state while the reset key is unchanged', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/same">
        <Boom shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Same route, child would now render fine — but the user has not
    // navigated, so the boundary must not silently re-mount a component that
    // just threw and risk an immediate re-throw loop.
    rerender(
      <ErrorBoundary resetKey="/same">
        <Boom shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('logs the real error for a developer even though it is not shown', () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );

    const logged = (console.error as unknown as ReturnType<typeof vi.fn>).mock
      .calls.flat()
      .map(String)
      .join(' ');
    expect(logged).toContain('Unhandled render error');
  });
});
