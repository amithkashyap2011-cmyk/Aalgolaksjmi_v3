/** Python logging writes INFO to stderr too; stderr is not an error level. */
export function isQuantErrorLine(line) {
  return /^\s*(?:ERROR|CRITICAL|FATAL)(?::|\s|$)/.test(line)
    || /^\d{4}-\d{2}-\d{2}[ T].*?\[(?:ERROR|CRITICAL|FATAL)\]/.test(line);
}
