import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { reorganizeTodos, ReorganizedItem } from '@/lib/claude';

async function getUser() {
  const { data } = await supabase.from('users').select('*').limit(1).single();
  return data;
}

// GET — fetch stored smart list items
export async function GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No user found' }, { status: 404 });

    const { data: items, error } = await supabase
      .from('smart_list_items')
      .select('*')
      .eq('user_id', user.id)
      .order('position');

    if (error) {
      console.error('GET /api/smart-list error:', error);
      return NextResponse.json({ error: 'Failed to fetch smart list' }, { status: 500 });
    }

    // Build tree from flat list
    const tree = buildTree(items || []);
    return NextResponse.json({ items: tree });
  } catch (error) {
    console.error('GET /api/smart-list error:', error);
    return NextResponse.json({ error: 'Failed to fetch smart list' }, { status: 500 });
  }
}

// POST — regenerate smart list from raw to-dos
export async function POST() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No user found' }, { status: 404 });

    // Get the user's single goal — same ordering as /api/goals
    const { data: goals } = await supabase
      .from('goals')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('position')
      .limit(1);

    if (!goals || goals.length === 0) {
      return NextResponse.json({ items: [] });
    }

    // Fetch all raw subtasks
    const { data: subtasks } = await supabase
      .from('subtasks')
      .select('*')
      .eq('goal_id', goals[0].id)
      .order('position');

    if (!subtasks || subtasks.length === 0) {
      // Clear smart list if no raw items
      await supabase.from('smart_list_items').delete().eq('user_id', user.id);
      return NextResponse.json({ items: [] });
    }

    // Ask Claude to reorganize
    const reorganized = await reorganizeTodos(subtasks);

    // Clear existing smart list
    await supabase.from('smart_list_items').delete().eq('user_id', user.id);

    // Batch insert new items in one DB call
    const items = await insertReorganized(user.id, reorganized);

    return NextResponse.json({ items });
  } catch (error) {
    console.error('POST /api/smart-list error:', error);
    return NextResponse.json({ error: 'Failed to regenerate smart list' }, { status: 500 });
  }
}

// PATCH — update a smart list item
export async function PATCH(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No user found' }, { status: 404 });

    const body = await request.json();
    const { itemId, ...updates } = body;

    if (!itemId) {
      return NextResponse.json({ error: 'itemId required' }, { status: 400 });
    }

    const updateFields: Record<string, unknown> = {};
    if (updates.title !== undefined) updateFields.title = updates.title;
    if (updates.is_completed !== undefined) updateFields.is_completed = updates.is_completed;
    if (updates.position !== undefined) updateFields.position = updates.position;

    const { data: item, error } = await supabase
      .from('smart_list_items')
      .update(updateFields)
      .eq('id', itemId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('PATCH /api/smart-list error:', error);
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }

    // Sync completion state back to the raw subtask
    if (updates.is_completed !== undefined && item.raw_subtask_id) {
      const completedAt = updates.is_completed ? new Date().toISOString() : null;
      await supabase
        .from('subtasks')
        .update({ is_completed: updates.is_completed, completed_at: completedAt })
        .eq('id', item.raw_subtask_id);

      // Cascade to children of that subtask
      await supabase
        .from('subtasks')
        .update({ is_completed: updates.is_completed, completed_at: completedAt })
        .eq('parent_id', item.raw_subtask_id);
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error('PATCH /api/smart-list error:', error);
    return NextResponse.json({ error: 'Failed to update smart list item' }, { status: 500 });
  }
}

// Helper: batch insert all reorganized items in one DB call (flat list only)
async function insertReorganized(
  userId: string,
  items: ReorganizedItem[],
): Promise<Record<string, unknown>[]> {
  if (items.length === 0) return [];

  const rows = items.map((item, i) => ({
    user_id: userId,
    raw_subtask_id: item.raw_subtask_id || null,
    title: item.title,
    priority: item.priority,
    reasoning: item.reasoning,
    is_completed: item.is_completed ?? false,
    position: i + 1,
    parent_id: null,
  }));

  const { data: inserted, error } = await supabase
    .from('smart_list_items')
    .insert(rows)
    .select();

  if (error || !inserted) {
    console.error('Batch insert smart list items error:', error);
    return [];
  }

  return inserted.map((row) => ({ ...row, children: [] }));
}

// Helper: build tree from flat list
function buildTree(items: Record<string, unknown>[]) {
  const map = new Map<string, Record<string, unknown>>();
  const roots: Record<string, unknown>[] = [];

  for (const item of items) {
    map.set(item.id as string, { ...item, children: [] });
  }

  for (const item of items) {
    const node = map.get(item.id as string)!;
    if (item.parent_id) {
      const parent = map.get(item.parent_id as string);
      if (parent) {
        (parent.children as Record<string, unknown>[]).push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}
