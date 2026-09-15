import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Input } from '../../components/ui/Input';
import { PageHeading } from '../../components/ui/PageHeading';
import { FullPageSpinner } from '../../components/ui/Spinner';
import { toApiError } from '../../lib/api/errors';
import { useAuth } from './useAuth';

interface RedirectState {
  from?: string;
}

export function LoginPage() {
  const { status, sessionExpired, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as RedirectState | null)?.from ?? '/tickets';

  if (status === 'bootstrapping') {
    return <FullPageSpinner label="Checking your session" />;
  }
  if (status === 'authenticated') {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessages([]);

    // A light client-side pre-check only. The backend's ValidationPipe is
    // the authority and its messages are rendered verbatim below.
    if (email.trim() === '' || password === '') {
      setErrorMessages(['Enter your email address and password.']);
      return;
    }

    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (error) {
      setErrorMessages(toApiError(error).messages);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <PageHeading>Sign in to OpsNow</PageHeading>

      {sessionExpired ? (
        <p
          role="status"
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Your session expired. Please sign in again.
        </p>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormField id="email" label="Email address" required>
          {({ id, describedBy, required }) => (
            <Input
              id={id}
              name="email"
              type="email"
              autoComplete="username"
              required={required}
              value={email}
              aria-describedby={describedBy}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </FormField>

        <FormField id="password" label="Password" required>
          {({ id, describedBy, required }) => (
            <Input
              id={id}
              name="password"
              type="password"
              autoComplete="current-password"
              required={required}
              value={password}
              aria-describedby={describedBy}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </FormField>

        {/* Announced when it appears, without stealing focus from the form. */}
        <div aria-live="assertive">
          {errorMessages.length > 0 ? (
            <div className="rounded-md border border-red-300 bg-red-50 p-3">
              <p className="text-sm font-semibold text-red-900">
                Could not sign you in
              </p>
              <ul className="mt-1 list-disc pl-5 text-sm text-red-900">
                {errorMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </main>
  );
}
