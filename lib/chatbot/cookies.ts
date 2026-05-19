export const SESSION_COOKIE_NAME = 'mas-chat-session';
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 4; // 4 hours

// Build a Set-Cookie header value for the chat session cookie. The chat
// runs as an iframe under a different parent origin (masadvise.org), so the
// cookie must be SameSite=None + Secure to be sent on cross-site requests
// back to the chat page's own /api routes.
export function buildSessionCookie(token: string, opts: { secure: boolean }): string {
  const attrs = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
    'SameSite=None',
  ];
  if (opts.secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function buildClearSessionCookie(opts: { secure: boolean }): string {
  const attrs = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    'SameSite=None',
  ];
  if (opts.secure) attrs.push('Secure');
  return attrs.join('; ');
}
