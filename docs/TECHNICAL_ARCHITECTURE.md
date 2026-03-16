# GroupMock - Technical Architecture

## 1. System Architecture Overview

The system follows a modular microservices-inspired architecture, though the MVP can start as a well-structured monolith with clear module boundaries for future decomposition.

### 1.1 High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │  Next.js Web  │  │  WeChat Mini │  │  Mobile App (PWA/RN)  │  │
│  │   (React/TS)  │  │   Program    │  │                       │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘  │
└─────────┼─────────────────┼──────────────────────┼──────────────┘
          │                 │                      │
          ▼                 ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API Gateway                               │
│              (Auth, Rate Limiting, Routing)                       │
└─────────────────────────┬───────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌────────────────┐ ┌─────────────┐ ┌─────────────────┐
│ Session Service│ │ Auth Service│ │ Document Parser  │
│                │ │             │ │  (Resume + JD)   │
└───────┬────────┘ └─────────────┘ └─────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Agent Orchestration Layer                        │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│  │ Orchestrator  │  │ Participant     │  │ Evaluator Agent  │   │
│  │    Agent      │  │ Agents (x1-5)   │  │                  │   │
│  └──────┬───────┘  └────────┬────────┘  └────────┬─────────┘   │
└─────────┼──────────────────┼────────────────────┼──────────────┘
          │                  │                    │
          ▼                  ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                       LLM Gateway                                │
│         (Model Routing, Rate Limiting, Fallback)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  MiniMax M2.5 │  │ DeepSeek V3.2│  │  GLM-4-Flash/4.5    │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Supporting Services

```
┌──────────────────┐  ┌──────────────────┐  ┌────────────────────┐
│  Session Store   │  │ Evaluation Engine │  │ Notification Svc   │
│  (Redis + PG)    │  │                   │  │                    │
└──────────────────┘  └──────────────────┘  └────────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Next.js 14+ (React) with TypeScript | SSR for SEO, React ecosystem, easy PWA conversion, component reuse for future React Native |
| Backend | Node.js with Express/Fastify or Python FastAPI | Node for real-time WebSocket handling; Python alternative if team prefers ML ecosystem proximity |
| LLM Provider | MiniMax M2.5 (agents) + DeepSeek V3.2 (evaluator) + GLM-4-Flash (fallback) | 97% cost reduction vs Western models; strong Chinese-language roleplay; model-agnostic gateway enables hot-swap |
| Real-time Comms | WebSocket (Socket.io) for text; LiveKit/Daily.co for voice | WebSocket sufficient for MVP text chat; LiveKit provides WebRTC infra for voice phase |
| Database | PostgreSQL (Supabase) + Redis | PG for user data, session records, evaluations; Redis for real-time session state and pub/sub |
| File Storage | Supabase Storage or AWS S3 | Resume/JD uploads, session recordings (voice phase) |
| Auth | Supabase Auth or NextAuth.js | OAuth + email; easy integration with Supabase stack |
| STT (Phase 2) | Deepgram or OpenAI Whisper API | Deepgram for real-time streaming STT; Whisper for batch processing |
| TTS (Phase 2) | ElevenLabs or Fish Audio | ElevenLabs for English; Fish Audio for Chinese voice quality |
| Deployment | Vercel (frontend) + Aliyun ECS/FC (backend) or Railway | Aliyun for China compliance and low-latency domestic API calls; Vercel for global fallback |
| Monitoring | PostHog (analytics) + Sentry (errors) | Product analytics + error tracking; PostHog is open-source friendly |

---

## 3. Data Architecture

### 3.1 Core Data Models

#### User

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    name            VARCHAR(100) NOT NULL,
    resume_url      TEXT,
    subscription_tier VARCHAR(20) DEFAULT 'free',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Session

```sql
CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    jd_text         TEXT NOT NULL,
    topic           TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'created',
    phase           VARCHAR(20),
    difficulty      VARCHAR(10) DEFAULT 'medium',
    started_at      TIMESTAMP WITH TIME ZONE,
    ended_at        TIMESTAMP WITH TIME ZONE,
    config          JSONB DEFAULT '{}',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Status values: created, parsing, generating, ready, opening, discussion, summary, evaluating, completed, paused, abandoned
