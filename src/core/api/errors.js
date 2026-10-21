/** Normalised API error. Thrown by the axios interceptor for every failure. */
export class ApiError extends Error {
  constructor({ code, message, fieldErrors, status, requestId, details }) {
    super(message || 'Something went wrong');
    this.name = 'ApiError';
    this.code = code || 'UNKNOWN';
    this.fieldErrors = fieldErrors || null;
    this.status = status ?? null;
    this.requestId = requestId ?? null;
    this.details = details ?? null;
  }

  get isForbidden() {
    return this.status === 403 || this.code === 'FORBIDDEN';
  }

  get isNotFound() {
    return this.status === 404 || this.code === 'NOT_FOUND';
  }

  get isConflict() {
    return this.status === 409;
  }

  /** A stale-write conflict carries the server's current copy for merging. */
  get isVersionConflict() {
    return this.code === 'VERSION_CONFLICT';
  }

  get isValidation() {
    return this.code === 'VALIDATION_FAILED' || this.status === 422;
  }

  get isNetwork() {
    return this.code === 'NETWORK_ERROR';
  }

  get needsApproval() {
    return this.code === 'APPROVAL_REQUIRED';
  }
}

const FRIENDLY = {
  NETWORK_ERROR: 'Could not reach the server. Check your connection and try again.',
  FORBIDDEN: 'You do not have permission to do this.',
  NOT_FOUND: 'That record no longer exists.',
  VERSION_CONFLICT: 'Someone else changed this record while you were editing it.',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  SESSION_EXPIRED: 'Your session expired. Please sign in again.',
  ILLEGAL_TRANSITION: 'That action is not allowed from the current status.',
};

export function friendlyMessage(error) {
  if (!(error instanceof ApiError)) return error?.message || 'Something went wrong';
  return FRIENDLY[error.code] || error.message;
}

/** Turns an axios failure into an ApiError. */
export function toApiError(axiosError) {
  if (axiosError?.response) {
    const { status, data, headers } = axiosError.response;
    const payload = data?.error ?? {};
    return new ApiError({
      code: payload.code || defaultCodeForStatus(status),
      message: payload.message,
      fieldErrors: payload.fieldErrors,
      details: payload.details,
      status,
      requestId: headers?.['x-request-id'] ?? payload.requestId,
    });
  }
  if (axiosError?.request) {
    return new ApiError({ code: 'NETWORK_ERROR', message: FRIENDLY.NETWORK_ERROR });
  }
  return new ApiError({ code: 'UNKNOWN', message: axiosError?.message });
}

function defaultCodeForStatus(status) {
  if (status === 401) return 'SESSION_EXPIRED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 422) return 'VALIDATION_FAILED';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'SERVER_ERROR';
  return 'REQUEST_FAILED';
}
