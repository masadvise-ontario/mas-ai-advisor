'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { findClient } from '@/lib/oauth/clients';
import { issueAuthorizationCode } from '@/lib/oauth/codes';

/**
 * Server action invoked when the user clicks Allow or Deny on the consent
 * screen. Issues a one-shot authorization code (Allow) and redirects to
 * the client's redirect_uri with either `code` or `error=access_denied`.
 */
export async function grantConsent(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/api/auth/signin');
  }

  const decision = String(formData.get('decision') ?? '');
  const client_id = String(formData.get('client_id') ?? '');
  const redirect_uri = String(formData.get('redirect_uri') ?? '');
  const code_challenge = String(formData.get('code_challenge') ?? '');
  const code_challenge_method = String(
    formData.get('code_challenge_method') ?? '',
  );
  const scope = String(formData.get('scope') ?? 'mas-advisor-mcp');
  const state = String(formData.get('state') ?? '');
  const resourceRaw = formData.get('resource');
  const resource =
    typeof resourceRaw === 'string' && resourceRaw.length > 0
      ? resourceRaw
      : null;

  // Final server-side validation — the form fields can't be trusted on their
  // own; rerun checks before issuing a code.
  const client = await findClient(client_id);
  if (!client || !client.redirect_uris.includes(redirect_uri)) {
    redirect('/oauth/error?reason=invalid_request');
  }

  if (decision === 'deny') {
    const url = new URL(redirect_uri);
    url.searchParams.set('error', 'access_denied');
    if (state) url.searchParams.set('state', state);
    redirect(url.toString());
  }

  if (decision !== 'allow') {
    redirect('/oauth/error?reason=invalid_request');
  }

  const code = await issueAuthorizationCode({
    client_id,
    redirect_uri,
    user_sub: session!.user.id ?? session!.user.email!,
    user_email: session!.user.email!,
    code_challenge,
    code_challenge_method,
    resource,
    scope,
  });

  const url = new URL(redirect_uri);
  url.searchParams.set('code', code);
  if (state) url.searchParams.set('state', state);
  redirect(url.toString());
}
