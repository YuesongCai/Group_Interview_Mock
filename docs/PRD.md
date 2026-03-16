# GroupMock - Product Requirements Document

**AI-Powered Group Interview Simulator / AI群面模拟器**

Version 2.0 (China Market Edition) | March 2026 | CONFIDENTIAL

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [User Personas & Scenarios](#2-user-personas--scenarios)
3. [Product Requirements](#3-product-requirements)
4. [AI Agent Architecture](#4-ai-agent-architecture)
5. [Evaluation Engine](#5-evaluation-engine)
6. [Risks & Mitigations](#6-risks--mitigations)
7. [Competitive Landscape](#7-competitive-landscape)
8. [Roadmap & Milestones](#8-roadmap--milestones)
9. [Open Questions](#9-open-questions)
10. [Appendix](#10-appendix)

---

## 1. Executive Summary

GroupMock is an AI-powered group interview (群面) simulator that enables job seekers to practice leaderless group discussions (LGD) and group case interviews in a realistic multi-participant environment. The platform pairs one real human user with multiple AI sub-agents that act as fellow interview candidates, creating an authentic group interview experience with real-time interaction, turn-taking dynamics, and comprehensive AI-powered performance evaluation.

### 1.1 Problem Statement

Group interviews are among the most anxiety-inducing stages of the hiring process, yet candidates have almost no way to practice them effectively. Unlike 1-on-1 mock interviews (which can be done with a friend or existing tools like Final Round AI), group interviews require multiple participants with diverse perspectives, creating a coordination problem that current solutions cannot address.

### 1.2 Solution Overview

- **One real human user** participates alongside 3-5 AI-generated candidates, each with distinct backgrounds, personalities, and communication styles
- **AI candidates are dynamically generated** based on the uploaded JD and calibrated to the role's seniority level, creating realistic competitive pressure
- **A central Orchestrator Agent** manages discussion flow, enforces timing, simulates interruptions and turn-taking dynamics
- **Post-session AI Evaluator** provides structured feedback across leadership, logic, collaboration, time management, and innovation dimensions

### 1.3 Key Metrics (North Star)

| Metric | Definition | Target (6mo) |
|--------|-----------|---------------|
| Session Completion Rate | % of users who finish a full 群面 session | >75% |
| Paid Conversion Rate | % of free-trial users who make first purchase | >8% |
| Repeat Purchase (D30) | % of paying users who purchase again within 30 days | >35% |
| Avg Sessions / User / Month | Monthly engagement depth (paying users) | >4 |
| Revenue per MAU (ARPMAU) | Average monthly revenue per active user | >¥8 |
| NPS | Net Promoter Score from post-session survey | >50 |

---

## 2. User Personas & Scenarios

### 2.1 Primary Persona: Campus Recruit

- **Profile:** Final-year university student applying to consulting, banking, FMCG, or tech companies that use group interviews as a screening stage
- **Pain Point:** Has never experienced a real group interview; doesn't know how to navigate group dynamics, when to speak up vs. listen, or how to structure arguments in a competitive setting
- **Goal:** Build confidence and develop a repeatable strategy for group discussions before the actual interview

### 2.2 Secondary Persona: Career Switcher

- **Profile:** Mid-career professional (3-8 YOE) preparing for assessment center group exercises at target companies
- **Pain Point:** Experienced in 1-on-1 settings but unfamiliar with the group dynamic; worried about being overshadowed or perceived as uncooperative
- **Goal:** Practice balancing assertiveness with collaboration in a safe environment

### 2.3 Tertiary Persona: Interview Coach

- **Profile:** Career coaching professional who wants to use the platform as a training tool for clients
- **Pain Point:** Currently relies on organizing live group mock sessions with 5-6 real people, which is logistically painful and expensive
- **Goal:** Assign clients group interview practice sessions and review AI-generated performance reports

---

## 3. Product Requirements

### 3.1 Core User Flow

1. User uploads resume (PDF/text) and pastes or uploads JD
2. System parses both documents using LLM, extracts role requirements, seniority level, and key competencies
3. System generates: (a) a group discussion topic/case appropriate to the role, (b) 3-5 AI candidate profiles with distinct backgrounds and personality traits
4. User enters a chat-based (Phase 1) or voice-based (Phase 2) group discussion room
5. Discussion runs for 15-30 minutes with AI candidates actively participating, debating, building on ideas, and occasionally interrupting
6. Post-session: AI Evaluator generates a comprehensive performance report with dimension-level scores, behavioral evidence, and improvement suggestions

### 3.2 Feature Breakdown by Phase

#### Phase 1: Text-Based MVP (Month 1-2)

| Feature | Priority | Description |
|---------|----------|-------------|
| Resume + JD Parser | P0 | Upload resume (PDF) and JD; extract structured data via LLM for topic and persona generation |
| Topic Generator | P0 | Generate role-appropriate group discussion topics (case study, open-ended debate, prioritization exercise) |
| AI Candidate Generator | P0 | Create 3-5 distinct AI personas with name, background summary, personality type (assertive/analytical/mediator/quiet), and communication style |
| Chat Room UI | P0 | Multi-participant chat interface showing all participants with distinct avatars, typing indicators, and message threading |
| Orchestrator Agent | P0 | Central controller managing turn order, pacing, AI response timing (simulated think time), and discussion phases (intro -> discussion -> summary) |
| Interrupt/Compete Mechanic | P1 | AI candidates can "cut in" with rebuttals or build-ons; user can also interrupt mid-flow |
| Timer & Phase Management | P0 | Visible countdown; automatic phase transitions; time warnings |
| AI Evaluator | P0 | Post-session structured report: scores on 5 dimensions, behavioral evidence with timestamps, actionable improvement tips |
| Session History | P1 | Save and replay past sessions; track score trends over time |

#### Phase 2: Voice Integration (Month 3-4)

| Feature | Priority | Description |
|---------|----------|-------------|
| Speech-to-Text (STT) | P0 | Real-time transcription of user's voice input using Whisper/Deepgram |
| Text-to-Speech (TTS) | P0 | Each AI candidate has a distinct voice persona via ElevenLabs/Fish Audio |
| Voice Activity Detection | P0 | Detect when user is speaking; manage overlap/interruption with AI voices |
| Real-time Audio Mixing | P1 | Simulate "talking over each other" moments for realism |
| Voice Emotion Analysis | P2 | Analyze tone, confidence, and pace in user's speech for richer evaluation |

#### Phase 3: Platform & Distribution (Month 5-6)

| Feature | Priority | Description |
|---------|----------|-------------|
| User Authentication | P0 | Email/OAuth sign-up; user profile with interview history |
| Subscription Model | P0 | Free tier (2 sessions/month) + Pro tier (unlimited + voice + advanced analytics) |
| Mobile App (PWA/RN) | P1 | Cross-platform mobile experience; offline report viewing |
| Coach Dashboard | P2 | B2B portal for coaches to assign sessions and review client reports |
| Multiplayer Mode | P2 | Multiple real humans + AI candidates in same session |
| Internationalization | P2 | Support for Chinese (群面), Japanese, Korean interview formats |

---

## 4. AI Agent Architecture

The system employs a multi-agent architecture with clear separation of concerns. The model layer is abstracted behind a unified LLM gateway, enabling hot-swapping between domestic model providers (MiniMax, Zhipu GLM, DeepSeek) based on cost, latency, and quality benchmarks. All agents use structured system prompts and shared context.

### 4.1 Agent Topology

| Agent | Role | Model (Primary / Fallback) | Context Window Usage |
|-------|------|---------------------------|---------------------|
| Orchestrator | Session conductor: manages phases, turn allocation, pacing, and interrupt arbitration | MiniMax M2.5 / GLM-4-Flash | Full session state + discussion rules + timing config |
| Participant Agent x1-5 | AI interview candidates with distinct personas | MiniMax M2.5 / GLM-4-Flash | Individual persona card + shared discussion transcript + role-specific knowledge |
| Topic Generator | Creates discussion prompts from JD + role analysis | GLM-4-Flash (low cost) | Parsed JD + resume summary + topic template library |
| Persona Generator | Creates diverse, realistic candidate profiles | GLM-4-Flash (low cost) | JD requirements + personality archetype library + diversity constraints |
| Evaluator | Post-session performance analysis (needs strong reasoning) | DeepSeek V3.2 / GLM-4.5 | Full transcript + scoring rubric + behavioral indicator library |

### 4.2 Orchestrator Agent - Core Logic

The Orchestrator is the system's brain. It does NOT participate in the discussion; it controls who speaks, when, and manages the conversational dynamics that make group interviews feel real.

#### 4.2.1 Turn Management

- **Round-robin base:** Each participant gets a fair baseline of speaking turns
- **Dynamic interrupts:** AI candidates have an "aggressiveness" parameter (0.0-1.0) that determines their probability of interrupting or jumping in
- **User priority:** The system slightly favors giving the user space to speak (adjustable difficulty)
- **Silence detection:** If the user doesn't respond within a configurable window (e.g., 8 seconds in voice mode), the Orchestrator prompts an AI candidate to fill the gap

#### 4.2.2 Phase Structure

| Phase | Duration | Behavior |
|-------|----------|----------|
| Opening | 2-3 min | Orchestrator presents the topic; each participant gives a brief initial take (round-robin) |
| Free Discussion | 10-20 min | Open debate; interrupts enabled; Orchestrator injects follow-ups or redirections if discussion stalls or goes off-track |
| Summary | 3-5 min | Each participant summarizes their position; Orchestrator enforces time limits per person |
| Evaluation | Post-session | Evaluator Agent processes full transcript and generates report |

#### 4.2.3 Orchestrator System Prompt Structure

The Orchestrator receives a structured system prompt containing:

1. Session configuration (topic, duration, participant count, difficulty level)
2. All participant persona cards (for context on who might say what)
3. Phase transition rules and timing
4. Interrupt arbitration rules (who gets priority when multiple agents want to speak)
5. Stall detection heuristics (when to inject a new angle or redirect)

### 4.3 Participant Agent Design

#### 4.3.1 Persona Card Schema

Each AI candidate is defined by a structured persona card that drives their behavior throughout the session:

| Field | Example | Purpose |
|-------|---------|---------|
| `name` | Sarah Chen | Display identity |
| `background` | 3 years at McKinsey, Wharton MBA | Shapes argument style and references |
| `personality_type` | assertive_analytical | Controls communication patterns |
| `aggressiveness` | 0.7 | Probability of interrupting (0.0 = passive, 1.0 = dominant) |
| `knowledge_depth` | strong on strategy, weak on tech | Creates realistic knowledge gaps |
| `speaking_style` | structured, uses frameworks, occasionally name-drops | Makes each candidate feel distinct |
| `bias_tendency` | over-indexes on profitability metrics | Creates productive disagreement |

#### 4.3.2 Behavioral Diversity

The system ensures each session has a balanced mix of personality archetypes to simulate realistic group dynamics:

- **The Assertive Leader:** Speaks first, proposes frameworks, tries to steer the group. Aggressiveness 0.7-0.9.
- **The Analytical Thinker:** Waits, then provides data-driven or structured arguments. Aggressiveness 0.3-0.5.
- **The Collaborative Mediator:** Builds on others' points, resolves conflicts, synthesizes. Aggressiveness 0.4-0.6.
- **The Quiet Observer:** Speaks infrequently but with high-impact points. Aggressiveness 0.1-0.3.
- **The Devil's Advocate:** Challenges every proposal, pushes back on consensus. Aggressiveness 0.6-0.8.

The Persona Generator ensures at least 3 distinct archetypes per session and that AI candidates have different backgrounds from the user.

---

## 5. Evaluation Engine

### 5.1 Scoring Framework

| Dimension | Weight | Behavioral Indicators |
|-----------|--------|----------------------|
| Leadership & Initiative | 25% | Proposing frameworks; steering discussion; time management; taking charge when discussion stalls |
| Logical Reasoning | 25% | Argument structure; evidence usage; cause-effect clarity; handling counterarguments |
| Collaboration & EQ | 20% | Building on others' ideas; acknowledging contributions; resolving disagreements constructively |
| Communication Clarity | 15% | Conciseness; structured delivery; appropriate language; active listening signals |
| Innovation & Insight | 15% | Novel perspectives; creative solutions; connecting disparate ideas; challenging assumptions productively |

### 5.2 Evaluation Output Format

The Evaluator Agent (DeepSeek V3.2 or GLM-4.5, chosen for strong reasoning at low cost) receives the full transcript and scoring rubric, and generates:

- **Overall score** (0-100) with percentile estimate relative to historical sessions
- **Per-dimension scores** with specific behavioral evidence (quoted moments from transcript with timestamps)
- **Strengths summary:** top 2-3 things the user did well, with concrete examples
- **Improvement areas:** top 2-3 weaknesses, each with a specific, actionable suggestion
- **Comparison narrative:** How the user performed relative to AI candidates (who "won" the discussion and why)
- **Replay highlights:** Key moments flagged for user review (strongest argument, missed opportunity, best collaboration moment)

---

## 6. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| AI candidates feel robotic / repetitive | High | Invest heavily in persona diversity; use temperature variation; A/B test prompt templates; MiniMax M2.5 shows strong roleplay in benchmarks; collect user feedback per session |
| LLM latency breaks conversational flow | High | Stream responses; MiniMax M2.5-Lightning offers 100 TPS; use simulated thinking indicators; batch parallel agent calls |
| Domestic model price increases | Medium | LLM Gateway enables zero-downtime model swap; Zhipu already raised prices 30%+ in Feb 2026; maintain at least 2 active provider integrations at all times |
| Chinese roleplay quality varies by model | Medium | Run blind A/B tests across MiniMax vs GLM vs DeepSeek for persona adherence; build internal eval suite with native Chinese speakers; fine-tune on group interview transcripts if quality insufficient |
| User speaks too little (AI dominates) | Medium | Orchestrator explicitly creates space for user; difficulty slider controls AI aggressiveness; post-session feedback identifies this pattern |
| Evaluation feels generic / unhelpful | Medium | Use DeepSeek V3.2 (strongest reasoning) for evaluation; require specific behavioral evidence from transcript; benchmark against real assessment center rubrics |
| Voice mode latency (Phase 2) | Medium | Use Fish Audio for Chinese TTS; streaming STT via Deepgram; local VAD; consider hybrid text+voice mode as fallback |
| Competitive response from incumbents | Low | First-mover in group interview niche; build proprietary evaluation dataset and topic bank; coach network as moat; WeChat Mini Program for distribution lock-in |
| Model provider API outages | Low | Multi-provider fallback chain: MiniMax -> DeepSeek -> GLM-4-Flash (free); session state preserved in Redis for seamless recovery |

---

## 7. Competitive Landscape

| Competitor | Type | Strengths | GroupMock Differentiation |
|-----------|------|-----------|--------------------------|
| Final Round AI | 1-on-1 mock interview (US) | Established brand; real-time voice; resume tailoring | Group dynamics are a fundamentally different product; no Chinese market presence |
| 牛客/牵牛的牵 (Nowcoder) | Interview Q&A platform (CN) | Massive user base; employer partnerships; question banks | No interactive simulation; no group interview mode; content-only, not practice-based |
| 超级简历 / 猫哥的AI面试 | AI 1-on-1 mock (CN) | Chinese-language; affordable; growing user base | No multi-participant dynamics; no group interview simulation; limited evaluation depth |
| ChatGPT / 豆包 / Kimi (raw LLM) | General LLM | Flexible; free/cheap; growing Chinese ecosystem | No multi-agent orchestration; no evaluation framework; no group interview UX |
| Real group mock sessions (线下模拟群面) | Human-organized | Authenticity; social networking value | Logistically hard to scale; expensive; GroupMock available 24/7 at ¥3.9/session |
| offerland.ai | AI interview prep (CN) | Chinese market presence; AI-powered | Text-based; no group interview mode; limited to 1-on-1 scenarios |

**GroupMock's structural advantage:** group interviews (群面) are a coordination-intensive experience that AI can uniquely democratize. The product creates a new category rather than competing head-to-head with 1-on-1 mock interview tools.

---

## 8. Roadmap & Milestones

| Milestone | Timeline | Deliverable | Success Criteria |
|-----------|----------|-------------|-----------------|
| M0: Prototype | Week 1-2 | Interactive text-based demo (React artifact or H5 page) | Complete one full 群面 session end-to-end in Chinese |
| M1: Closed Alpha | Month 1 | Full text MVP with WeChat login, session management, evaluation | 20 beta users complete 3+ sessions each; NPS >30 |
| M2: Public Beta | Month 2 | WeChat Mini Program or H5; pay-per-use via WeChat Pay; session history | 500 users; >60% session completion; first paid sessions |
| M3: Voice Mode | Month 3-4 | Fish Audio TTS + Deepgram STT; voice-based 群面 | Voice sessions feel natural; <2s E2E latency; voice add-on conversion >15% |
| M4: Growth | Month 4-5 | 小红书/抖音 content marketing; university partnerships; referral system | 5,000 MAU; monthly pass conversion >5%; positive unit economics |
| M5: Scale | Month 6+ | Coach B2B portal; multiplayer mode; industry-specific topic banks; iOS/Android app | 10,000+ MAU; B2B revenue stream; expansion to Japan/Korea markets |

---

## 9. Open Questions

> Several questions from V0.9 have been resolved. Chinese-first market strategy is confirmed. Pay-per-use pricing is confirmed. Domestic models (MiniMax/DeepSeek/GLM) replace Western models.

### Remaining Open Items

1. **Voice-first vs. text-first:** Should Phase 2 voice be the "real" product, with text as a fallback? Voice add-on pricing (¥2/session) suggests it's a premium feature, not core.
2. **Number of AI candidates:** 3 is cheaper and faster; 5 is more realistic. Recommend 3 for free tier, 4-5 for paid sessions. User-configurable?
3. **Difficulty levels:** How granular? (Easy/Medium/Hard) or continuous slider? What parameters does difficulty control? Recommend 3 levels for MVP.
4. **Platform strategy:** WeChat Mini Program (微信小程序) for maximum distribution in China, or H5 web app first? Mini Program has payment friction advantages but development constraints.
5. **IP / defensibility:** What proprietary data assets can we build? Priority candidates: evaluation dataset annotated by real HR professionals, industry-specific topic bank (consulting/banking/FMCG/tech), persona library calibrated by archetype distribution.
6. **Model quality validation:** Need blind A/B testing across MiniMax M2.5 vs GLM-4.5 vs DeepSeek V3.2 for Chinese 群面 roleplay quality. Which model produces the most natural-sounding, persona-consistent Chinese dialogue?
7. **Content moderation:** How to handle cases where AI candidates generate inappropriate content during roleplay? Implement output filtering layer or rely on model-level safety? Both?
8. **Fine-tuning opportunity:** If roleplay quality is insufficient from base models, is it worth fine-tuning GLM-4-Flash (free fine-tuning via Zhipu platform) on curated 群面 transcripts?

---

## 10. Appendix

### 10.1 Sample System Prompts

#### Orchestrator Agent (Simplified)

```
You are the moderator of a group interview simulation. You do NOT participate in
the discussion. Your job is to:
(1) Announce the topic and set expectations
(2) Manage turn-taking among participants
(3) Ensure the discussion stays on-topic and progresses
(4) Create natural opportunities for each participant to contribute
(5) Transition between phases (Opening → Discussion → Summary) at appropriate times

Current session config: [topic], [participants], [duration], [difficulty].
```

#### Participant Agent (Simplified)

```
You are [name], a candidate in a group interview. Your background: [background].
Your personality: [personality_type]. Your speaking style: [speaking_style].
You tend to [bias_tendency]. Aggressiveness level: [aggressiveness]/1.0.

Respond naturally as this character would in a group discussion. Keep responses
concise (2-4 sentences). You may agree, disagree, build on others' points, or
introduce new angles. Stay in character.
```

#### Evaluator Agent (Simplified)

```
You are an expert group interview evaluator. Analyze the following transcript of
a group discussion. The HUMAN participant is the user being evaluated.

Score them on:
- Leadership & Initiative (25%)
- Logical Reasoning (25%)
- Collaboration & EQ (20%)
- Communication Clarity (15%)
- Innovation & Insight (15%)

For each dimension, provide: a score (0-100), 2-3 specific behavioral evidence
points with timestamps, and one actionable improvement suggestion.

End with an overall assessment and comparison to AI candidates.
```

### 10.2 Glossary

| Term | Definition |
|------|-----------|
| 群面 (Qún Miàn) | Group interview; a common hiring practice in China, consulting, and FMCG where multiple candidates discuss a topic simultaneously |
| LGD (Leaderless Group Discussion) | A group interview format where no leader is assigned; candidates must self-organize |
| Assessment Center | A multi-round evaluation process used by large employers, often including group exercises |
| Orchestrator Agent | The AI system component that controls session flow and turn-taking (does not participate in discussion) |
| Participant Agent | An AI system component that acts as a fellow interview candidate with a distinct persona |
| Persona Card | A structured data object defining an AI candidate's identity, personality, and behavioral parameters |
