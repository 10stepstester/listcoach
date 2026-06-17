import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/lib/db';
import { sendSMS } from '@/lib/twilio';

const anthropic = new Anthropic();

// Vercel Cron invokes routes with a GET request (and auto-attaches the
// `Authorization: Bearer ${CRON_SECRET}` header). Delegate to the POST handler
// so the same scheduler can be driven by Vercel Cron, cron-job.org, or a manual POST.
export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .limit(1)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'No user found' }, { status: 404 });
    }

    // Find top-level PainReliefKC subtask
    const { data: allTopLevel } = await supabase
      .from('subtasks')
      .select('*')
      .is('parent_id', null)
      .eq('is_completed', false);

    const painReliefRoot = (allTopLevel || []).find((s) => {
      const lower = s.title.toLowerCase();
      return lower.includes('painrelief') || lower.includes('pain relief');
    });

    if (!painReliefRoot) {
      return NextResponse.json({ error: 'No PainReliefKC category found' }, { status: 404 });
    }

    // Collect all incomplete descendants recursively
    const incompleteDescendants: { id: string; title: string }[] = [];

    async function collectDescendants(parentId: string) {
      const { data: children } = await supabase
        .from('subtasks')
        .select('id, title, is_completed')
        .eq('parent_id', parentId)
        .eq('is_completed', false);

      for (const child of children || []) {
        incompleteDescendants.push({ id: child.id, title: child.title });
        await collectDescendants(child.id);
      }
    }

    await collectDescendants(painReliefRoot.id);

    if (incompleteDescendants.length === 0) {
      return NextResponse.json({ error: 'No incomplete PainReliefKC tasks' }, { status: 404 });
    }

    // Ask Claude to pick the highest-impact task
    const taskList = incompleteDescendants
      .map((t) => `${t.id}|${t.title}`)
      .join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 100,
      system: 'You pick the single highest-impact task. Return ONLY the subtask id, nothing else.',
      messages: [{
        role: 'user',
        content: `Goal: drive new patients to painreliefkc.com. Pick the single highest-impact task to do today. Return the subtask id only.\n\nTasks (id|title):\n${taskList}`,
      }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const chosenId = textBlock?.text.trim() || '';

    const chosenTask = incompleteDescendants.find((t) => t.id === chosenId);
    if (!chosenTask) {
      // Fallback: pick the first one
      const fallback = incompleteDescendants[0];
      return NextResponse.json({ error: 'AI returned invalid id', fallbackId: fallback.id }, { status: 500 });
    }

    // Mark as proposed
    await supabase
      .from('subtasks')
      .update({ proposed_for_daily_at: new Date().toISOString() })
      .eq('id', chosenTask.id);

    // Send SMS
    const smsBody = `☀️ Today's painreliefkc move: "${chosenTask.title}". Reply Y to approve, N to skip.`;
    await sendSMS(user.phone_number, smsBody);

    // Log to sms_conversations
    await supabase
      .from('sms_conversations')
      .insert({
        user_id: user.id,
        direction: 'outbound',
        message_text: smsBody,
        goal_context: JSON.stringify({ subtaskId: chosenTask.id, type: 'daily_prompt' }),
      });

    // Log to activity_log
    await supabase
      .from('activity_log')
      .insert({
        user_id: user.id,
        action_type: 'daily_prompt_sent',
        subtask_id: chosenTask.id,
      });

    return NextResponse.json({ subtaskId: chosenTask.id, title: chosenTask.title });
  } catch (error) {
    console.error('POST /api/cron/daily-prompt error:', error);
    return NextResponse.json({ error: 'Daily prompt failed' }, { status: 500 });
  }
}
