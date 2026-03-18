import Anthropic from '@anthropic-ai/sdk';
import type { Goal, Subtask } from '@/types/index';
import { DEFAULT_COACHING_PROMPT } from '@/lib/prompts';

const anthropic = new Anthropic();

// Re-export so existing imports still work
export { DEFAULT_COACHING_PROMPT };

interface NudgeContext {
  nudgeStyle: 'direct' | 'average' | 'gentle';
  goals: Goal[];
  firstUncompleted: { goalTitle: string; subtaskTitle: string } | null;
  outcomeTarget: string;
  hoursSinceActivity: number;
  timeOfDay: string;
  currentTime: string;
  recentSMS: string[];
  customPrompt?: string | null;
}

export async function generateNudge(context: NudgeContext): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[Claude] API key not configured. Returning placeholder nudge.');
    if (context.firstUncompleted) {
      return `Time to work on: ${context.firstUncompleted.subtaskTitle}`;
    }
    return 'Time to make progress on your goals!';
  }

  try {
    const goalsSummary = context.goals.map((g, i) => {
      const subtasks = (g.subtasks || []).map(
        (s) => `  ${s.is_completed ? '[x]' : '[ ]'} ${s.title}`
      ).join('\n');
      return `${i + 1}. ${g.title}\n${subtasks || '  (no subtasks)'}`;
    }).join('\n');

    const nextTask = context.firstUncompleted
      ? `"${context.firstUncompleted.subtaskTitle}" under goal "${context.firstUncompleted.goalTitle}"`
      : 'All subtasks are completed or no subtasks exist.';

    const recentConversation = context.recentSMS.length > 0 ? context.recentSMS.join('\n') : '(no recent messages)';

    const promptTemplate = context.customPrompt || DEFAULT_COACHING_PROMPT;

    const filledPrompt = promptTemplate
      .replace(/\{\{nudge_style\}\}/g, context.nudgeStyle)
      .replace(/\{\{time_of_day\}\}/g, context.timeOfDay)
      .replace(/\{\{current_time\}\}/g, context.currentTime)
      .replace(/\{\{hours_since_activity\}\}/g, String(context.hoursSinceActivity))
      .replace(/\{\{outcome_target\}\}/g, context.outcomeTarget)
      .replace(/\{\{goals_summary\}\}/g, goalsSummary)
      .replace(/\{\{next_task\}\}/g, nextTask)
      .replace(/\{\{recent_conversation\}\}/g, recentConversation);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 200,
      system: 'You are an SMS coaching assistant. Follow the instructions precisely.',
      messages: [{ role: 'user', content: filledPrompt }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock ? textBlock.text.trim() : 'Time to make progress on your goals!';
  } catch (error) {
    console.error('[Claude] Error generating nudge:', error);
    if (context.firstUncompleted) {
      return `Time to work on: ${context.firstUncompleted.subtaskTitle}`;
    }
    return 'Time to make progress on your goals!';
  }
}

export interface ParsedSmsReply {
  intent: 'update_goal' | 'add_subtask' | 'complete_subtask' | 'question' | 'other';
  goalId: string | null;
  newGoalText: string | null;
  subtasksToAdd: string[];
  subtasksToComplete: string[];
  needsClarification: boolean;
  coachingReply: string;
}

interface ParseSmsContext {
  goals: Goal[];
  recentMessages: string[];
  incomingSms: string;
}

