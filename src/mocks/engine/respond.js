import { HttpResponse, delay } from 'msw';
import { getSettings } from './settings';

/**
 * Response helpers that mirror the API contract in
 * docs/ADMIN_PANEL_PLAN.md §7. Every handler goes through these so the shape
 * the UI consumes is identical to what the real backend must return.
 */

/** Applies the dev toolbar's latency and error-injection settings. */
export async function simulateNetwork(pathname) {
  const s = getSettings();
  if (s.latencyMs > 0) await delay(s.latencyMs);
  else await delay(5);

  if (s.failNext) {
    s.failNext = false;
    return serverError('Injected failure (dev toolbar: fail next request)');
  }
  // Auth calls are exempt: a random 500 while signing in would be baffling.
  if (s.errorRate > 0 && !pathname.includes('/auth/') && Math.random() * 100 < s.errorRate) {
    return serverError('Injected random failure (dev toolbar: error rate)');
  }
  return null;
}

export function ok(data, meta) {
  return HttpResponse.json({ data, ...(meta ? { meta } : {}) });
}

export function okList(items, meta) {
  return HttpResponse.json({ data: items, meta });
}

export function created(data, meta) {
  return HttpResponse.json({ data, ...(meta ? { meta } : {}) }, { status: 201 });
}

export function noContent() {
  return new HttpResponse(null, { status: 204 });
}

function fail(status, code, message, extra = {}) {
  return HttpResponse.json(
    { error: { code, message, ...extra } },
    { status, headers: { 'X-Request-Id': `mock_${Date.now().toString(36)}` } },
  );
}

export const badRequest = (message, code = 'BAD_REQUEST') => fail(400, code, message);
export const unauthorized = (message = 'Your session expired. Please sign in again.') =>
  fail(401, 'SESSION_EXPIRED', message);
export const forbidden = (message = 'You do not have permission to do this.', extra) =>
  fail(403, 'FORBIDDEN', message, extra);
export const notFound = (message = 'That record no longer exists.') => fail(404, 'NOT_FOUND', message);
export const conflict = (message, code = 'CONFLICT', extra) => fail(409, code, message, extra);
export const serverError = (message = 'Something went wrong on the server.') =>
  fail(500, 'SERVER_ERROR', message);
export const rateLimited = (message = 'Too many requests.') => fail(429, 'RATE_LIMITED', message);

/** `fieldErrors` maps onto Ant Design form fields in the UI. */
export function validationFailed(fieldErrors, message = 'Please correct the highlighted fields.') {
  return fail(422, 'VALIDATION_FAILED', message, { fieldErrors });
}

/** An illegal state-machine transition — the state machines are the spec. */
export function illegalTransition(from, action) {
  return conflict(`Cannot ${action} from status ${from}.`, 'ILLEGAL_TRANSITION', {
    details: { from, action },
  });
}

/** Optimistic-concurrency failure: hands back the server's current copy. */
export function versionConflict(current) {
  return conflict(
    'Someone else changed this record while you were editing it.',
    'VERSION_CONFLICT',
    { details: { current } },
  );
}

/** The action was accepted but queued for maker-checker instead of executed. */
export function approvalRequired(approval) {
  return HttpResponse.json(
    {
      error: {
        code: 'APPROVAL_REQUIRED',
        message: 'This action needs a second approver and has been sent for approval.',
        details: { approvalId: approval.id },
      },
    },
    { status: 202 },
  );
}
