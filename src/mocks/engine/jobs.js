import { findById, id, insert, update } from '../db/store';
import { mockNow, mockNowIso } from './settings';

/**
 * Async job simulator (plan §6). Bulk uploads, exports, payout batch
 * processing and pincode imports all return a job the UI polls, so those
 * screens get real progress bars instead of an instant fake success.
 *
 * Progress is derived from elapsed time on read, rather than driven by a
 * timer, so it survives a reload and a time-travel jump.
 */

export function createJob({
  type,
  label,
  actor,
  totalRows = 100,
  durationMs = 6000,
  failRows = 0,
  resultUrl = null,
  metadata = null,
}) {
  return insert('jobs', {
    id: id('JOB', 6),
    type,
    label,
    status: 'PROCESSING',
    createdById: actor?.id ?? 'system',
    createdByName: actor?.name ?? 'System',
    createdAt: mockNowIso(),
    startedAtMs: mockNow(),
    durationMs,
    totalRows,
    failRows,
    processedRows: 0,
    resultUrl,
    metadata,
    error: null,
    expiresAt: new Date(mockNow() + 7 * 24 * 3600 * 1000).toISOString(),
  });
}

/** Recomputes progress and settles the job when its window has elapsed. */
export function readJob(jobId) {
  const job = findById('jobs', jobId);
  if (!job) return null;
  if (job.status !== 'PROCESSING') return job;

  const elapsed = mockNow() - job.startedAtMs;
  const ratio = Math.min(1, elapsed / Math.max(1, job.durationMs));
  const processed = Math.floor(job.totalRows * ratio);

  if (ratio >= 1) {
    return update('jobs', jobId, {
      status: job.failRows > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
      processedRows: job.totalRows,
      completedAt: mockNowIso(),
    });
  }
  return update('jobs', jobId, { processedRows: processed });
}

export function jobProgressPct(job) {
  if (!job) return 0;
  if (job.status === 'COMPLETED' || job.status === 'COMPLETED_WITH_ERRORS') return 100;
  if (job.status === 'FAILED') return 100;
  return Math.round((job.processedRows / Math.max(1, job.totalRows)) * 100);
}
