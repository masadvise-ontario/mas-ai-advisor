type SP = Record<string, string | string[] | undefined>;

function pick(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
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

export default async function OAuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const reason = pick(sp.reason) ?? 'unknown_error';

  return (
    <main style={pageStyle}>
      <h1 style={{ marginTop: 0 }}>MAS AI Advisor — sign-in error</h1>
      <p>
        Something went wrong during sign-in. Reason: <code>{reason}</code>.
      </p>
      <p style={{ fontSize: '0.9em', color: '#666' }}>
        Close this tab and try again from your AI client. If the problem
        persists, email <code>info@masadvise.org</code>.
      </p>
    </main>
  );
}
