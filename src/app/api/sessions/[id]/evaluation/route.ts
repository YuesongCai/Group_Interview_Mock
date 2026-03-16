import { NextRequest, NextResponse } from 'next/server';
import { getSession, endSession } from '@/lib/session/manager';

// GET /api/sessions/:id/evaluation - Get or generate evaluation
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const state = getSession(params.id);

    if (!state) {
      return NextResponse.json(
        { error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } },
        { status: 404 }
      );
    }

    if (state.messages.length === 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'No messages in session; cannot evaluate' } },
        { status: 400 }
      );
    }

    const evaluation = await endSession(params.id);

    return NextResponse.json(evaluation);
  } catch (error) {
    console.error('Error generating evaluation:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to generate evaluation' } },
      { status: 500 }
    );
  }
}
