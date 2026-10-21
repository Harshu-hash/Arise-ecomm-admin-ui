/**
 * Mirrors the server's password policy, so the form can tell users what is
 * wrong before they submit rather than after.
 */
export const PASSWORD_RULES = [
  { test: (v) => (v ?? '').length >= 12, label: 'At least 12 characters' },
  { test: (v) => /[A-Z]/.test(v ?? ''), label: 'An uppercase letter' },
  { test: (v) => /[a-z]/.test(v ?? ''), label: 'A lowercase letter' },
  { test: (v) => /[0-9]/.test(v ?? ''), label: 'A number' },
  { test: (v) => /[^A-Za-z0-9]/.test(v ?? ''), label: 'A symbol' },
];

export function passwordValidator(_rule, value) {
  if (!value) return Promise.reject(new Error('Choose a password.'));
  const failed = PASSWORD_RULES.filter((r) => !r.test(value));
  if (failed.length) {
    return Promise.reject(
      new Error(`Needs: ${failed.map((f) => f.label.toLowerCase()).join(', ')}`),
    );
  }
  return Promise.resolve();
}