```

#### Participant

```sql
CREATE TABLE participants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID REFERENCES sessions(id) ON DELETE CASCADE,
    type            VARCHAR(10) NOT NULL CHECK (type IN ('human', 'ai')),
    display_name    VARCHAR(100) NOT NULL,
    persona_card    JSONB,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Message

```sql
CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID REFERENCES sessions(id) ON DELETE CASCADE,
    participant_id  UUID REFERENCES participants(id),
    content         TEXT NOT NULL,
    phase           VARCHAR(20),
    is_interrupt    BOOLEAN DEFAULT FALSE,
    timestamp       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_messages_session ON messages(session_id, timestamp);
```

#### Evaluation

```sql
CREATE TABLE evaluations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID REFERENCES sessions(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    scores          JSONB NOT NULL,
    evidence        JSONB NOT NULL,
    summary         TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### PersonaTemplate

```sql
CREATE TABLE persona_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    archetype       VARCHAR(50) NOT NULL,
    name_pool       JSONB NOT NULL,
    background_templates JSONB NOT NULL,
    style_config    JSONB NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 3.2 Session State Machine

```
CREATED → PARSING → GENERATING → READY → OPENING → DISCUSSION → SUMMARY → EVALUATING → COMPLETED
                                    │                                          ▲
                                    ▼                                          │
                                  PAUSED ──────────────────────────────────────┘
                                    │
                                    ▼
                                 ABANDONED
```

**Edge cases:**
- User can **PAUSE** mid-session (AI candidates freeze)
- User can **ABANDON** (session saved as incomplete)
- Network disconnect triggers auto-pause with 5-minute reconnection window

---

## 4. Agent Orchestration: Detailed Flow

### 4.1 Message Processing Pipeline

When the user sends a message, the following pipeline executes:

```
User Message (WebSocket)
    │
    ▼
┌──────────────────────────────────┐
│  1. Append to shared transcript  │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  2. Orchestrator decides:        │
│     a. Which AI(s) respond       │
│     b. Response order            │
│     c. Simulated think time      │
│     d. Interrupt flags           │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  3. Participant Agent(s) receive:│
│     - Persona card               │
│     - Full transcript            │
│     - Orchestrator instruction   │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  4. Response validation:         │
│     - Length check                │
│     - Relevance check            │
│     - Persona consistency check  │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  5. Stream to client via WS      │
│     (with metadata: participant  │
│      ID, phase, is_interrupt)    │
└──────────────────────────────────┘
```

### 4.2 Concurrency & Rate Limiting

Multiple AI agents need to "think" in parallel. The system manages this via:

- **Parallel LLM calls:** Use `Promise.all()` to fire multiple Participant Agent requests simultaneously when the Orchestrator designates multiple responders
- **Response queue:** Even with parallel generation, responses are delivered sequentially with staggered timing to simulate natural conversation flow
- **Token budget per turn:** Each Participant Agent response is capped at ~150 tokens (text mode) to maintain fast-paced group dynamics
- **Rate limiting:** Domestic model APIs have varying rate limits; the LLM Gateway handles per-provider throttling, exponential backoff, and automatic fallback to secondary models

### 4.3 Context Window Optimization

- **Sliding window** for Participant Agents: keep last 20 messages + persona card, not full transcript
- Reduces cumulative input tokens by ~40%
- Full transcript preserved in database for Evaluator Agent post-session

---

## 5. LLM Gateway Design

The LLM Gateway abstracts model selection, enabling per-agent model routing and hot-swap between providers without code changes.

### 5.1 Model Routing Strategy

