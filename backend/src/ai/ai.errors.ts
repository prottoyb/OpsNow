import { ServiceUnavailableException } from '@nestjs/common';
import { AiFailureReason } from './ai.types';

/**
 * The single client-visible AI failure (ADR-023 Decision 8):
 * `{ statusCode: 503, code: 'AI_UNAVAILABLE', reason }`. AllExceptionsFilter
 * spreads an HttpException's extra body fields into the response, so `code`
 * and `reason` reach the client unchanged. No vendor detail is ever attached.
 */
export class AiUnavailableException extends ServiceUnavailableException {
  constructor(readonly reason: AiFailureReason) {
    super({
      code: 'AI_UNAVAILABLE',
      reason,
      message: 'The AI assistant is unavailable',
    });
  }
}
