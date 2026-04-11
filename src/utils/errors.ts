/**
 * Maps low-level protocol errors to actionable user-facing messages.
 * All error messages must tell the user what went wrong AND what to do next.
 */
export function handleError(err: unknown, context: string): string {
  // Log full stack to stderr so the operator can diagnose issues without
  // exposing internals to the MCP client response.
  if (err instanceof Error) {
    process.stderr.write(`[apple-mcp-server] Error in ${context}:\n${err.stack ?? err.message}\n`);
  } else {
    process.stderr.write(`[apple-mcp-server] Error in ${context}: ${String(err)}\n`);
  }

  // imapflow sets err.responseText to the raw IMAP server response text
  // (e.g. "[AUTHENTICATIONFAILED] Authentication failed.") when the generic
  // err.message is just "Command failed". Prefer responseText when present.
  const imapResponseText =
    err instanceof Error && typeof (err as unknown as Record<string, unknown>)['responseText'] === 'string'
      ? ((err as unknown as Record<string, unknown>)['responseText'] as string)
      : undefined;

  const message = imapResponseText ?? (err instanceof Error ? err.message : String(err));
  const lower = message.toLowerCase();

  // --- Authentication / authorization ---
  if (
    lower.includes('authenticate') ||
    lower.includes('authenticationfailed') ||
    lower.includes('invalid credentials') ||
    lower.includes('login failed') ||
    lower.includes('[authenticationfailed]') ||
    lower.includes('401')
  ) {
    return (
      `Authentication failed for ${context}. ` +
      `Make sure you are using an app-specific password (not your Apple ID password). ` +
      `Generate one at https://appleid.apple.com → Sign-In and Security → App-Specific Passwords.`
    );
  }

  if (lower.includes('403') || lower.includes('forbidden')) {
    return (
      `Permission denied accessing ${context}. ` +
      `Verify your app-specific password is valid at https://appleid.apple.com. ` +
      `Two-factor authentication must be enabled on your Apple ID.`
    );
  }

  // --- Not found ---
  if (lower.includes('404') || lower.includes('not found')) {
    return `Item not found in ${context}. It may have been deleted or moved. (${message})`;
  }

  // --- ETag / concurrency conflict (CalDAV/CardDAV update collision) ---
  if (lower.includes('412') || lower.includes('precondition failed')) {
    return (
      `Conflict updating ${context}: the item was modified elsewhere since it was last read. ` +
      `Fetch the latest version and retry.`
    );
  }

  // --- Network / connectivity ---
  if (lower.includes('econnrefused')) {
    return (
      `Connection refused by ${context}. ` +
      `Check that you are connected to the internet and that iCloud services are reachable.`
    );
  }

  if (lower.includes('enotfound') || lower.includes('getaddrinfo')) {
    return (
      `Cannot resolve the hostname for ${context}. ` +
      `Check your internet connection and DNS settings.`
    );
  }

  if (lower.includes('etimedout') || lower.includes('timeout') || lower.includes('timed out')) {
    return (
      `Connection to ${context} timed out. ` +
      `iCloud servers may be temporarily unavailable. Try again in a moment.`
    );
  }

  if (lower.includes('econnreset') || lower.includes('connection reset')) {
    return (
      `Connection to ${context} was reset. ` +
      `This may be a temporary network issue. Try again.`
    );
  }

  // --- SSL/TLS ---
  if (lower.includes('ssl') || lower.includes('tls') || lower.includes('certificate')) {
    return (
      `TLS/SSL error connecting to ${context}: ${message}. ` +
      `Ensure your system's certificate store is up to date.`
    );
  }

  // --- IMAP-specific server responses ---
  if (lower.includes('[unavailable]') || lower.includes('server unavailable')) {
    return `iCloud Mail service is temporarily unavailable. Try again in a few minutes.`;
  }

  if (lower.includes('[overquota]')) {
    return `Your iCloud Mail storage is full. Free up space at icloud.com and retry.`;
  }

  if (lower.includes('no such mailbox') || lower.includes('[nonexistent]')) {
    return `Mailbox not found in ${context}. Check the folder name and try again.`;
  }

  // --- Generic fallback ---
  // If imapflow gave us a responseText, include both for full context.
  if (imapResponseText && imapResponseText !== message) {
    return `Error in ${context}: ${imapResponseText}`;
  }
  return `Error in ${context}: ${message}`;
}

/**
 * Wraps an async operation and converts any thrown error to a user-facing string.
 * Returns `{ ok: true, value }` or `{ ok: false, error }`.
 */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  context: string
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return { ok: false, error: handleError(err, context) };
  }
}
