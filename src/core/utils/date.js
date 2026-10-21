import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import duration from 'dayjs/plugin/duration';
import { APP_TIMEZONE } from '@core/config/env';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.tz.setDefault(APP_TIMEZONE);

/** Timestamps travel as ISO-8601 UTC and are always rendered in IST. */
export function ist(value) {
  if (!value) return null;
  return dayjs(value).tz(APP_TIMEZONE);
}

export function formatDateTime(value) {
  const d = ist(value);
  return d ? d.format('DD MMM YYYY, h:mm A') : '—';
}

export function formatDate(value) {
  const d = ist(value);
  return d ? d.format('DD MMM YYYY') : '—';
}

export function formatTime(value) {
  const d = ist(value);
  return d ? d.format('h:mm A') : '—';
}

/** "2h ago" / "in 3 days". */
export function fromNow(value) {
  const d = ist(value);
  return d ? d.fromNow() : '—';
}

/**
 * Countdown label for SLA chips. Returns `{ label, overdue, ms }`.
 * Overdue values read "2h 10m late" so a breach is unmistakable.
 */
export function slaCountdown(dueAt, now = Date.now()) {
  if (!dueAt) return { label: '—', overdue: false, ms: null };
  const ms = dayjs(dueAt).valueOf() - now;
  const overdue = ms < 0;
  const dur = dayjs.duration(Math.abs(ms));
  const days = Math.floor(dur.asDays());
  const parts = days
    ? [`${days}d`, `${dur.hours()}h`]
    : dur.hours()
      ? [`${dur.hours()}h`, `${dur.minutes()}m`]
      : [`${dur.minutes()}m`];
  return { label: `${parts.join(' ')}${overdue ? ' late' : ' left'}`, overdue, ms };
}

/** Date-range presets shared by every FilterBar (plan §10). */
export function rangePresets() {
  const end = dayjs().tz(APP_TIMEZONE).endOf('day');
  return [
    { label: 'Today', value: [dayjs().tz(APP_TIMEZONE).startOf('day'), end] },
    {
      label: 'Yesterday',
      value: [
        dayjs().tz(APP_TIMEZONE).subtract(1, 'day').startOf('day'),
        dayjs().tz(APP_TIMEZONE).subtract(1, 'day').endOf('day'),
      ],
    },
    { label: 'Last 7 days', value: [dayjs().tz(APP_TIMEZONE).subtract(6, 'day').startOf('day'), end] },
    { label: 'Last 30 days', value: [dayjs().tz(APP_TIMEZONE).subtract(29, 'day').startOf('day'), end] },
    { label: 'This month', value: [dayjs().tz(APP_TIMEZONE).startOf('month'), end] },
    {
      label: 'Last month',
      value: [
        dayjs().tz(APP_TIMEZONE).subtract(1, 'month').startOf('month'),
        dayjs().tz(APP_TIMEZONE).subtract(1, 'month').endOf('month'),
      ],
    },
  ];
}

/** Serialises a dayjs range to the ISO strings the API expects. */
export function rangeToIso(range) {
  if (!range || !range[0] || !range[1]) return null;
  return [range[0].toISOString(), range[1].toISOString()];
}

export { dayjs };
