import { NextRequest, NextResponse } from 'next/server';
import { getSession, generateProactiveMessages } from '@/lib/session/manager';

// POST /api/sessions/:id/proactive - Trigger proactive AI messages
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

    const result = await generateProactiveMessages(params.id);

    return NextResponse.json({
      ai_responses: result.aiResponses.map(r => ({
        participant_id: r.participant.id,
        participant_name: r.participant.display_name,
        content: r.content,
        delay_ms: r.delay_ms,
        is_interrupt: r.is_interrupt,
        inner_monologue: r.inner_monologue || null,
      })),
      host_message: result.hostMessage || null,
    });
  } catch (error) {
    console.error('Error generating proactive messages:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to generate proactive messages' } },
      { status: 500 }
    );
  }
}
