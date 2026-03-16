# GroupMock - Cost Model & Pricing Strategy

## 1. Model Pricing Landscape (March 2026)

The Chinese LLM market has experienced aggressive price competition through 2025, with prices dropping ~80% year-over-year. However, leading providers (Zhipu, MiniMax) have begun structural price increases in early 2026 as demand surges.

### 1.1 Model Comparison

| Model | Input (¥/M tokens) | Output (¥/M tokens) | Strengths | Use In GroupMock |
|-------|-------------------|---------------------|-----------|-----------------|
| MiniMax M2.5 | ¥0.22 | ¥0.87 | Strong roleplay; fast (100 TPS); 200K context; MIT license | Primary: Orchestrator + Participant Agents |
| MiniMax M2.5-Lightning | ¥0.22 | ¥1.74 | 2x speed (100 TPS steady); same quality as M2.5 | Fallback for latency-sensitive sessions |
| GLM-4-Flash | Free | Free | Completely free tier; decent quality for simple tasks | Fallback: Topic/Persona gen; low-cost sessions |
| GLM-4.5 | ¥0.80 | ¥2.00 | Strong agent/reasoning; 355B params; open source | Alternative Evaluator (cost-effective) |
| DeepSeek V3.2 | ¥1.89 | ¥2.76 | GPT-5 class reasoning; 128K context; cache discounts | Primary Evaluator (best reasoning quality) |
| DeepSeek V3 (legacy) | ¥0.10 | ¥0.20 | Ultra-cheap; good for simple orchestration | Budget fallback for non-critical agents |

> **Note:** Prices as of March 2026. Zhipu announced 30%+ price increases on GLM Coding Plan in Feb 2026; MiniMax M2.5 pricing is newly released. DeepSeek offers off-peak discounts (50-75% during 00:30-08:30 GMT+8). All prices in CNY.

---

## 2. Per-Session Cost Breakdown

**Assumptions:** 25-minute session, 4 AI candidates, ~80 messages, ~200 tokens/message. Total token budget: ~365K input + ~39K output per session.

### 2.1 Cost by Component & Model

| Component | Tokens (In/Out) | MiniMax M2.5 | DeepSeek V3.2 | GLM-4-Flash | Claude (reference) |
|-----------|-----------------|-------------|---------------|-------------|-------------------|
| Orchestrator | 120K / 8K | ¥0.034 | ¥0.249 | Free | ¥3.93 |
| Participants x4 | 200K / 24K | ¥0.065 | ¥0.444 | Free | ¥7.29 |
| Topic + Persona | 5K / 3K | ¥0.004 | ¥0.018 | Free | ¥0.29 |
| Evaluator | 40K / 4K | ¥0.012 | ¥0.087 | Free | ¥6.55 |
| **TOTAL** | **365K / 39K** | **¥0.42** | **¥0.80** | **Free*** | **¥18.06** |

> \*GLM-4-Flash free tier has rate limits that may not support concurrent multi-agent calls at scale.

**Recommended production mix:** MiniMax M2.5 for agents + DeepSeek V3.2 for evaluator = **~¥0.50/session total**.

---

## 3. Model Routing Strategy

### 3.1 Tier Definitions

| Tier | Target Users | Agent Models | Evaluator | Cost/Session |
|------|-------------|-------------|-----------|-------------|
| **Tier 1** (Production default) | Paid users | MiniMax M2.5 | DeepSeek V3.2 | ~¥0.50 |
| **Tier 2** (Budget/Scale) | Free tier | GLM-4-Flash (all) | GLM-4.5 | ~¥0.08 |
| **Tier 3** (Premium) | Premium paid | DeepSeek V3.2 (all) | DeepSeek V3.2 | ~¥0.80 |

### 3.2 Optimization Strategies

- **Model abstraction layer:** All providers use OpenAI-compatible API format, enabling single-line config changes to swap models
- **Context window optimization:** Sliding window for Participant Agents (keep last 20 messages + persona card, not full transcript). Reduces cumulative input tokens by ~40%
- **Off-peak scheduling:** Batch evaluation calls during DeepSeek off-peak hours (00:30-08:30 GMT+8) for 50-75% discount

---

## 4. Pricing Strategy: Pay-Per-Use for China Market

The China market strongly prefers pay-per-use over subscriptions. WeChat Pay and Alipay enable frictionless micro-transactions. Pricing designed for ¥3-10 impulse purchases.

### 4.1 Pricing Tiers

| Tier | Price | Includes | COGS | Gross Margin |
|------|-------|----------|------|-------------|
| 免费体验 (Free Trial) | ¥0 | 1 full text-mode session with basic evaluation report | ¥0.08 (GLM-4-Flash) | Acquisition cost |
| 单次购买 (Single) | ¥3.9/session | 1 full session (text mode) + detailed AI evaluation + replay | ¥0.50 | 87% |
| 多次包 (Bundle) | ¥9.9/3 sessions | 3 sessions + cross-session progress tracking + improvement trends | ¥1.50 | 85% |
| 界面升级 (Voice Add-on) | +¥2/session | Voice mode upgrade for any session (STT + TTS) | ¥0.30 (TTS/STT) | 85% |
| 月卡 (Monthly Pass) | ¥29.9/month | Unlimited text sessions + 5 voice sessions + advanced analytics | ~¥4.0 (est. 8 sessions) | 87% |
| 教练版 (Coach B2B) | ¥199/month | Unlimited sessions + client dashboard + branded reports + API access | Variable | Target >80% |

### 4.2 Key Pricing Principles

1. **¥3.9** single-session price is an impulse purchase threshold for Chinese college students
2. **Bundle pricing** (¥3.3/session) creates 15% savings incentive
3. **Monthly pass** targets power users preparing for specific interview cycles
4. **Voice is a premium add-on**, not bundled — keeps base price low
5. **Coach/B2B tier** captures institutional demand from career coaching services and universities

### 4.3 Payment Integration

- **Primary:** WeChat Pay + Alipay
- **iOS:** Apple IAP for iOS app
- **Distribution:** Consider 小程序 (Mini Program) native payment for lowest friction

---

## 5. Unit Economics Summary

| Metric | Single Purchase | Monthly Pass |
|--------|----------------|-------------|
| Revenue / session | ¥3.90 | ¥3.74 (at 8 sessions/mo) |
| COGS / session (LLM) | ¥0.50 | ¥0.50 |
| Gross margin / session | ¥3.40 (87%) | ¥3.24 (87%) |
| Server + infra / session | ~¥0.10 | ~¥0.10 |
| Net margin / session | ~¥3.30 (85%) | ~¥3.14 (84%) |
| **Break-even MAU** (at ¥20K/mo fixed costs) | ~6,100 sessions/mo | ~670 monthly pass users |

### 5.1 Cost Advantage

Compared to the original Claude-based architecture (COGS ¥18.06/session), the domestic model strategy reduces per-session costs by **97%**, transforming GroupMock from a margin-negative product into a highly profitable one. At ¥0.50 COGS, even the free trial costs less than a cup of coffee to deliver.
