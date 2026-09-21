import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button } from '../components/ui/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Changing this value resets the boundary. The router passes the current
   * pathname, so navigating away from a page that crashed clears the error
   * instead of the user being stuck on it until a full reload.
   */
  resetKey?: string;
  /** Shown above the message. Defaults to a page-level wording. */
  title?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * The last line between a render-time throw and a blank white page.
 *
 * Without one, any uncaught error during render unmounts the entire React
 * tree — the user loses the navigation, the sign-out control and any unsaved
 * text in a form, and sees nothing at all, which is indistinguishable from
 * the application being down.
 *
 * This is deliberately a class component: `componentDidCatch` /
 * `getDerivedStateFromError` have no hook equivalent, and React still offers
 * no function-component API for catching render errors.
 *
 * What it does NOT do, on purpose:
 *
 *  - It does not render the error's message or stack. A thrown value can
 *    carry anything the code happened to be holding, including data from an
 *    API response the viewer may not be entitled to see in that form. The
 *    detail goes to the console for a developer; the user gets a fixed
 *    string.
 *  - It does not catch errors from event handlers, effects that throw
 *    asynchronously, or failed fetches. React boundaries never have. Data
 *    failures are already handled per-feature by `ErrorState`, which is the
 *    right place for them because it can offer a meaningful retry.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.hasError && previous.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Console only. There is no error-reporting service in this project, and
    // adding one is a deployment decision rather than a frontend one.
    console.error('Unhandled render error', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { title = 'This page could not be displayed' } = this.props;

    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-md border border-red-300 bg-red-50 p-4"
      >
        <div>
          <p className="text-sm font-semibold text-red-900">{title}</p>
          <p className="mt-1 text-sm text-red-900">
            Something went wrong while rendering it. The rest of the
            application is still usable — try another page, or reload.
          </p>
        </div>
        <Button variant="secondary" onClick={this.handleReload}>
          Reload the page
        </Button>
      </div>
    );
  }
}
