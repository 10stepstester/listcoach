import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1000,
      system: `You are an expert at writing coaching prompt templates for an SMS-based goal tracking app.
The user will give you a prompt template that uses {{placeholders}} for dynamic data.

Available placeholders:
- {{nudge_style}} - The user's preferred coaching style (direct/average/gentle)
- {{time_of_day}} - morning/afternoon/evening
- {{hours_since_activity}} - How long since the user last did something
- {{outcome_target}} - The user's big-picture goal
- {{goals_summary}} - A formatted list of current goals and subtask progress
- {{next_task}} - The next uncompleted subtask
- {{recent_conversation}} - Recent SMS conversation history

Your job: Improve the prompt to be more effective as a coaching nudge generator. Keep the same general intent but make it clearer, more concise, and more effective. Preserve all {{placeholders}} the user included and suggest adding any that would be helpful.

Respond with ONLY the improved prompt template text, nothing else.`,
      messages: [{ role: 'user', content: `Please improve this coaching prompt template:\n\n${prompt}` }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const refined = textBlock?.text.trim() || prompt;

    return NextResponse.json({ refined });
  } catch (error) {
    console.error('POST /api/user/refine-prompt error:', error);
    return NextResponse.json({ error: 'Failed to refine prompt' }, { status: 500 });
  }
}
