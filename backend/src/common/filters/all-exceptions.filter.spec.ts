import {
  ArgumentsHost,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function createHost(url: string, method: string) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const request = { url, method };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  it('preserves Terminus-style diagnostic fields on a health-check failure', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = createHost('/api/v1/health', 'GET');

    const exception = new ServiceUnavailableException({
      status: 'error',
      info: {},
      error: { database: { status: 'down', message: 'connect ECONNREFUSED' } },
      details: {
        database: { status: 'down', message: 'connect ECONNREFUSED' },
      },
    });

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 503,
        path: '/api/v1/health',
        error: { database: { status: 'down', message: 'connect ECONNREFUSED' } },
        details: {
          database: { status: 'down', message: 'connect ECONNREFUSED' },
        },
      }),
    );
  });

  it('never leaks internal error details for a non-HTTP exception', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = createHost('/api/v1/whatever', 'GET');

    filter.catch(new Error('secret internal detail'), host);

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('secret internal detail');
  });
});
