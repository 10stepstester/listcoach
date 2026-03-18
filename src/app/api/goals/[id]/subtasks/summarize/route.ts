import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/lib/db';

const anthropic = new Anthropic();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: goalId } = await params;
    const { subtaskId, title } = await request.json();

    if (!subtaskId || !title) {
      return NextResponse.json({ error: 'Missing subtaskId or title' }, { status: 400 });
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 30,
      messages: [
        {
          role: 'user',
          content: `Summarize this task into a very short label (under 8 words). Just return the summary, nothing else.\n\nTask: ${title}`,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const summary = textBlock?.text.trim() || null;

    if (summary) {
      await supabase
        .from('subtasks')
        .update({ ai_summary: summary })
        .eq('id', subtaskId)
        .eq('goal_id', goalId);
    }

    return NextResponse.json({ summary });
  } catch (error) {
    console.error('Error generating summary:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
