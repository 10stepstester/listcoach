import { NextResponse } from 'next/server';
import { claimQueuedJobs } from '@/lib/agent-dispatch';

// Polled by the cloud executor trigger (claude.ai routine) every ~30 min.
// Returns queued agent jobs and marks them running (at-most-once claim).
export async function GET(request: Request) {
  // Accepts the secret as a Bearer token OR x-agent-token header — some egress
  // proxies (e.g. the cloud executor's sandbox) strip/rewrite Authorization.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('Authorization');
    const altHeader = request.headers.get('x-agent-token');
    if (authHeader !== `Bearer ${cronSecret}` && altHeader !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const jobs = await claimQueuedJobs();
  return NextResponse.json({ jobs });
}
