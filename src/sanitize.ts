/**
 * Strip control bytes (NUL through US, plus DEL) from an untrusted string.
 * Used at terminal-echo and server-log boundaries where ESC / OSC / CSI
 * sequences would either re-paint the user's terminal or break downstream
 * parsing. Replacement char is `?` so the rest of the string still reads.
 */
export function stripControlChars(s: string): string {
  return s.replace(/[\x00-\x1f\x7f]/g, "?");
}
