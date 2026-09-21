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
    const status: number = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    // Any 5xx, not just 500: a 502/503 from a downstream dependency is
    // also something an operator needs the stack for. Written as a plain
    // number because `status` is a plain number here — comparing it to a
    // HttpStatus enum member is the sloppier form, not the safer one.
    const isServerError = status >= 500;

    if (!isHttpException || isServerError) {
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
        message: message ?? httpException.message,
        ...rest,
      };
    }

    return { message: httpException.message };
  }
}
