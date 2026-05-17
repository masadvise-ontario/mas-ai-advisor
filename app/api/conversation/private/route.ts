import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { setConversationPrivacy } from '@/lib/handlers';
import { privateBodySchema } from '@/lib/schemas';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = checkApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  const parsed = privateBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await setConversationPrivacy(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[private] error', err);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
