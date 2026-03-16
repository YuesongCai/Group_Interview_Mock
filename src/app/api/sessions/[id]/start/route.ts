import { NextRequest, NextResponse } from 'next/server';
import { getSession, prepareSession, startSession } from '@/lib/session/manager';

// POST /api/sessions/:id/start - Prepare and start session
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionId = params.id;
    let state = getSession(sessionId);

    if (!state) {
      return NextResponse.json(
        { error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } },
        { status: 404 }
      );
    }

    if (state.session.status !== 'created' && state.session.status !== 'ready') {
      if (state.session.status === 'opening' || state.session.status === 'discussion' || state.session.status === 'summary') {
        return NextResponse.json(
          { error: { code: 'SESSION_ALREADY_STARTED', message: 'Session already in progress' } },
          { status: 409 }
        );
      }
    }

    // Step 1: Generate topic and personas if not ready
    if (state.session.status === 'created') {
      state = await prepareSession(sessionId);
    }

    // Step 2: Start session and get opening messages
    const { systemMessage, aiResponses } = await startSession(sessionId);

    return NextResponse.json({
      session_id: sessionId,
      status: state.session.status,
      topic: state.topic,
      participants: state.participants.map(p => ({
        id: p.id,
        display_name: p.display_name,
        type: p.type,
        avatar_color: p.avatar_color,
        background_summary: p.persona_card?.background || null,
      })),
      config: state.session.config,
      opening: {
        system_message: systemMessage,
        ai_responses: aiResponses.map(r => ({
          participant_id: r.participant.id,
          participant_name: r.participant.display_name,
          content: r.content,
          delay_ms: r.delay_ms,
        })),
      },
    });
  } catch (error) {
    console.error('Error starting session:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to start session' } },
      { status: 500 }
    );
  }
}
