// Escapes ILIKE wildcards and the Postgres escape character itself so raw
// user input can be safely embedded in an ILIKE pattern. Backslash must be
// escaped first, otherwise it would double-escape the % and _ replacements.
export function escapeIlike(value: string) {
  return value.replace(/[\\%_]/g, '\\$&')
}
