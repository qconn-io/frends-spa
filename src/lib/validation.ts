/**
 * Tiny dependency-free validators for client-side UX only.
 *
 * IMPORTANT: client validation is a convenience, not a security boundary. The
 * Frends submission Process MUST re-validate every field server-side — that is
 * the real boundary. See CLAUDE.md and README.md.
 *
 * Each validator returns an error message string, or `null` when the value is OK.
 */

/** A validator over a string value. */
export type Validator = (value: string) => string | null

export function required(message = 'This field is required'): Validator {
  return (value) => (value.trim().length === 0 ? message : null)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function email(message = 'Enter a valid email address'): Validator {
  return (value) => (EMAIL_RE.test(value.trim()) ? null : message)
}

export function minLength(min: number, message?: string): Validator {
  return (value) =>
    value.trim().length >= min ? null : (message ?? `Must be at least ${min} characters`)
}

/** Boolean validator for "must be checked" cases (e.g. acknowledge policy). */
export function requiredTrue(
  message = 'You must acknowledge this to continue',
): (value: boolean) => string | null {
  return (value) => (value ? null : message)
}

/** Run validators in order; return the first error, or `null` if all pass. */
export function firstError(value: string, validators: Validator[]): string | null {
  for (const validate of validators) {
    const error = validate(value)
    if (error) return error
  }
  return null
}
