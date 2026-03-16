# GroupMock - API Design

## 1. API Overview

RESTful API for session management, user operations, and evaluation retrieval. Real-time communication handled via WebSocket.

**Base URL:** `https://api.groupmock.cn/v1`

---

## 2. REST Endpoints

### 2.1 Sessions

#### Create Session

```
POST /api/sessions
```

Creates a new group interview session. Accepts resume file and JD text.

**Request:**
```json
{
    "jd_text": "string (required) - Job description text",
    "resume_file": "file (optional) - Resume PDF upload",
    "resume_text": "string (optional) - Resume as plain text",
    "difficulty": "easy | medium | hard (default: medium)",
    "participant_count": "3-5 (default: 4)",
    "language": "zh | en (default: zh)"
}
```

**Response (201 Created):**
```json
{
    "session_id": "uuid",
    "status": "created",
    "created_at": "ISO8601"
}
```

#### Start Session

```
POST /api/sessions/:id/start
```

Triggers topic and persona generation; returns WebSocket URL for real-time chat.

**Response (200 OK):**
```json
{
    "session_id": "uuid",
    "status": "ready",
    "topic": {
        "title": "string",
        "description": "string",
        "type": "case_study | debate | prioritization"
    },
    "participants": [
        {
            "id": "uuid",
            "display_name": "string",
            "type": "human | ai",
            "avatar_url": "string",
            "background_summary": "string"
        }
    ],
    "websocket_url": "wss://api.groupmock.cn/ws/sessions/{session_id}/live",
    "config": {
        "duration_minutes": 25,
        "phases": {
            "opening": 3,
            "discussion": 18,
            "summary": 4
        }
    }
}
```

#### Get Session Transcript

```
GET /api/sessions/:id/messages
```

Retrieves the full transcript for a completed or in-progress session.

**Query Parameters:**
- `phase` (optional): Filter by phase (`opening`, `discussion`, `summary`)
- `participant_id` (optional): Filter by participant

**Response (200 OK):**
```json
{
    "session_id": "uuid",
    "messages": [
        {
            "id": "uuid",
            "participant_id": "uuid",
            "participant_name": "string",
            "participant_type": "human | ai",
            "content": "string",
            "phase": "opening | discussion | summary",
            "is_interrupt": false,
            "timestamp": "ISO8601"
        }
    ],
    "total_count": 80
}
```

#### Get / Trigger Evaluation

```
GET /api/sessions/:id/evaluation
```

Retrieves the evaluation report. If not yet generated, triggers generation.

**Response (200 OK):**
```json
{
    "session_id": "uuid",
    "overall_score": 72,
    "percentile": 65,
    "dimensions": {
        "leadership_initiative": {
            "score": 68,
            "weight": 0.25,
            "evidence": [
                {
                    "description": "Proposed SWOT framework early in discussion",
                    "timestamp": "ISO8601",
                    "quote": "我认为我们可以先用SWOT分析来梳理这个问题..."
                }
            ],
            "improvement": "Try to take charge more actively when the discussion stalls. You had opportunities at 12:05 and 15:30 that were taken by other candidates."
        },
        "logical_reasoning": {
            "score": 78,
            "weight": 0.25,
            "evidence": [],
            "improvement": "string"
        },
        "collaboration_eq": {
            "score": 70,
            "weight": 0.20,
            "evidence": [],
            "improvement": "string"
        },
        "communication_clarity": {
            "score": 75,
            "weight": 0.15,
            "evidence": [],
            "improvement": "string"
        },
        "innovation_insight": {
            "score": 65,
            "weight": 0.15,
            "evidence": [],
            "improvement": "string"
        }
    },
    "strengths": [
        "Strong analytical framework usage",
        "Good active listening signals"
    ],
    "improvement_areas": [
        "Speak up earlier in discussions",
        "Challenge assumptions more directly"
    ],
    "comparison_narrative": "string - How user performed relative to AI candidates",
    "replay_highlights": [
        {
            "type": "strongest_argument | missed_opportunity | best_collaboration",
            "timestamp": "ISO8601",
            "description": "string"
        }
    ],
    "created_at": "ISO8601"
}
```

