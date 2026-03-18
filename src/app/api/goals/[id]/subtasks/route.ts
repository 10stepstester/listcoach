import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .limit(1)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'No user found' }, { status: 404 });
    }

    const { data: goal } = await supabase
      .from('goals')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const { title, parent_id } = await request.json();
    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // Get max position among siblings (same parent_id)
    let query = supabase
      .from('subtasks')
      .select('position')
      .eq('goal_id', id)
      .order('position', { ascending: false })
      .limit(1);

    if (parent_id) {
      query = query.eq('parent_id', parent_id);
    } else {
      query = query.is('parent_id', null);
    }

    const { data: maxPosRow } = await query.single();
    const position = (maxPosRow?.position ?? 0) + 1;

    const insertData: Record<string, unknown> = {
      goal_id: id,
      title,
      is_completed: false,
      position,
    };
    if (parent_id) {
      insertData.parent_id = parent_id;
    }

    const { data: subtask, error: insertError } = await supabase
      .from('subtasks')
      .insert(insertData)
      .select()
      .single();

    if (insertError || !subtask) {
      console.error('POST /api/goals/[id]/subtasks insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create subtask' }, { status: 500 });
    }

    await supabase
      .from('activity_log')
      .insert({ user_id: user.id, action_type: 'subtask_created', goal_id: id, subtask_id: subtask.id });

    return NextResponse.json({ subtask }, { status: 201 });
  } catch (error) {
    console.error('POST /api/goals/[id]/subtasks error:', error);
    return NextResponse.json({ error: 'Failed to create subtask' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .limit(1)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'No user found' }, { status: 404 });
    }

    const { data: goal } = await supabase
      .from('goals')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const body = await request.json();
    const { subtaskId, title, is_completed, position } = body;
    if (!subtaskId) {
      return NextResponse.json({ error: 'subtaskId is required' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('subtasks')
      .select('*')
      .eq('id', subtaskId)
      .eq('goal_id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
    }

    const updateFields: Record<string, unknown> = {};

    if (title !== undefined) {
      updateFields.title = title;
      updateFields.ai_summary = null; // Clear stale summary so a fresh one gets generated
    }

    if (position !== undefined) {
      updateFields.position = position;
    }

    if (is_completed !== undefined) {
      updateFields.is_completed = is_completed;
      updateFields.completed_at = is_completed ? new Date().toISOString() : null;
    }

    const { data: updated, error: updateError } = await supabase
      .from('subtasks')
      .update(updateFields)
      .eq('id', subtaskId)
      .select()
      .single();

    if (updateError || !updated) {
      console.error('PATCH /api/goals/[id]/subtasks update error:', updateError);
      return NextResponse.json({ error: 'Failed to update subtask' }, { status: 500 });
    }

    // If completing/uncompleting, also cascade to children
    if (is_completed !== undefined) {
      await supabase
        .from('subtasks')
        .update({
          is_completed,
          completed_at: is_completed ? new Date().toISOString() : null,
        })
        .eq('parent_id', subtaskId);
    }

    const actionType = is_completed !== undefined
      ? (is_completed ? 'subtask_completed' : 'subtask_uncompleted')
      : 'subtask_updated';

    await supabase
      .from('activity_log')
      .insert({ user_id: user.id, action_type: actionType, goal_id: id, subtask_id: subtaskId });

    return NextResponse.json({ subtask: updated });
  } catch (error) {
    console.error('PATCH /api/goals/[id]/subtasks error:', error);
    return NextResponse.json({ error: 'Failed to update subtask' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .limit(1)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'No user found' }, { status: 404 });
    }

    const { data: goal } = await supabase
      .from('goals')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const { subtaskId } = await request.json();
    if (!subtaskId) {
      return NextResponse.json({ error: 'subtaskId is required' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('subtasks')
      .select('*')
      .eq('id', subtaskId)
      .eq('goal_id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
    }

    // CASCADE will handle deleting children
    const { error: deleteError } = await supabase
      .from('subtasks')
      .delete()
      .eq('id', subtaskId);

    if (deleteError) {
      console.error('DELETE /api/goals/[id]/subtasks delete error:', deleteError);
      return NextResponse.json({ error: 'Failed to delete subtask' }, { status: 500 });
    }

    await supabase
      .from('activity_log')
      .insert({ user_id: user.id, action_type: 'subtask_deleted', goal_id: id, subtask_id: subtaskId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/goals/[id]/subtasks error:', error);
    return NextResponse.json({ error: 'Failed to delete subtask' }, { status: 500 });
  }
}
