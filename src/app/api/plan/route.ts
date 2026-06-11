import { NextResponse } from 'next/server';
import { getActivePlans, savePlanDoc, type PlanKey } from '@/lib/plan-store';

// GET → current plans (edited value, or the code default). PATCH → save edits.
export async function GET() {
  try {
    const plans = await getActivePlans();
    return NextResponse.json({ plans });
  } catch (error) {
    console.error('GET /api/plan error:', error);
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const keys: PlanKey[] = ['v4', 'practice', 'amendments', 'facts'];
    let saved = 0;
    for (const key of keys) {
      if (typeof body[key] === 'string') {
        await savePlanDoc(key, body[key]);
        saved++;
      }
    }
    if (saved === 0) {
      return NextResponse.json({ error: 'No plan content provided' }, { status: 400 });
    }
    const plans = await getActivePlans();
    return NextResponse.json({ plans, saved });
  } catch (error) {
    console.error('PATCH /api/plan error:', error);
    return NextResponse.json({ error: 'Failed to save plans' }, { status: 500 });
  }
}
