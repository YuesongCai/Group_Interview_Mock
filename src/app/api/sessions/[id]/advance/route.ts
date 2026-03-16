import { NextRequest, NextResponse } from 'next/server';
import { getSession, advancePhase } from '@/lib/session/manager';

// POST /api/sessions/:id/advance - Advance to next phase
export async function POST(
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

    const result = await advancePhase(params.id);

    return NextResponse.json({
      phase: result.phase,
      host_message: result.hostMessage,
      ai_responses: result.aiResponses.map(r => ({
        participant_id: r.participant.id,
        participant_name: r.participant.display_name,
        content: r.content,
        delay_ms: r.delay_ms,
        is_interrupt: false,
      })),
    });
  } catch (error) {
    console.error('Error advancing phase:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to advance phase' } },
      { status: 500 }
    );
  }
}
