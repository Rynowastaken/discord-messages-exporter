/** Turn API and Discord failures into copy a user can act on. */
export function humanizeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();

  if (lower.includes("rejected") || /\b401\b/.test(raw)) {
    return "Discord rejected this token. Reconnect with a current token.";
  }
  if (
    lower.includes("unknown guild") ||
    lower.includes("10004") ||
    (lower.includes("404") && lower.includes("discord"))
  ) {
    return "That server could not be found. Pick it from the list or check the server ID.";
  }
  if (
    lower.includes("unknown channel") ||
    lower.includes("10003") ||
    lower.includes("unknown message")
  ) {
    return "That channel could not be found. Pick it from the list or check the channel ID.";
  }
  if (
    lower.includes("missing access") ||
    lower.includes("missing permissions") ||
    lower.includes("50001") ||
    lower.includes("50013")
  ) {
    return "This token cannot see that channel. Check its permissions or choose another one.";
  }
  if (lower.includes("429") || lower.includes("rate limit")) {
    return "Discord is rate limiting requests. Wait a moment and try again.";
  }
  if (lower.includes("failed to fetch") || lower.includes("fetch failed")) {
    return "Could not reach Discord. Check the connection and try again.";
  }
  const status = raw.match(/Discord error (\d{3})/i);
  if (status) {
    return `Discord returned an error (${status[1]}). Check the selection and try again.`;
  }
  return raw;
}
