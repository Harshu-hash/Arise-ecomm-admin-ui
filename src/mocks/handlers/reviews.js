import { http as mswHttp } from 'msw';
import { db, filter, findById, id, insert, update } from '../db/store';
import { writeAudit } from '../engine/audit';
import { guard } from '../engine/guard';
import { listResult, parseListQuery } from '../engine/list';
import { conflict, notFound, ok, okList, validationFailed } from '../engine/respond';
import { mockNowIso } from '../engine/settings';
import { reviewsByAuthor } from '../engine/reviews';
import { scheduleSave } from '../persistence';

const BASE = '/api/admin/v1';

/** Reviews, Q&A and abuse reports (M13). */

export const reviewHandlers = [
  mswHttp.get(`${BASE}/reviews`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'reviews.review.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-submittedAt' });
    const result = listResult(db.reviews, query, {
      searchFields: ['productTitle', 'customerName', 'text'],
      filterSpec: {
        status: 'status', autoModeration: 'autoModeration',
        certifiedBuyer: { path: 'certifiedBuyer', kind: 'boolean' },
        hasMedia: (row, value) => (String(value) === 'true' ? row.mediaCount > 0 : row.mediaCount === 0),
      },
      sortable: ['submittedAt', 'rating', 'helpfulVotes'],
      facetFields: ['status', 'autoModeration'],
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.get(`${BASE}/reviews/:reviewId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'reviews.review.view');
    if (g.response) return g.response;
    const review = findById('reviews', params.reviewId);
    if (!review) return notFound('That review no longer exists.');
    return ok({ ...review, otherReviewsByAuthor: reviewsByAuthor(review.customerId, review.id) });
  }),

  mswHttp.post(`${BASE}/reviews/:reviewId/publish`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'reviews.review.moderate');
    if (g.response) return g.response;
    const review = findById('reviews', params.reviewId);
    if (!review) return notFound('That review no longer exists.');
    if (review.status === 'PUBLISHED') return conflict('This review is already published.', 'NO_CHANGE');

    update('reviews', review.id, { status: 'PUBLISHED', moderationReason: null });
    writeAudit({ actor: g.user, action: 'review.publish', entityType: 'review', entityId: review.id, entityLabel: review.productTitle });
    scheduleSave();
    return ok(findById('reviews', review.id));
  }),

  mswHttp.post(`${BASE}/reviews/:reviewId/reject`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'reviews.review.moderate');
    if (g.response) return g.response;
    const review = findById('reviews', params.reviewId);
    if (!review) return notFound('That review no longer exists.');
    const body = await request.json();
    if (!body.reason?.trim()) return validationFailed({ reason: 'Say why this review is being rejected — the customer is notified.' });

    update('reviews', review.id, { status: 'REJECTED', moderationReason: body.reason });
    writeAudit({ actor: g.user, action: 'review.reject', entityType: 'review', entityId: review.id, entityLabel: review.productTitle, reason: body.reason });
    scheduleSave();
    return ok(findById('reviews', review.id));
  }),

  mswHttp.post(`${BASE}/reviews/:reviewId/hide-media`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'reviews.review.moderate');
    if (g.response) return g.response;
    const review = findById('reviews', params.reviewId);
    if (!review) return notFound('That review no longer exists.');
    if (!review.mediaCount) return conflict('This review has no media to hide.', 'NO_CHANGE');

    update('reviews', review.id, { media: [], mediaHidden: true });
    writeAudit({ actor: g.user, action: 'review.hide_media', entityType: 'review', entityId: review.id, entityLabel: review.productTitle });
    scheduleSave();
    return ok(findById('reviews', review.id));
  }),

  mswHttp.post(`${BASE}/reviews/:reviewId/flag-incentivised`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'reviews.review.moderate');
    if (g.response) return g.response;
    const review = findById('reviews', params.reviewId);
    if (!review) return notFound('That review no longer exists.');

    update('reviews', review.id, { incentivised: true, status: 'REJECTED', moderationReason: 'Seller-incentivised review' });
    writeAudit({ actor: g.user, action: 'review.flag_incentivised', entityType: 'review', entityId: review.id, entityLabel: review.productTitle });
    scheduleSave();
    return ok(findById('reviews', review.id));
  }),

  /** Bulk: publish every clean pending review on the current page's filter, or reject a selected set. */
  mswHttp.post(`${BASE}/reviews/bulk`, async ({ request }) => {
    const g = await guard(request, new URL(request.url), 'reviews.review.moderate');
    if (g.response) return g.response;
    const body = await request.json();
    if (!['PUBLISH_CLEAN', 'REJECT'].includes(body.action)) return validationFailed({ action: 'Unknown bulk action.' });
    if (body.action === 'REJECT' && !body.reason?.trim()) return validationFailed({ reason: 'A reason is required to reject in bulk.' });

    let affected = [];
    if (body.action === 'PUBLISH_CLEAN') {
      affected = filter('reviews', (r) => (body.reviewIds ?? []).includes(r.id) && r.autoModeration === 'CLEAN' && r.status === 'PENDING');
      for (const r of affected) update('reviews', r.id, { status: 'PUBLISHED' });
    } else {
      affected = filter('reviews', (r) => (body.reviewIds ?? []).includes(r.id));
      for (const r of affected) update('reviews', r.id, { status: 'REJECTED', moderationReason: body.reason });
    }
    writeAudit({ actor: g.user, action: `review.bulk_${body.action.toLowerCase()}`, entityType: 'review', entityId: 'bulk', entityLabel: `${affected.length} reviews`, reason: body.reason });
    scheduleSave();
    return ok({ affected: affected.length });
  }),

  /* ------------------------------------------------------------------ Q&A */
  mswHttp.get(`${BASE}/questions`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'reviews.qa.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-askedAt' });
    const rows = db.questions.map((q) => ({
      ...q,
      answerCount: filter('answers', (a) => a.questionId === q.id).length,
      unansweredDays: filter('answers', (a) => a.questionId === q.id).length
        ? null : Math.floor((Date.now() - new Date(q.askedAt).getTime()) / 86400_000),
    }));
    const result = listResult(rows, query, {
      searchFields: ['productTitle', 'customerName', 'text'],
      filterSpec: {
        status: 'status',
        unanswered: (row, value) => (String(value) === 'true' ? row.answerCount === 0 : row.answerCount > 0),
      },
      sortable: ['askedAt', 'answerCount'],
      facetFields: ['status'],
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.get(`${BASE}/questions/:questionId`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'reviews.qa.view');
    if (g.response) return g.response;
    const question = findById('questions', params.questionId);
    if (!question) return notFound('That question no longer exists.');
    return ok({ ...question, answers: filter('answers', (a) => a.questionId === question.id) });
  }),

  mswHttp.post(`${BASE}/questions/:questionId/moderate`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'reviews.qa.moderate');
    if (g.response) return g.response;
    const question = findById('questions', params.questionId);
    if (!question) return notFound('That question no longer exists.');
    const body = await request.json();
    if (!['PUBLISHED', 'REJECTED'].includes(body.status)) return validationFailed({ status: 'Unknown status.' });

    update('questions', question.id, { status: body.status });
    writeAudit({ actor: g.user, action: 'qa.moderate_question', entityType: 'question', entityId: question.id, entityLabel: question.text });
    scheduleSave();
    return ok(findById('questions', question.id));
  }),

  mswHttp.post(`${BASE}/questions/:questionId/answers`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'reviews.qa.answer');
    if (g.response) return g.response;
    const question = findById('questions', params.questionId);
    if (!question) return notFound('That question no longer exists.');
    const body = await request.json();
    if (!body.text?.trim()) return validationFailed({ text: 'Write an answer.' });

    const answer = insert('answers', {
      id: id('ANS', 7), questionId: question.id, authorType: 'ARISE', authorName: 'Arise Support',
      text: body.text, helpfulVotes: 0, status: 'PUBLISHED', answeredAt: mockNowIso(),
    });
    writeAudit({ actor: g.user, action: 'qa.answer', entityType: 'question', entityId: question.id, entityLabel: question.text });
    scheduleSave();
    return ok(answer);
  }),

  mswHttp.post(`${BASE}/answers/:answerId/moderate`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'reviews.qa.moderate');
    if (g.response) return g.response;
    const answer = findById('answers', params.answerId);
    if (!answer) return notFound('That answer no longer exists.');
    const body = await request.json();
    if (!['PUBLISHED', 'REJECTED'].includes(body.status)) return validationFailed({ status: 'Unknown status.' });

    update('answers', answer.id, { status: body.status });
    scheduleSave();
    return ok(findById('answers', answer.id));
  }),

  /* -------------------------------------------------------------- abuse */
  mswHttp.get(`${BASE}/abuse-reports`, async ({ request }) => {
    const url = new URL(request.url);
    const g = await guard(request, url, 'reviews.abuse.view');
    if (g.response) return g.response;

    const query = parseListQuery(url, { defaultSort: '-reportedAt' });
    const result = listResult(db.abuseReports, query, {
      searchFields: ['targetExcerpt', 'reason'],
      filterSpec: { status: 'status', targetType: 'targetType' },
      sortable: ['reportedAt', 'reporterCount'],
      facetFields: ['status', 'targetType'],
    });
    return okList(result.items, result.meta);
  }),

  mswHttp.post(`${BASE}/abuse-reports/:reportId/decide`, async ({ request, params }) => {
    const g = await guard(request, new URL(request.url), 'reviews.abuse.decide');
    if (g.response) return g.response;
    const report = findById('abuseReports', params.reportId);
    if (!report) return notFound('That report no longer exists.');
    const body = await request.json();
    if (!['DISMISSED', 'REMOVED'].includes(body.decision)) return validationFailed({ decision: 'Dismiss or remove.' });

    update('abuseReports', report.id, { status: body.decision, decisionReason: body.reason ?? null });
    if (body.decision === 'REMOVED' && report.targetType === 'REVIEW') {
      update('reviews', report.targetId, { status: 'REJECTED', moderationReason: 'Removed following an abuse report' });
    }
    writeAudit({ actor: g.user, action: 'abuse.decide', entityType: 'abuseReport', entityId: report.id, entityLabel: report.targetExcerpt, reason: body.reason, metadata: { decision: body.decision } });
    scheduleSave();
    return ok(findById('abuseReports', report.id));
  }),
];
