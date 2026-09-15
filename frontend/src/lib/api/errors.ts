/**
 * The backend's `AllExceptionsFilter` emits
 * `{ statusCode, timestamp, path, message }` where `message` is a string
 * for a hand-thrown HttpException and a **string[]** when class-validator
 * rejects a DTO. Both shapes are normalized here to `messages: string[]`
 * so no call site has to branch on it.
 */
export interface ApiErrorBody {
  statusCode?: number;
  timestamp?: string;
  path?: string;
  message?: string | string[];
}

/** `status: 0` means the request never reached the server (network/abort). */
export const NETWORK_ERROR_STATUS = 0;
/**
 * A throw that is not an ApiError at all (a bug in our own code, not a
 * transport failure). Distinct from NETWORK_ERROR_STATUS so the two cannot be
 * confused by `isNetworkError`.
 */
export const UNKNOWN_ERROR_STATUS = -1;

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
const NETWORK_MESSAGE =
  'Could not reach the server. Check your connection and try again.';

export class ApiError extends Error {
  readonly status: number;
  readonly messages: string[];
  /** The parsed response body, when there was one. Never rendered directly. */
  readonly raw: unknown;

  constructor(status: number, messages: string[], raw: unknown) {
    super(messages[0] ?? GENERIC_MESSAGE);
    this.name = 'ApiError';
    this.status = status;
    this.messages = messages;
    this.raw = raw;
  }

  get isNetworkError(): boolean {
    return this.status === NETWORK_ERROR_STATUS;
  }

  get isValidationError(): boolean {
    return this.status === 400;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  static network(cause?: unknown): ApiError {
    return new ApiError(NETWORK_ERROR_STATUS, [NETWORK_MESSAGE], cause);
  }

  /**
   * A 5xx body is never surfaced verbatim: the backend already replaces an
   * internal error with a generic message, but this is the client-side half
   * of the same rule — no server internals reach the UI.
   */
  static fromResponse(status: number, body: unknown): ApiError {
    if (status >= 500) {
      return new ApiError(status, [GENERIC_MESSAGE], body);
    }
    return new ApiError(status, normalizeMessages(body), body);
  }
}

function normalizeMessages(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) {
    return [GENERIC_MESSAGE];
  }

  const { message } = body as ApiErrorBody;

  if (typeof message === 'string' && message.trim() !== '') {
    return [message];
  }

  if (Array.isArray(message)) {
    const entries = message
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item !== '');
    if (entries.length > 0) {
      return entries;
    }
  }

  return [GENERIC_MESSAGE];
}

/**
 * Narrows anything thrown by a query/mutation to a displayable ApiError.
 *
 * An unrecognised throw is NOT reported as a network failure: telling a user
 * to check their connection because of a client-side bug sends them to debug
 * the wrong thing. It gets its own sentinel status so `isNetworkError` stays
 * true only for an actual transport failure.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  return new ApiError(UNKNOWN_ERROR_STATUS, [GENERIC_MESSAGE], error);
}
