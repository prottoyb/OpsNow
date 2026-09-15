import { Link } from 'react-router-dom';
import { PageHeading } from '../components/ui/PageHeading';

export function NotFoundPage() {
  return (
    <section className="flex flex-col gap-4">
      <PageHeading>Page not found</PageHeading>
      <p className="text-sm text-slate-600">
        The page you asked for does not exist.
      </p>
      <Link
        to="/tickets"
        className="text-sm font-medium text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        Go to tickets
      </Link>
    </section>
  );
}
