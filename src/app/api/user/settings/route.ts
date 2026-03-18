import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function GET() {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .limit(1)
      .single();

    if (error || !user) {
      return NextResponse.json({ error: 'No user found' }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error('GET /api/user/settings error:', error);
    return NextResponse.json({ error: 'Failed to fetch user settings' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .limit(1)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'No user found' }, { status: 404 });
    }

    const body = await request.json();
    const allowedFields = [
      'phone_number',
      'nudge_style',
      'active_hours_start',
      'active_hours_end',
      'outcome_target',
      'timezone',
      'accent_color',
      'dark_mode',
      'custom_prompt',
    ];

    const updateFields: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateFields[field] = body[field];
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabase
      .from('users')
      .update(updateFields)
      .eq('id', user.id)
      .select()
      .single();

    if (updateError || !updated) {
      console.error('PATCH /api/user/settings update error:', updateError);
      return NextResponse.json({ error: 'Failed to update user settings' }, { status: 500 });
    }

    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error('PATCH /api/user/settings error:', error);
    return NextResponse.json({ error: 'Failed to update user settings' }, { status: 500 });
  }
}
