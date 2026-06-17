import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { runChoreographer } from '@/lib/choreographer';

// PAUSED 2026-06-17 to stop API spend — this 10-min tick was the bulk of cost.
// To resume: set CHOREOGRAPHER_PAUSED=false in Vercel env (or flip this default) and redeploy.
const PAUSED = process.env.CHOREOGRAPHER_PAUSED !== 'false';

// The attention-choreographer tick. Hit by the 10-min external cron (cron-job.org)
// once cut over from check-goals. ?dryRun=1 computes the decision without sending.
export async function GET(request: Request) {
  if (PAUSED) {
    return NextResponse.json({ success: true, paused: true, results: [] });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';

  const { data: users, error } = await supabase.from('users').select('id');
  if (error) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }

  const results = [];
  for (const u of users || []) {
    try {
      const decision = await runChoreographer(u.id, { dryRun });
      results.push({ userId: u.id, ...decision });
    } catch (err) {
      console.error('[choreographer route] error for user', u.id, err);
      results.push({ userId: u.id, action: 'skip', reason: 'route error' });
    }
  }

  return NextResponse.json({ success: true, dryRun, results });
}
