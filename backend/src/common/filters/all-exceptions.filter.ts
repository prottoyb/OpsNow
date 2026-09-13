import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!isHttpException || status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${status}`);
    }

    const details = this.resolveDetails(exception, isHttpException);

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...details,
    });
  }

  /**
   * Preserves any extra diagnostic fields an HttpException body carries
   * (e.g. Terminus's `info`/`error`/`details` on a health-check failure)
   * instead of collapsing every exception down to a bare message. Never
   * exposes anything beyond what the exception's own public response
   * already contained — an internal (non-Http) error always becomes a
   * generic message, with the real error logged server-side only, above.
   */
  private resolveDetails(
    exception: unknown,
    isHttpException: boolean,
  ): Record<string, unknown> {
    if (!isHttpException) {
      return { message: 'Internal server error' };
    }

    const httpException = exception as HttpException;
    const exceptionResponse = httpException.getResponse();

    if (typeof exceptionResponse === 'string') {
      return { message: exceptionResponse };
    }

    if (exceptionResponse && typeof exceptionResponse === 'object') {
      const { message, statusCode: _statusCode, ...rest } =
        exceptionResponse as Record<string, unknown>;
      return {
        message: (message as string | string[] | undefined) ?? httpException.message,
        ...rest,
      };
    }

    return { message: httpException.message };
  }
}
