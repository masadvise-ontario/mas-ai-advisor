import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { recordTurn, UnknownInstallError } from '@/lib/handlers';
import { turnBodySchema } from '@/lib/schemas';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = checkApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  const parsed = turnBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await recordTurn(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UnknownInstallError) {
      return NextResponse.json({ error: 'unknown install_id' }, { status: 404 });
    }
    console.error('[turn] error', err);
    return NextResponse.json({ ok: false, error: 'server error' }, { status: 200 });
  }
}
