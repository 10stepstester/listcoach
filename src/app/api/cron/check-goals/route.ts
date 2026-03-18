import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { generateNudge } from '@/lib/claude';
import { sendSMS } from '@/lib/twilio';
import { hasEventNow } from '@/lib/google-calendar';

export async function GET(request: Request) {
  try {
    // Verify cron secret if configured
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*');

    if (usersError || !users) {
      console.error('GET /api/cron/check-goals error fetching users:', usersError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    const summary: { userId: string; action: string }[] = [];

    for (const user of users) {
      try {
        // === HARD CHECK 1: Active hours ===
        const now = new Date();
        const userTime = new Intl.DateTimeFormat('en-US', {
          timeZone: user.timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(now);

        const [currentHour, currentMinute] = userTime.split(':').map(Number);
        const currentMinutes = currentHour * 60 + currentMinute;

        const [startHour, startMinute] = user.active_hours_start.split(':').map(Number);
        const startMinutes = startHour * 60 + startMinute;

        const [endHour, endMinute] = user.active_hours_end.split(':').map(Number);
        const endMinutes = endHour * 60 + endMinute;

        console.log(`[Cron] User ${user.id}: timezone=${user.timezone}, userTime=${userTime}, currentMinutes=${currentMinutes}, startMinutes=${startMinutes}, endMinutes=${endMinutes}`);

        if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
          summary.push({ userId: user.id, action: `skipped_outside_hours (${userTime} not in ${user.active_hours_start}-${user.active_hours_end})` });
          continue;
        }

        // === HARD CHECK 2: Google Calendar busy ===
        if (user.google_calendar_token && user.google_calendar_refresh_token) {
          try {
            const busy = await hasEventNow(
              user.google_calendar_token,
              user.google_calendar_refresh_token,
              user.id
            );
            if (busy) {
              summary.push({ userId: user.id, action: 'skipped_calendar_event' });
              continue;
            }
          } catch (calError) {
            console.error(`[Cron] Calendar check failed for user ${user.id}:`, calError);
            summary.push({ userId: user.id, action: 'skipped_calendar_error' });
            continue;
          }
        }

        // === Fetch goals with subtasks ===
        const { data: goals } = await supabase
          .from('goals')
          .select('*, subtasks(*)')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('position');

        if (!goals || goals.length === 0) {
          summary.push({ userId: user.id, action: 'skipped_no_goals' });
          continue;
        }

        const goalsWithSubtasks = goals.map((goal) => ({
          ...goal,
          subtasks: (goal.subtasks || []).sort(
            (a: { position: number }, b: { position: number }) => a.position - b.position
          ),
        }));

        // Find first uncompleted subtask
        let firstUncompleted: { goalTitle: string; subtaskTitle: string } | null = null;
        for (const goal of goalsWithSubtasks) {
          const uncompleted = (goal.subtasks || []).find((s: { is_completed: boolean }) => !s.is_completed);
          if (uncompleted) {
            firstUncompleted = { goalTitle: goal.title, subtaskTitle: uncompleted.title };
            break;
          }
        }

        // === Calculate hours since last activity ===
        const { data: lastActivityRow } = await supabase
          .from('activity_log')
          .select('timestamp')
          .eq('user_id', user.id)
          .order('timestamp', { ascending: false })
          .limit(1)
          .single();

        let hoursSinceActivity = 24;
        if (lastActivityRow) {
          const lastTime = new Date(lastActivityRow.timestamp).getTime();
          hoursSinceActivity = Math.round((now.getTime() - lastTime) / (1000 * 60 * 60) * 10) / 10;
        }

        // === Fetch last 20 SMS messages with timestamps in user's timezone ===
        const { data: recentSmsRows } = await supabase
          .from('sms_conversations')
          .select('*')
          .eq('user_id', user.id)
          .order('sent_at', { ascending: false })
          .limit(20);

        const recentSMS = (recentSmsRows || [])
          .reverse()
          .map((m) => {
            // Format timestamp in user's timezone
            const msgTime = new Intl.DateTimeFormat('en-US', {
              timeZone: user.timezone,
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            }).format(new Date(m.sent_at));
            const sender = m.direction === 'inbound' ? 'User' : 'Coach';
            return `[${msgTime}] ${sender}: ${m.message_text}`;
          });

        // Format current time in user's timezone
        const currentTimeFormatted = new Intl.DateTimeFormat('en-US', {
          timeZone: user.timezone,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).format(now);

        // Determine time of day label
        let timeOfDay = 'morning';
        if (currentHour >= 12 && currentHour < 17) timeOfDay = 'afternoon';
        else if (currentHour >= 17) timeOfDay = 'evening';

        // === AI DECIDES: SEND or SKIP ===
        const result = await generateNudge({
          nudgeStyle: user.nudge_style,
          goals: goalsWithSubtasks,
          firstUncompleted,
          outcomeTarget: user.outcome_target,
          hoursSinceActivity,
          timeOfDay,
          currentTime: currentTimeFormatted,
          recentSMS,
          customPrompt: user.custom_prompt,
        });

        // Check if AI decided to skip
        if (result.toUpperCase().startsWith('SKIP')) {
          console.log(`[Cron] AI skip for user ${user.id}: ${result}`);
          summary.push({ userId: user.id, action: `ai_skip: ${result}` });
          continue;
        }

        // AI decided to send — result is the nudge text
        const nudgeText = result;

        // Send via Twilio
        await sendSMS(user.phone_number, nudgeText);

        // Log to sms_conversations
        await supabase
          .from('sms_conversations')
          .insert({
            user_id: user.id,
            direction: 'outbound',
            message_text: nudgeText,
            goal_context: JSON.stringify({ firstUncompleted, hoursSinceActivity }),
          });

        // Log to activity_log
        await supabase
          .from('activity_log')
          .insert({
            user_id: user.id,
            action_type: 'nudge_sent',
            goal_id: firstUncompleted ? goals[0]?.id : null,
          });

        summary.push({ userId: user.id, action: 'nudge_sent', });
      } catch (userError) {
        console.error(`[Cron] Error processing user ${user.id}:`, userError);
        summary.push({ userId: user.id, action: `error: ${(userError as Error).message}` });
      }
    }

    return NextResponse.json({
      success: true,
      processed: users.length,
      summary,
    });
  } catch (error) {
    console.error('GET /api/cron/check-goals error:', error);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}