### 2.2 Users

#### Get User History

```
GET /api/users/:id/history
```

Lists past sessions with scores and metadata.

**Query Parameters:**
- `limit` (default: 20, max: 100)
- `offset` (default: 0)
- `sort` (default: `-created_at`)

**Response (200 OK):**
```json
{
    "user_id": "uuid",
    "sessions": [
        {
            "session_id": "uuid",
            "topic_title": "string",
            "status": "completed | abandoned | paused",
            "overall_score": 72,
            "participant_count": 4,
            "duration_minutes": 25,
            "created_at": "ISO8601"
        }
    ],
    "total_count": 15,
    "score_trend": {
        "last_5_avg": 71,
        "last_10_avg": 68,
        "improvement_rate": "+4.4%"
    }
}
```

### 2.3 Authentication

#### Login / Register

```
POST /api/auth/login
POST /api/auth/register
```

Standard OAuth / email authentication via Supabase Auth. Supports WeChat OAuth for China market.

---

## 3. WebSocket Protocol

### 3.1 Connection

```
ws://api.groupmock.cn/ws/sessions/{session_id}/live
```

**Authentication:** JWT token passed as query parameter or in first message.

### 3.2 Message Types

All messages use a typed envelope format:

```typescript
// Client → Server
interface ClientMessage {
    type: 'user_message' | 'user_action';
    payload: {
        content: string;        // Message text
        action?: 'interrupt';   // Optional action flag
    };
    timestamp: string;          // ISO8601
}

// Server → Client
interface ServerMessage {
    type: 'ai_message' | 'system_event' | 'phase_change' | 'interrupt' | 'typing_indicator';
    payload: {
        content?: string;
        participant_id?: string;
        participant_name?: string;
        phase?: string;
        event?: string;
        metadata?: Record<string, unknown>;
    };
    timestamp: string;          // ISO8601
    participant_id: string;
}
```

### 3.3 Message Type Definitions

| Type | Direction | Description |
|------|-----------|-------------|
| `user_message` | Client → Server | User sends a chat message |
| `user_action` | Client → Server | User performs an action (e.g., interrupt) |
| `ai_message` | Server → Client | AI participant sends a message |
| `system_event` | Server → Client | System notification (timer warning, user joined, etc.) |
| `phase_change` | Server → Client | Session transitions to a new phase |
| `interrupt` | Server → Client | AI candidate interrupts current flow |
| `typing_indicator` | Server → Client | AI candidate is "thinking" (simulated typing) |

### 3.4 Example Message Flow

```
Server: { type: "phase_change", payload: { phase: "opening", event: "Session started" } }
Server: { type: "system_event", payload: { content: "今天的讨论话题是..." } }
Server: { type: "ai_message", payload: { content: "我先抛砖引玉...", participant_name: "Sarah Chen" } }
Client: { type: "user_message", payload: { content: "我同意Sarah的观点，但我认为..." } }
Server: { type: "typing_indicator", payload: { participant_name: "张伟" } }
Server: { type: "ai_message", payload: { content: "我不太同意这个方向...", participant_name: "张伟" } }
Server: { type: "interrupt", payload: { content: "等一下，我想补充...", participant_name: "李明" } }
```

---

## 4. Error Handling

### 4.1 Error Response Format

```json
{
    "error": {
        "code": "SESSION_NOT_FOUND",
        "message": "The requested session does not exist",
        "details": {}
    }
}
```

### 4.2 Error Codes

| Code | HTTP Status | Description |
|------|------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions or subscription tier |
| `SESSION_NOT_FOUND` | 404 | Session does not exist |
| `SESSION_ALREADY_STARTED` | 409 | Attempted to start an already-active session |
| `RATE_LIMITED` | 429 | Too many requests |
| `LLM_UNAVAILABLE` | 503 | All LLM providers are down |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## 5. Rate Limiting

| Endpoint | Limit |
|----------|-------|
| `POST /api/sessions` | 5 per hour (free tier), 20 per hour (paid) |
| `POST /api/sessions/:id/start` | 1 per session |
| WebSocket messages | 30 per minute (user messages) |
| `GET` endpoints | 60 per minute |
