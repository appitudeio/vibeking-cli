/** Matches a YYYY-MM-DD string; doesn't validate the date itself. */
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** True when the input is a well-formed YYYY-MM-DD string. */
export function isIsoDate(s: string): boolean {
  return ISO_DATE_REGEX.test(s);
}
