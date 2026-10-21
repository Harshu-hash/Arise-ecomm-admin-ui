import { describe, expect, it } from 'vitest';
import { compareVersions, resolveFlag } from './featureFlags';

describe('compareVersions', () => {
  it('orders by each numeric segment', () => {
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.4.2', '1.4.2')).toBe(0);
  });

  it('treats a missing segment as zero', () => {
    expect(compareVersions('1.4', '1.4.1')).toBe(-1);
    expect(compareVersions('1.4.0', '1.4')).toBe(0);
  });
});

describe('resolveFlag', () => {
  const base = { key: 'play_tab', enabled: true, platform: 'ALL', minAppVersion: null, segmentId: null, rolloutPct: 100 };

  it('is off when the flag itself is off, regardless of every other rule', () => {
    expect(resolveFlag({ ...base, enabled: false }, {})).toBe(false);
  });

  it('respects a platform restriction', () => {
    const flag = { ...base, platform: 'ANDROID' };
    expect(resolveFlag(flag, { platform: 'ANDROID' })).toBe(true);
    expect(resolveFlag(flag, { platform: 'IOS' })).toBe(false);
  });

  it('respects a minimum app version', () => {
    const flag = { ...base, minAppVersion: '2.1.0' };
    expect(resolveFlag(flag, { appVersion: '2.1.0' })).toBe(true);
    expect(resolveFlag(flag, { appVersion: '2.0.9' })).toBe(false);
  });

  it('requires the context to carry the flag\'s segment', () => {
    const flag = { ...base, segmentId: 'SEG-1' };
    expect(resolveFlag(flag, { segmentIds: ['SEG-1', 'SEG-2'] })).toBe(true);
    expect(resolveFlag(flag, { segmentIds: ['SEG-2'] })).toBe(false);
    expect(resolveFlag(flag, {})).toBe(false);
  });

  it('a rollout percentage is deterministic per device, not re-randomised on every call', () => {
    const flag = { ...base, rolloutPct: 50 };
    const first = resolveFlag(flag, { deviceId: 'device-123' });
    const second = resolveFlag(flag, { deviceId: 'device-123' });
    expect(first).toBe(second);
  });

  it('100% rollout always passes and 0% never does', () => {
    expect(resolveFlag({ ...base, rolloutPct: 100 }, { deviceId: 'any-device' })).toBe(true);
    expect(resolveFlag({ ...base, rolloutPct: 0 }, { deviceId: 'any-device' })).toBe(false);
  });
});
