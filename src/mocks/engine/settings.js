/**
 * Dev-toolbar settings for the mock server (plan §6): latency, error
 * injection and the simulated clock offset for time travel.
 *
 * Kept in a module-level object rather than a store because the MSW handlers
 * run outside React and need a plain, synchronous read.
 */

const KEY = 'arise.mockSettings';

const DEFAULTS = {
  latencyMs: 300,
  errorRate: 0,
  failNext: false,
  /** Milliseconds added to Date.now() so SLA breaches and payout cycles can be reached. */
  clockOffsetMs: 0,
};

let settings = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed, failNext: false };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist() {
  try {
    const { failNext: _ignored, ...rest } = settings;
    localStorage.setItem(KEY, JSON.stringify(rest));
  } catch {
    /* blocked storage: settings just reset on reload */
  }
}

export function getSettings() {
  return settings;
}

export function updateSettings(patch) {
  settings = { ...settings, ...patch };
  persist();
  return settings;
}

export function resetSettings() {
  settings = { ...DEFAULTS };
  persist();
  return settings;
}

/** The mock server's notion of "now" — honours the time-travel offset. */
export function mockNow() {
  return Date.now() + settings.clockOffsetMs;
}

export function mockNowIso() {
  return new Date(mockNow()).toISOString();
}
