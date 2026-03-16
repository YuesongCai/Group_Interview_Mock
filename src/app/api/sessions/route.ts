import { NextRequest, NextResponse } from 'next/server';
import { createSession, getAllSessions } from '@/lib/session/manager';

// POST /api/sessions - Create a new session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jd_text, resume_text, difficulty, participant_count, language } = body;

    if (!jd_text) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'jd_text is required' } },
        { status: 400 }
      );
    }

    // TODO: Get actual user ID from auth
    const userId = 'demo-user';

    const session = createSession(userId, jd_text, resume_text, {
      difficulty: difficulty || 'medium',
      participant_count: participant_count || 4,
      language: language || 'zh',
    });

    return NextResponse.json(
      {
        session_id: session.id,
        status: session.status,
        created_at: session.created_at,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating session:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to create session' } },
      { status: 500 }
    );
  }
}

// GET /api/sessions - List all sessions
export async function GET() {
  try {
    const states = getAllSessions();
    const sessions = states.map(s => ({
      session_id: s.session.id,
      topic_title: s.topic?.title || null,
      status: s.session.status,
      participant_count: s.participants.length,
      message_count: s.messages.length,
      created_at: s.session.created_at,
    }));

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('Error listing sessions:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to list sessions' } },
      { status: 500 }
    );
  }
}
