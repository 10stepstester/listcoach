import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { supabase } from '@/lib/db';
import { parseSmsReply } from '@/lib/claude';
import { sendSMS } from '@/lib/twilio';
import { getActiveTask } from '@/lib/nudge-state';
import { handleNudgeReply } from '@/lib/choreographer';
import { scribeReply } from '@/lib/scribe';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const body = formData.get('Body') as string | null;
    const from = formData.get('From') as string | null;

    if (!body || !from) {
      return new NextResponse('<Response><Message>Invalid request</Message></Response>', {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Look up user by phone number
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('phone_number', from)
      .single();

    if (!user) {
      return new NextResponse(
        '<Response><Message>Unknown number. Please register first.</Message></Response>',
        { headers: { 'Content-Type': 'text/xml' } }
      );
    }

    // Scribe (durable memory): after the response is sent, check whether this reply
    // established anything permanently true and append it to the facts doc. Runs on
    // every inbound path; failures are logged inside and never affect the reply.
    after(() => scribeReply(user.id, body, user.timezone));

    // Check for pending daily prompt before normal intent parsing
    const { data: pendingDaily } = await supabase
      .from('subtasks')
      .select('id, title')
      .eq('is_completed', false)
      .is('daily_response', null)
      .not('proposed_for_daily_at', 'is', null)
      .gte('proposed_for_daily_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1)
      .single();

    if (pendingDaily) {
      const normalized = body.trim().toLowerCase();
      const approveWords = ['y', 'yes', 'approve', 'ok', 'sure', 'go'];
      const skipWords = ['n', 'no', 'skip', 'pass'];

      if (approveWords.includes(normalized)) {
        await supabase
          .from('subtasks')
          .update({ daily_response: 'approved' })
          .eq('id', pendingDaily.id);

        const replyText = "✅ Got it. I'll text when it's done.";

        await supabase
          .from('sms_conversations')
          .insert({ user_id: user.id, direction: 'inbound', message_text: body, goal_context: null });
        await supabase
          .from('sms_conversations')
          .insert({ user_id: user.id, direction: 'outbound', message_text: replyText, goal_context: null });

        await sendSMS(user.phone_number, replyText);

        return new NextResponse('<Response></Response>', {
          headers: { 'Content-Type': 'text/xml' },
        });
      }

      if (skipWords.includes(normalized)) {
        await supabase
          .from('subtasks')
          .update({ daily_response: 'skipped' })
          .eq('id', pendingDaily.id);

        const replyText = "👍 Skipped. I'll pick a different one tomorrow.";

        await supabase
          .from('sms_conversations')
          .insert({ user_id: user.id, direction: 'inbound', message_text: body, goal_context: null });
        await supabase
          .from('sms_conversations')
          .insert({ user_id: user.id, direction: 'outbound', message_text: replyText, goal_context: null });

        await sendSMS(user.phone_number, replyText);

        return new NextResponse('<Response></Response>', {
          headers: { 'Content-Type': 'text/xml' },
        });
      }
      // Not a Y/N response — fall through to normal intent parsing
    }

    // Choreographer reply: if a nudge task is in flight, this reply is about it.
    // Interpret it (done / deferred / declined), update the in-flight state, and send
    // an adaptive instant ack. Dormant until the choreographer cron is cut over (no
    // active tasks exist before then). Falls through to list handling if unrelated.
    const activeTask = await getActiveTask(user.id);
    if (activeTask) {
      const { data: recent } = await supabase
        .from('sms_conversations')
        .select('direction, message_text')
        .eq('user_id', user.id)
        .order('sent_at', { ascending: false })
        .limit(8);
      const convo = (recent || [])
        .reverse()
        .map((m) => `${m.direction === 'inbound' ? 'Ladd' : 'You'}: ${m.message_text}`)
        .join('\n');

      const ack = await handleNudgeReply(user.id, activeTask, body, convo);
      if (ack) {
        await supabase
          .from('sms_conversations')
          .insert({ user_id: user.id, direction: 'inbound', message_text: body, goal_context: null });
        await supabase
          .from('sms_conversations')
          .insert({ user_id: user.id, direction: 'outbound', message_text: ack, goal_context: null });
        await sendSMS(user.phone_number, ack);
        return new NextResponse('<Response></Response>', {
          headers: { 'Content-Type': 'text/xml' },
        });
      }
      // ack null → reply wasn't about the task; fall through to normal list handling.
    }

    // Fetch user's goals with subtasks
    const { data: goals } = await supabase
      .from('goals')
      .select('*, subtasks(*)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('position');

    const goalsWithSubtasks = (goals || []).map((goal) => ({
      ...goal,
      subtasks: (goal.subtasks || []).sort(
        (a: { position: number }, b: { position: number }) => a.position - b.position
      ),
    }));

    // Get recent SMS conversation history (last 10 messages with timestamps)
    const { data: recentMessages } = await supabase
      .from('sms_conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('sent_at', { ascending: false })
      .limit(10);

    const recentMessageTexts = (recentMessages || [])
      .reverse()
      .map((m) => {
        const msgTime = new Intl.DateTimeFormat('en-US', {
          timeZone: user.timezone,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).format(new Date(m.sent_at));
        const sender = m.direction === 'inbound' ? 'User' : 'Coach';
        return `[${msgTime}] ${sender}: ${m.message_text}`;
      });

    // Parse intent using Claude
    const parsed = await parseSmsReply({
      goals: goalsWithSubtasks,
      recentMessages: recentMessageTexts,
      incomingSms: body,
    });

    // Execute the parsed intent
    if (parsed.intent === 'update_goal' && parsed.goalId && parsed.newGoalText) {
      await supabase
        .from('goals')
        .update({ title: parsed.newGoalText })
        .eq('id', parsed.goalId)
        .eq('user_id', user.id);

      await supabase
        .from('activity_log')
        .insert({ user_id: user.id, action_type: 'goal_updated_via_sms', goal_id: parsed.goalId });
    }

    if (parsed.intent === 'add_subtask' && parsed.goalId && parsed.subtasksToAdd.length > 0) {
      const goalId = parsed.goalId;

      const { data: maxPosRow } = await supabase
        .from('subtasks')
        .select('position')
        .eq('goal_id', goalId)
        .order('position', { ascending: false })
        .limit(1)
        .single();

      let position = (maxPosRow?.position ?? 0) + 1;

      for (const subtaskTitle of parsed.subtasksToAdd) {
        const { data: subtask } = await supabase
          .from('subtasks')
          .insert({ goal_id: goalId, title: subtaskTitle, is_completed: false, position })
          .select()
          .single();

        if (subtask) {
          await supabase
            .from('activity_log')
            .insert({ user_id: user.id, action_type: 'subtask_created_via_sms', goal_id: goalId, subtask_id: subtask.id });
        }
        position++;
      }
    }

    if (parsed.intent === 'complete_subtask' && parsed.subtasksToComplete.length > 0) {
      for (const subtaskId of parsed.subtasksToComplete) {
        // Verify subtask belongs to user via goal join
        const { data: subtask } = await supabase
          .from('subtasks')
          .select('*, goals!inner(user_id)')
          .eq('id', subtaskId)
          .eq('goals.user_id', user.id)
          .single();

        if (subtask) {
          await supabase
            .from('subtasks')
            .update({ is_completed: true, completed_at: new Date().toISOString() })
            .eq('id', subtaskId);

          await supabase
            .from('activity_log')
            .insert({ user_id: user.id, action_type: 'subtask_completed_via_sms', goal_id: subtask.goal_id, subtask_id: subtaskId });
        }
      }
    }

    // Use coaching reply from parseSmsReply (always provided now)
    const replyText = parsed.coachingReply || "Got it! I'll check back later.";

    // Log inbound message
    await supabase
      .from('sms_conversations')
      .insert({ user_id: user.id, direction: 'inbound', message_text: body, goal_context: null });

    // Log outbound message
    await supabase
      .from('sms_conversations')
      .insert({ user_id: user.id, direction: 'outbound', message_text: replyText, goal_context: null });

    // Send coaching reply via SMS
    await sendSMS(user.phone_number, replyText);

    // Return empty TwiML since we send reply via API
    return new NextResponse('<Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('POST /api/twilio/webhook error:', error);
    return new NextResponse('<Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