export async function parseSmsReply(context: ParseSmsContext): Promise<ParsedSmsReply> {
  const fallback: ParsedSmsReply = {
    intent: 'other',
    goalId: null,
    newGoalText: null,
    subtasksToAdd: [],
    subtasksToComplete: [],
    needsClarification: true,
    coachingReply: "Got it! I'll check back later.",
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[Claude] API key not configured. Returning fallback parse.');
    return fallback;
  }

  try {
    const goalsContext = context.goals.map((g) => ({
      id: g.id,
      title: g.title,
      subtasks: (g.subtasks || []).map((s) => ({
        id: s.id,
        title: s.title,
        is_completed: s.is_completed,
      })),
    }));

    const userMessage = `You're a friend helping someone track goals via text. They just sent you a message. Figure out what they mean and respond naturally.

Their goals:
${JSON.stringify(goalsContext, null, 2)}

Recent conversation:
${context.recentMessages.length > 0 ? context.recentMessages.join('\n') : '(none)'}

Their new message: "${context.incomingSms}"

Respond with JSON only (no markdown):
{
  "intent": "update_goal" | "add_subtask" | "complete_subtask" | "question" | "other",
  "goalId": "<goal id or null>",
  "newGoalText": "<new goal title if updating, or null>",
  "subtasksToAdd": ["<subtask titles to add>"],
  "subtasksToComplete": ["<subtask IDs to mark complete>"],
  "needsClarification": true/false,
  "coachingReply": "<your reply as a friend, under 160 chars>"
}

Read the conversation. Respond to what they actually said. If they finished something, mark it done. If they're busy or unavailable, just acknowledge it — don't push tasks on them.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 200,
      system: 'You are a JSON parser for an SMS-based goal tracking app. Always respond with valid JSON only, no markdown code fences.',
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock) return fallback;

    const parsed = JSON.parse(textBlock.text.trim()) as ParsedSmsReply;
    return parsed;
  } catch (error) {
    console.error('[Claude] Error parsing SMS reply:', error);
    return fallback;
  }
}

interface CoachingReplyContext {
  nudgeStyle: 'direct' | 'average' | 'gentle';
  goals: Goal[];
  action: string;
  outcomeTarget: string;
  timeOfDay: string;
  currentTime: string;
  recentSMS: string[];
  hoursSinceActivity: number;
}

export async function generateCoachingReply(context: CoachingReplyContext): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[Claude] API key not configured. Returning placeholder reply.');
    return 'Nice work! Keep the momentum going.';
  }

  try {
    const recentConversation = context.recentSMS.length > 0 ? context.recentSMS.join('\n') : '(no recent messages)';

    const userMessage = `You're a friend helping someone with their goals via text. Something just happened and you need to reply.

Style: ${context.nudgeStyle} | Time: ${context.timeOfDay} (${context.currentTime})
What happened: ${context.action}
Their target: ${context.outcomeTarget}

Goals:
${context.goals.map((g, i) => {
  const subtasks = (g.subtasks || []).map(
    (s) => `  ${s.is_completed ? '[x]' : '[ ]'} ${s.title}`
  ).join('\n');
  return `${i + 1}. ${g.title}\n${subtasks || '  (no subtasks)'}`;
}).join('\n')}

Recent texts:
${recentConversation}

Reply naturally as a friend. Under 160 characters. Read the conversation — respond to what they actually said.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 200,
      system: 'You are a friendly SMS coaching assistant. Reply with only the text message, nothing else.',
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock ? textBlock.text.trim() : 'Nice work! Keep the momentum going.';
  } catch (error) {
    console.error('[Claude] Error generating coaching reply:', error);
    return 'Nice work! Keep the momentum going.';
  }
}

export interface ReorganizedItem {
  raw_subtask_id: string | null;
  title: string;
  priority: number;
  reasoning: string;
  is_completed: boolean;
  children: ReorganizedItem[];
}

export async function reorganizeTodos(subtasks: Subtask[]): Promise<ReorganizedItem[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[Claude] API key not configured. Returning items as-is.');
    return subtasks.map((s, i) => ({
      raw_subtask_id: s.id,
      title: s.title,
      priority: i + 1,
      reasoning: '',
      is_completed: s.is_completed,
      children: [],
    }));
  }

  try {
    // Pre-filter: only send leaf nodes (items with no children) — skip category headers
    const subtaskIds = new Set(subtasks.map((s) => s.id));
    const parentIds = new Set(subtasks.filter((s) => s.parent_id).map((s) => s.parent_id as string));
    const leaves = subtasks.filter((s) => !parentIds.has(s.id));

    // Use short index-based IDs to minimise token count
    const indexToId = leaves.map((s) => s.id);
    const todoLines = leaves.map((s, i) =>
      `${i}|${s.is_completed ? 'done' : 'todo'}|${s.title}`
    ).join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system: 'You prioritize to-do lists. Respond with a JSON array of integers only — no markdown, no explanation.',
      messages: [{
        role: 'user',
        content: `Prioritize these ${leaves.length} tasks by importance (most important first). Put completed tasks last.

Format: index|status|title
${todoLines}

Return ONLY a JSON array of the indices in priority order, like: [3,0,7,1,...]
Include ALL ${leaves.length} indices exactly once.`
      }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock) {
      return leaves.map((s, i) => ({
        raw_subtask_id: s.id,
        title: s.title,
        priority: i + 1,
        reasoning: '',
        is_completed: s.is_completed,
        children: [],
      }));
    }

    // Strip markdown code fences if present
    let jsonText = textBlock.text.trim();
    jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');

    // Response is just an ordered array of indices e.g. [3, 0, 7, ...]
    const orderedIndices = JSON.parse(jsonText) as number[];
    return orderedIndices.map((idx, pos) => ({
      raw_subtask_id: indexToId[idx] ?? null,
      title: leaves[idx]?.title ?? '',
      priority: pos + 1,
      reasoning: '',
      is_completed: leaves[idx]?.is_completed ?? false,
      children: [],
    }));
  } catch (error) {
    console.error('[Claude] Error reorganizing todos:', error);
    // Fall back to leaf nodes in original order
    const parentIds = new Set(subtasks.filter((s) => s.parent_id).map((s) => s.parent_id as string));
    const leaves = subtasks.filter((s) => !parentIds.has(s.id));
    return leaves.map((s, i) => ({
      raw_subtask_id: s.id,
      title: s.title,
      priority: i + 1,
      reasoning: '',
      is_completed: s.is_completed,
      children: [],
    }));
  }
}
