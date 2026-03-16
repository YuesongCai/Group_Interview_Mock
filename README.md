# GroupMock - AI群面模拟器

**AI-Powered Group Interview Simulator**

GroupMock enables job seekers to practice group interviews (群面) by pairing one real user with 3-5 AI candidates in a realistic leaderless group discussion (LGD) environment.

## What is GroupMock?

Group interviews are a standard hiring practice across consulting, FMCG, banking, and state-owned enterprises in China, yet candidates have no way to practice them. GroupMock solves this by creating AI-powered multi-participant group discussions with:

- **Dynamic AI Candidates** — 3-5 AI personas with distinct backgrounds, personalities, and communication styles, generated from your target job description
- **Realistic Group Dynamics** — Turn-taking, interruptions, debates, and consensus-building managed by an Orchestrator Agent
- **Comprehensive Evaluation** — Post-session AI performance report scoring leadership, logic, collaboration, communication, and innovation

## Architecture

```
User → Chat/Voice UI → API Gateway → Session Service → Agent Orchestration → LLM Gateway
                                                            │
                                          ┌─────────────────┼─────────────────┐
                                     Orchestrator    Participants (x5)    Evaluator
                                          │                 │                 │
                                     MiniMax M2.5     MiniMax M2.5     DeepSeek V3.2
```

## Core User Flow

1. Upload resume + paste job description
2. System generates a discussion topic and AI candidate profiles
3. Enter text-based (Phase 1) or voice-based (Phase 2) group discussion
4. 15-30 minute session with AI candidates actively debating
5. Receive structured performance evaluation with scores and actionable feedback

## Documentation

| Document | Description |
|----------|-------------|
| [Product Requirements (PRD)](docs/PRD.md) | Full product requirements, personas, features, competitive landscape, and roadmap |
| [Technical Architecture](docs/TECHNICAL_ARCHITECTURE.md) | System design, data models, agent orchestration, deployment architecture |
| [API Design](docs/API_DESIGN.md) | REST endpoints, WebSocket protocol, error handling |
| [Cost Model & Pricing](docs/COST_MODEL.md) | LLM cost analysis, pricing tiers, unit economics |

## Tech Stack

- **Frontend:** Next.js 14+ (React/TypeScript)
- **Backend:** Node.js (Express/Fastify) or Python (FastAPI)
- **LLM Providers:** MiniMax M2.5, DeepSeek V3.2, GLM-4-Flash/4.5 (via unified LLM Gateway)
- **Real-time:** WebSocket (Socket.io) for text; LiveKit for voice
- **Database:** PostgreSQL (Supabase) + Redis
- **Deployment:** Aliyun (China) + Vercel (global)

## Roadmap

| Phase | Timeline | Focus |
|-------|----------|-------|
| M0: Prototype | Week 1-2 | Interactive text-based demo |
| M1: Closed Alpha | Month 1 | Full text MVP with evaluation |
| M2: Public Beta | Month 2 | WeChat Mini Program, pay-per-use |
| M3: Voice Mode | Month 3-4 | STT + TTS integration |
| M4: Growth | Month 4-5 | Marketing, university partnerships |
| M5: Scale | Month 6+ | B2B, multiplayer, i18n |

## Pricing

- **Free Trial:** 1 session (text mode)
- **Single Session:** ¥3.9
- **Bundle:** ¥9.9 / 3 sessions
- **Monthly Pass:** ¥29.9/month (unlimited text + 5 voice)
- **Coach B2B:** ¥199/month

## License

Proprietary. All rights reserved.