```
┌─────────────────────────────────────────────────┐
│                 LLM Gateway                      │
│                                                  │
│  Request ──► Route by agent type                 │
│              │                                   │
│              ├─ Orchestrator ──► MiniMax M2.5     │
│              ├─ Participant  ──► MiniMax M2.5     │
│              ├─ Topic Gen    ──► GLM-4-Flash      │
│              ├─ Persona Gen  ──► GLM-4-Flash      │
│              └─ Evaluator    ──► DeepSeek V3.2    │
│                                                  │
│  Fallback chain per provider:                    │
│  MiniMax M2.5 → DeepSeek V3 → GLM-4-Flash       │
│                                                  │
│  All providers use OpenAI-compatible API format  │
└─────────────────────────────────────────────────┘
```

### 5.2 Tier-Based Routing

| Tier | Use Case | Orchestrator + Participants | Evaluator | Est. Cost/Session |
|------|----------|---------------------------|-----------|-------------------|
| Tier 1 (Production) | Default paid sessions | MiniMax M2.5 | DeepSeek V3.2 | ~¥0.50 |
| Tier 2 (Budget) | Free tier users | GLM-4-Flash | GLM-4.5 | ~¥0.08 |
| Tier 3 (Premium) | Premium paid users | DeepSeek V3.2 | DeepSeek V3.2 | ~¥0.80 |

### 5.3 Off-Peak Optimization

Batch evaluation calls during DeepSeek off-peak hours (00:30-08:30 GMT+8) for 50-75% discount on evaluator costs.

---

## 6. Real-Time Communication

### 6.1 WebSocket Protocol

WebSocket message protocol uses a typed envelope:

```typescript
interface WebSocketMessage {
    type: 'user_message' | 'ai_message' | 'system_event' | 'phase_change' | 'interrupt';
    payload: {
        content?: string;
        participant_id?: string;
        phase?: string;
        metadata?: Record<string, unknown>;
    };
    timestamp: string; // ISO8601
    participant_id: string;
}
```

### 6.2 Connection Management

- WebSocket connection established when user enters session room
- Heartbeat ping every 30 seconds to detect disconnections
- Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s)
- Session state preserved in Redis for seamless recovery on reconnect
- 5-minute reconnection window before session is auto-paused

### 6.3 Voice Mode (Phase 2)

```
User Voice Input
    │
    ▼
┌───────────────────┐     ┌────────────────┐     ┌──────────────┐
│  Voice Activity   │────►│  STT Service   │────►│  Text to     │
│  Detection (VAD)  │     │  (Deepgram)    │     │  Orchestrator│
└───────────────────┘     └────────────────┘     └──────────────┘
                                                        │
                                                        ▼
                                                 ┌──────────────┐
                                                 │  AI Response  │
                                                 │  (Text)       │
                                                 └──────┬───────┘
                                                        │
                                                        ▼
                                                 ┌──────────────┐
                                                 │  TTS Service  │
                                                 │  (Fish Audio) │
                                                 └──────┬───────┘
                                                        │
                                                        ▼
                                                 ┌──────────────┐
                                                 │  Audio Output │
                                                 │  to User      │
                                                 └──────────────┘
```

---

## 7. Deployment Architecture

### 7.1 Production Environment

```
China Region (Primary):
├── Aliyun ECS/FC ── Backend API + Agent Orchestration
├── Aliyun RDS    ── PostgreSQL
├── Aliyun Redis  ── Session state + pub/sub
└── Aliyun OSS    ── File storage (resumes, recordings)

Global Fallback:
├── Vercel        ── Frontend (Next.js)
└── Supabase      ── Auth + Database (development/staging)
```

### 7.2 Monitoring & Observability

- **PostHog:** Product analytics, user behavior tracking, feature flags
- **Sentry:** Error tracking, performance monitoring
- **Custom dashboards:** LLM cost tracking, latency metrics, session completion funnel
