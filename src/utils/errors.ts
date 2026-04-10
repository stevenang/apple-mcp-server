export function handleError(err: unknown, context: string): string {
  const message = err instanceof Error ? err.message : String(err);

  if (message.includes('auth') || message.includes('LOGIN') || message.includes('credentials')) {
    return (
      `Authentication failed for ${context}. ` +
      `Verify your app-specific password at https://appleid.apple.com ` +
      `(Sign-In and Security → App-Specific Passwords).`
    );
  }

  if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
    return (
      `Cannot connect to ${context}. Check your network connection and that ` +
      `iCloud services are reachable.`
    );
  }

  if (message.includes('403') || message.includes('Forbidden')) {
    return (
      `Permission denied for ${context}. ` +
      `Verify your app-specific password has the required permissions at https://appleid.apple.com`
    );
  }

  if (message.includes('404') || message.includes('Not Found')) {
    return `Resource not found in ${context}: ${message}`;
  }

  return `Error in ${context}: ${message}`;
}
