import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { compactFacts } from '@/lib/scribe';

// Nightly facts-doc compaction (see scribe.ts). Hit by the Vercel daily cron
// (vercel.json) — Vercel sends Authorization: Bearer CRON_SECRET automatically.
// ?dryRun=1 returns the rewritten doc without saving it.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';

  const { data: users, error } = await supabase.from('users').select('id, timezone');
  if (error) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }

  const results = [];
  for (const u of users || []) {
    try {
      const { before, after, doc } = await compactFacts(u.id, u.timezone, { dryRun });
      results.push({ userId: u.id, before, after, ...(dryRun ? { doc } : {}) });
    } catch (err) {
      console.error('[scribe-compact] error for user', u.id, err);
      results.push({ userId: u.id, error: 'compact failed' });
    }
  }

  return NextResponse.json({ success: true, dryRun, results });
}
