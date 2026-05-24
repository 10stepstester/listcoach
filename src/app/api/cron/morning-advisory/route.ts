import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/lib/db';

const anthropic = new Anthropic();

const ADVISORS = [
  {
    name: 'Dr. Mara',
    system: `You are Dr. Mara — a solo chiropractor who grew her practice from scratch. You know what marketing actually fills the schedule vs. what just feels productive. You've been where this person is: running a clinic full-time while trying to build systems on the side. You speak from experience about what moves the needle for patient volume. One paragraph, direct and practical.`,
  },
  {
    name: 'Sam Patel',
    system: `You are Sam Patel — an indie SaaS founder who built and sold a niche B2B tool. You're allergic to half-built side projects bleeding time. You think in terms of shipping, cutting scope, and not letting the builder's instinct eat the operator's calendar. One paragraph, sharp and opinionated.`,
  },
  {
    name: 'Jess Romero',
    system: `You are Jess Romero — a local-marketing and SEO operator. You live in Google Business Profile, reviews, short-form video, and local citations. You know what actually drives foot traffic to a local health practice. One paragraph, tactical and specific.`,
  },
  {
    name: 'Tony',
    system: `You are Tony — a solo-operator productivity coach. Deep work, time-blocking, ruthless about what fits in a 5-hour-per-week side budget. You help people who are stretched thin protect their most valuable hours. One paragraph, structured and no-nonsense.`,
  },
  {
    name: 'Vik',
    system: `You are Vik — The Prioritizer, Naval/Thiel-flavored. You keep asking "what's the one thing?" until everyone aligns. You cut through noise and force focus on the highest-leverage action. One paragraph, philosophical but pointed.`,
  },
];

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
      console.error('[MorningAdvisory] Error fetching user:', userError);
      return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
    }

    // Find Sprint item across all active goals
    const { data: goals } = await supabase
      .from('goals')
      .select('*, subtasks(*)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('position');

    if (!goals || goals.length === 0) {
      return NextResponse.json({ error: 'No active goals found' }, { status: 404 });
    }

    const sprintRegex = /sprint/i;
    let sprintItem = null;
    let sprintGoal = null;
    for (const goal of goals) {
      const sorted = (goal.subtasks || []).sort(
        (a: { position: number }, b: { position: number }) => a.position - b.position
      );
      const found = sorted.find(
        (s: { title: string; parent_id: string | null }) => !s.parent_id && sprintRegex.test(s.title)
      );
      if (found) {
        sprintItem = found;
        sprintGoal = { ...goal, subtasks: sorted };
        break;
      }
    }

    if (!sprintItem) {
      return NextResponse.json({ error: 'No Sprint item found. Add a top-level subtask matching "Sprint" to enable the morning advisory.' }, { status: 404 });
    }

    // Collect sprint tracks with completion state
    const sprintChildren = (sprintGoal!.subtasks || []).filter(
      (s: { parent_id: string | null }) => s.parent_id === sprintItem.id
    );
    const sprintTracks = sprintChildren.map((s: { title: string; is_completed: boolean }) => ({
      title: s.title,
      completed: s.is_completed,
    }));

    // Compute yesterday's activity
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const { data: completedYesterday } = await supabase
      .from('subtasks')
      .select('title, completed_at')
      .eq('is_completed', true)
      .gte('completed_at', yesterday.toISOString())
      .lte('completed_at', now.toISOString());

    const { data: smsYesterday } = await supabase
      .from('sms_conversations')
      .select('direction, sent_at')
      .eq('user_id', user.id)
      .gte('sent_at', yesterday.toISOString())
      .lte('sent_at', now.toISOString())
      .order('sent_at', { ascending: true });

    const userReplies = (smsYesterday || []).filter((m) => m.direction === 'inbound');
    const outboundMessages = (smsYesterday || []).filter((m) => m.direction === 'outbound');

    // Compute median reply latency
    let medianReplyLatencyMin: number | null = null;
    if (userReplies.length > 0 && outboundMessages.length > 0) {
      const latencies: number[] = [];
      for (const reply of userReplies) {
        const replyTime = new Date(reply.sent_at).getTime();
        const precedingNudge = outboundMessages
          .filter((m) => new Date(m.sent_at).getTime() < replyTime)
          .pop();
        if (precedingNudge) {
          latencies.push((replyTime - new Date(precedingNudge.sent_at).getTime()) / 60000);
        }
      }
      if (latencies.length > 0) {
        latencies.sort((a, b) => a - b);
        const mid = Math.floor(latencies.length / 2);
        medianReplyLatencyMin = latencies.length % 2 === 0
          ? (latencies[mid - 1] + latencies[mid]) / 2
          : latencies[mid];
        medianReplyLatencyMin = Math.round(medianReplyLatencyMin);
      }
    }

    const yesterdayActivity = {
      tasks_completed: (completedYesterday || []).map((s) => s.title),
      tasks_completed_count: (completedYesterday || []).length,
      user_replies: userReplies.length,
      outbound_nudges: outboundMessages.length,
      median_reply_latency_min: medianReplyLatencyMin,
    };

    // Build context for advisors
    const todayLocal = new Intl.DateTimeFormat('en-CA', {
      timeZone: user.timezone,
    }).format(now);
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: user.timezone,
      weekday: 'long',
    }).format(now);

    const contextPayload = {
      sprint_tracks: sprintTracks,
      sprint_completion_state: {
        total: sprintTracks.length,
        completed: sprintTracks.filter((t: { completed: boolean }) => t.completed).length,
        incomplete: sprintTracks.filter((t: { completed: boolean }) => !t.completed).length,
      },
      yesterday_activity: yesterdayActivity,
      current_date_local: todayLocal,
      weekday,
    };

    const contextText = JSON.stringify(contextPayload, null, 2);

    const advisorPrompt = `Here is today's context for a solo chiropractor who is also building software tools. His quarterly goal is more patients in the chair. He has a 5-track sprint and works on it in whatever time he can carve out around a full clinical schedule.

Context:
${contextText}

Based on this context, give your perspective on what he should focus on today and how to approach it. One paragraph.`;

    // Fire 5 advisor calls in parallel
    const advisorPromises = ADVISORS.map(async (advisor) => {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 300,
        system: advisor.system,
        messages: [{ role: 'user', content: advisorPrompt }],
      });
      const textBlock = response.content.find((block) => block.type === 'text');
      return {
        advisor_name: advisor.name,
        perspective_text: textBlock?.text.trim() || '',
      };
    });

    const advisorResults = await Promise.all(advisorPromises);

    // Fire synthesizer call
    const advisorPerspectives = advisorResults
      .map((r) => `**${r.advisor_name}:** ${r.perspective_text}`)
      .join('\n\n');

    const synthResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      system: `You are synthesizing 5 advisor perspectives into a daily focus and nudge guidance for an aggressive every-10-min SMS coach. The coach will text the user relentlessly today using this guidance. Output strict JSON: { "recommended_focus": "<exact sprint track title>", "nudge_guidance": "<paragraph describing today's tone, angle, what to celebrate, what to push on, what to back off from based on the advisor consensus and yesterday's signals>" }.`,
      messages: [{
        role: 'user',
        content: `Context:\n${contextText}\n\nAdvisor perspectives:\n${advisorPerspectives}\n\nSynthesize into the JSON output.`,
      }],
    });

    const synthBlock = synthResponse.content.find((block) => block.type === 'text');
    let synthJson = synthBlock?.text.trim() || '{}';
    synthJson = synthJson.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');

    let synthesis: { recommended_focus: string; nudge_guidance: string };
    try {
      synthesis = JSON.parse(synthJson);
    } catch {
      console.error('[MorningAdvisory] Failed to parse synthesizer JSON:', synthJson);
      synthesis = {
        recommended_focus: sprintTracks.find((t: { completed: boolean }) => !t.completed)?.title || '',
        nudge_guidance: 'Push hard on the first incomplete sprint track. Celebrate any completions from yesterday. Escalate if silence.',
      };
    }

    // Upsert daily_advisory row
    const { data: advisoryRow, error: upsertError } = await supabase
      .from('daily_advisory')
      .upsert(
        {
          user_id: user.id,
          date: todayLocal,
          sprint_snapshot: sprintTracks,
          yesterday_activity: yesterdayActivity,
          advisor_transcript: advisorResults,
          recommended_focus: synthesis.recommended_focus,
          nudge_guidance: synthesis.nudge_guidance,
        },
        { onConflict: 'user_id,date' }
      )
      .select()
      .single();

    if (upsertError) {
      console.error('[MorningAdvisory] Upsert error:', upsertError);
      return NextResponse.json({ error: 'Failed to save advisory', details: upsertError }, { status: 500 });
    }

    console.log(`[MorningAdvisory] Advisory created for ${todayLocal}:`, synthesis.recommended_focus);

    return NextResponse.json({
      success: true,
      advisory: advisoryRow,
    });
  } catch (error) {
    console.error('[MorningAdvisory] Error:', error);
    return NextResponse.json({ error: 'Morning advisory failed' }, { status: 500 });
  }
}
