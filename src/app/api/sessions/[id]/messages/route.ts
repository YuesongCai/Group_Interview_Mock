import { NextRequest, NextResponse } from 'next/server';
import { getSession, handleUserMessage } from '@/lib/session/manager';

// GET /api/sessions/:id/messages - Get transcript
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const state = getSession(params.id);

  if (!state) {
    return NextResponse.json(
      { error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } },
      { status: 404 }
    );
  }

  const url = new URL(request.url);
  const phase = url.searchParams.get('phase');
  const participantId = url.searchParams.get('participant_id');

  let messages = state.messages;

  if (phase) {
    messages = messages.filter(m => m.phase === phase);
  }
  if (participantId) {
    messages = messages.filter(m => m.participant_id === participantId);
  }

  return NextResponse.json({
    session_id: params.id,
    messages,
    total_count: messages.length,
  });
}

// POST /api/sessions/:id/messages - Send user message & get AI responses
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { content } = body;

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'content is required' } },
        { status: 400 }
      );
    }

    const state = getSession(params.id);
    if (!state) {
      return NextResponse.json(
        { error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } },
        { status: 404 }
      );
    }

    const result = await handleUserMessage(params.id, content);

    return NextResponse.json({
      ai_responses: result.aiResponses.map(r => ({
        participant_id: r.participant.id,
        participant_name: r.participant.display_name,
        content: r.content,
        delay_ms: r.delay_ms,
        is_interrupt: r.is_interrupt,
        inner_monologue: r.inner_monologue || null,
      })),
      phase_change: result.phaseChange || null,
      system_message: result.systemMessage || null,
      host_message: result.hostMessage || null,
      session_ended: result.sessionEnded || false,
    });
  } catch (error) {
    console.error('Error handling message:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to process message' } },
      { status: 500 }
    );
  }
}
