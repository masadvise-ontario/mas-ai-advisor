import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { findClient } from '@/lib/oauth/clients';
import { OAUTH_SCOPE } from '@/lib/oauth/config';
import { grantConsent } from './actions';

type SP = Record<string, string | string[] | undefined>;

function pick(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function OAuthError({ message }: { message: string }) {
  return (
    <main style={pageStyle}>
      <h1 style={{ marginTop: 0 }}>MAS AI Advisor — sign-in error</h1>
      <p style={{ color: '#a00' }}>{message}</p>
      <p style={{ color: '#666', fontSize: '0.9em' }}>
        Close this tab and try again from your AI client.
      </p>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 520,
  margin: '4rem auto',
  padding: '2rem',
  fontFamily: 'system-ui, sans-serif',
  lineHeight: 1.5,
  border: '1px solid #e0e0e0',
  borderRadius: 12,
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  marginTop: '1.5rem',
};

const allowButtonStyle: React.CSSProperties = {
  padding: '0.6rem 1.2rem',
  border: 0,
  borderRadius: 8,
  background: '#0a66c2',
  color: 'white',
  cursor: 'pointer',
  fontSize: '1rem',
};

const denyButtonStyle: React.CSSProperties = {
  padding: '0.6rem 1.2rem',
  border: '1px solid #c0c0c0',
  borderRadius: 8,
  background: 'white',
  color: '#333',
  cursor: 'pointer',
  fontSize: '1rem',
};

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const response_type = pick(sp.response_type);
  const client_id = pick(sp.client_id);
  const redirect_uri = pick(sp.redirect_uri);
  const code_challenge = pick(sp.code_challenge);
  const code_challenge_method = pick(sp.code_challenge_method);
  const scope = pick(sp.scope) ?? OAUTH_SCOPE;
  const state = pick(sp.state) ?? '';
  const resource = pick(sp.resource) ?? '';

  if (response_type !== 'code') {
    return <OAuthError message="Unsupported response_type. Expected 'code'." />;
  }
  if (!client_id || !redirect_uri || !code_challenge) {
    return <OAuthError message="Missing required parameters." />;
  }
  if (code_challenge_method !== 'S256') {
    return (
      <OAuthError message="Only the S256 PKCE code_challenge_method is supported." />
    );
  }

  const client = await findClient(client_id);
  if (!client) {
    return <OAuthError message="Unknown client_id." />;
  }
  if (!client.redirect_uris.includes(redirect_uri)) {
    return <OAuthError message="redirect_uri is not registered for this client." />;
  }

  const session = await auth();
  if (!session?.user?.email) {
    const params = new URLSearchParams({
      response_type,
      client_id,
      redirect_uri,
      code_challenge,
      code_challenge_method,
      scope,
      ...(state ? { state } : {}),
      ...(resource ? { resource } : {}),
    });
    const callbackUrl = `/oauth/authorize?${params.toString()}`;
    redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  return (
    <main style={pageStyle}>
      <h1 style={{ marginTop: 0 }}>MAS AI Advisor</h1>
      <p>
        <strong>{client.client_name}</strong> wants to connect to the MAS AI
        Advisor on your behalf as{' '}
        <code style={{ background: '#f4f4f4', padding: '2px 6px', borderRadius: 4 }}>
          {session.user.email}
        </code>
        .
      </p>
      <p style={{ marginBottom: 0 }}>This will allow {client.client_name} to:</p>
      <ul>
        <li>See your verified email address from MAS</li>
        <li>Register an Advisor install for your conversation</li>
        <li>Record per-turn telemetry if you consent in-conversation</li>
        <li>Mark conversations private at your request</li>
      </ul>
      <p style={{ fontSize: '0.85em', color: '#666' }}>
        You can revoke access at any time by removing this connector in your AI
        client, or by contacting <code>info@masadvise.org</code>.
      </p>
      <form action={grantConsent}>
        <input type="hidden" name="client_id" value={client_id} />
        <input type="hidden" name="redirect_uri" value={redirect_uri} />
        <input type="hidden" name="code_challenge" value={code_challenge} />
        <input
          type="hidden"
          name="code_challenge_method"
          value={code_challenge_method}
        />
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="state" value={state} />
        {resource && <input type="hidden" name="resource" value={resource} />}
        <div style={buttonRowStyle}>
          <button type="submit" name="decision" value="allow" style={allowButtonStyle}>
            Allow
          </button>
          <button type="submit" name="decision" value="deny" style={denyButtonStyle}>
            Deny
          </button>
        </div>
      </form>
    </main>
  );
}
