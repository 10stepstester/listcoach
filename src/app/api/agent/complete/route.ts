import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { sendSMS } from '@/lib/twilio';
import { completeDispatch, type CompletionReport } from '@/lib/agent-dispatch';

// Called by the cloud executor when a dispatched job finishes (done / failed /
// blocked). Records the outcome, closes the task on done, writes durable memory,
// and texts Ladd the result.
export async function POST(request: Request) {
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

  let body: {
    taskId?: string;
    status?: string;
    summary?: string;
    upside?: string;
    risk?: string;
    verdict?: string;
    prUrl?: string;
    prNumber?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const status = body.status as CompletionReport['status'];
  if (!body.taskId || !body.summary || !['done', 'failed', 'blocked'].includes(status)) {
    return NextResponse.json(
      { error: 'Required: taskId, summary, status (done|failed|blocked)' },
      { status: 400 }
    );
  }

  const result = await completeDispatch(body.taskId, {
    status,
    summary: body.summary,
    upside: body.upside,
    risk: body.risk,
    verdict: body.verdict,
    prUrl: body.prUrl,
    prNumber: body.prNumber,
  });
  if (!result) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const { data: user } = await supabase
    .from('users')
    .select('phone_number')
    .eq('id', result.userId)
    .single();
  if (user?.phone_number) {
    await sendSMS(user.phone_number, result.sms);
    await supabase
      .from('sms_conversations')
      .insert({ user_id: result.userId, direction: 'outbound', message_text: result.sms, goal_context: null });
  }

  return NextResponse.json({ success: true, smsSent: !!user?.phone_number });
}
