# Anthropic Multi-Agent, Adversarial & Long-Running Research

> Research survey compiled from Anthropic's published engineering blogs, research papers,
> API documentation, and third-party analysis. Focused on patterns applicable to
> autonomous agent systems.

---

## 1. Overview of Anthropic's Agent Research Portfolio

Anthropic's agent research spans five interconnected pillars:

| Pillar | Key Artifacts |
|--------|--------------|
| **Agent Architecture** | "Building Effective Agents" guide, Claude Agent SDK |
| **Multi-Agent Systems** | "How We Built Our Multi-Agent Research System" (engineering blog) |
| **Long-Running Harnesses** | "Effective Harnesses for Long-Running Agents", three-agent framework |
| **Safety & Alignment** | Constitutional AI, RLHF/RLAIF, Frontier Red Team |
| **Tool & Computer Use** | Computer Use beta, structured tool calling, MCP protocol |

Anthropic's overarching thesis: **start simple, add complexity only when gains outweigh cost**. Most "agentic" patterns can be implemented with direct LLM API calls and small amounts of orchestration code. Frameworks should be adopted only when manual orchestration becomes unmanageable.

---

## 2. Multi-Agent Architecture Patterns

### 2.1 Agents vs. Workflows

Anthropic draws a sharp distinction:
- **Workflows**: LLMs in predefined code paths — predictable, good for structured tasks.
- **Agents**: LLMs dynamically choose tools and actions — flexible, suited for open-ended problems.

### 2.2 Orchestrator–Subagent Pattern

The primary multi-agent pattern Anthropic uses internally and recommends:

1. **Orchestrator** decomposes a large task into discrete subtasks.
2. **Subagents** (workers) execute subtasks in parallel, each in an isolated context window.
3. Subagents return **distilled summaries** — not raw output — back to the orchestrator.
4. Orchestrator **synthesizes** results into a final coherent output.

Key design principles:
- **Context isolation**: Each subagent's context is independent — no cross-contamination.
- **Specialization**: Subagents can use different tools, prompts, or even model tiers.
- **Dynamic delegation**: Orchestrator can adjust strategy based on intermediate results.
- **Token economy**: Multi-agent runs cost 4–15× single-agent; reserve for high-complexity tasks.

### 2.3 Agent Teams (Claude Code)

Claude Code's "Agent Teams" feature enables direct agent-to-agent communication:
- Agents claim work from shared task lists.
- Parallel exploration of competing hypotheses (e.g., debugging).
- Breadth-first research where multiple leads are independently investigated.

### 2.4 Three-Agent Harness (Planning / Generation / Evaluation)

Anthropic's most mature architecture for long-running work:

```
┌──────────┐     ┌──────────────┐     ┌───────────┐
│ Planner  │ ──> │  Generator   │ ──> │ Evaluator │
│ (scopes  │     │ (executes    │     │ (grades   │
│  tasks)  │     │  increments) │     │  output)  │
└──────────┘     └──────────────┘     └───────────┘
      ▲                                     │
      └─────── iteration loop ──────────────┘
```

The evaluator uses explicit rubrics (design, originality, craft, functionality) and loops back to the planner until standards are met. This separation of execution from assessment is critical for maintaining quality over many iterations.

---

## 3. Long-Running Task Management

### 3.1 The Core Problem: Context Rot

Fixed context windows mean that over long sessions, crucial project history "drops out." Naive approaches (context compaction, ever-growing prompts) lead to incoherence, redundancy, or premature task termination.

### 3.2 Anthropic's Solution: Structured Handoff Artifacts

Inspired by human shift-work handovers:

1. **Initializer agent** sets up structured environment (repos, feature lists, tracking files).
2. **Coding agent** makes incremental, documented progress.
3. Explicit **handoff artifacts** (progress files, init scripts, feature specs) transfer state.
4. Each cycle acts as a **context reset** — only essential state carries forward.

### 3.3 Context Engineering (Beyond Prompt Engineering)

Anthropic frames the discipline as "context engineering":
- Dynamically structuring, resetting, and managing working state over time.
- Not just writing better prompts — designing the **information flow** across agent turns.
- Iterative refinement cycles with well-defined checkpoints replace monolithic sessions.

### 3.4 Results

Multi-hour sessions building production web apps, game engines, and audio workstations. Structured harnesses dramatically outperform single-agent loops or compaction-based approaches.

---

## 4. Adversarial Robustness & Safety

### 4.1 Prompt Injection in Multi-Agent Systems

The "Prompt Infection" paper (OpenReview) demonstrated that prompt injection in multi-agent systems can propagate like a virus — one compromised agent's output infects downstream agents through shared state or communication channels. Traditional input sanitization is insufficient.

### 4.2 Anthropic's Defense Strategy

| Defense Layer | Mechanism |
|--------------|-----------|
| **Benchmarking** | Published prompt injection failure rates per operational surface (browser, code, etc.) |
| **Classifiers** | Dedicated prompt injection detection models |
| **Least privilege** | Minimize agent permissions — restrict blast radius |
| **LLM Tagging** | Cryptographic tagging of agent outputs to track origin and detect tampering |
| **Adversarial training** | Gradient-based adversarial prompt generation → fine-tuning for robustness |
| **Container isolation** | Run agents in sandboxed environments |

### 4.3 Constitutional AI (CAI)

Anthropic's signature alignment approach:
- A written constitution of 20–50 natural-language principles.
- Model self-critiques and revises outputs against these principles (RLAIF).
- Reduces harmful outputs by ~95% vs. baseline at 10× lower labeling cost than RLHF.
- Particularly suited for autonomous agents encountering novel edge cases.

### 4.4 Red-Teaming

Anthropic's **Frontier Red Team** systematically stress-tests models:
- Probes for unsafe behaviors, deceptive reasoning, and power-seeking tendencies.
- Collaborates with external domain experts (biosecurity, cybersecurity).
- Results inform both technical improvements and public system cards.

### 4.5 Multi-Agent Debate for Safety

Heterogeneous multi-agent debate assembles a "mini-parliament" of sub-agents arguing from distinct perspectives (utilitarian, rights-based, adversarial). Empirical findings show this reduces catastrophic errors and increases transparency. The RedDebate framework automates multi-round debates with memory modules for continuous safety improvement.

---

## 5. Extended Thinking & Tool Use

### 5.1 Extended Thinking

Claude's explicit chain-of-thought mode (introduced in Claude 3.7, matured in Claude 4):
- Visible "thinking" blocks show step-by-step reasoning before the final answer.
- Configurable token budget for reasoning depth.
- 96%+ accuracy on complex physics problems; best-in-class code synthesis.
- Critical for safety: exposes when internal reasoning diverges from outputs.

### 5.2 Computer Use

Claude's desktop automation capability (public beta):
- Screenshot → analyze → mouse/keyboard action loop.
- 72%+ on OSWorld desktop benchmark (up from 15% in late 2024).
- Security: runs in isolated VMs/containers; prompt injection classifiers for web content.

### 5.3 Tool Use & MCP

Structured tool calling with explicit schemas, permission controls, and audit logging. The Model Context Protocol (MCP) standardizes how agents discover and invoke tools across environments.

---

## 6. Key Publications & Posts

| Title | Type | Key Contribution |
|-------|------|-----------------|
| "Building Effective Agents" | Blog/Guide | Canonical agent architecture patterns |
| "How We Built Our Multi-Agent Research System" | Engineering blog | Orchestrator-subagent implementation details |
| "Effective Harnesses for Long-Running Agents" | Engineering blog | Context engineering, three-agent framework |
| "Constitutional AI: Harmlessness from AI Feedback" | Research paper | RLAIF methodology, self-critique training |
| "Mitigating the Risk of Prompt Injections in Browser Use" | Research | Defense-in-depth for agentic browser automation |
| "Red Teaming Language Models to Reduce Harms" | Research paper | Systematic adversarial probing methodology |
| "Recommendations for Technical AI Safety Research" | Research directions | Scalable oversight, recursive oversight |
| "Claude's Extended Thinking" | Announcement | Visible chain-of-thought reasoning |
| "Prompt Infection: LLM-to-LLM Prompt Injection" | Paper (OpenReview) | Multi-agent prompt injection propagation |
| "RedDebate: Multi-Agent Red Teaming Debates" | Paper (arXiv) | Automated adversarial debate framework |

---

## 7. Implications for NanoPilot

### 7.1 Container Agent Architecture

NanoPilot already implements key Anthropic patterns:
- **Isolated containers** = context isolation between groups (matches orchestrator-subagent isolation).
- **Per-group CLAUDE.md** = structured handoff artifacts (matches context engineering approach).
- **Token passed via stdin** = least-privilege credential handling (matches blast-radius minimization).

### 7.2 Opportunities from Multi-Agent Research

| Anthropic Pattern | NanoPilot Application |
|-------------------|----------------------|
| Three-agent harness (plan/generate/evaluate) | Auto-research loops: planner scopes research, generator executes, evaluator grades quality before responding |
| Structured handoff artifacts | Persist task state across container restarts — feature specs, progress tracking files in group mounts |
| Agent Teams | Multi-group orchestration where groups collaborate on cross-cutting tasks |
| Context resets | Explicit checkpointing between long-running container sessions to prevent context rot |

### 7.3 Adversarial Hardening

NanoPilot's multi-channel architecture (WhatsApp, Telegram, Slack) creates prompt injection surfaces:
- **Apply Anthropic's layered defense**: input sanitization at channel level → classifier check → least-privilege container execution.
- **LLM Tagging**: Tag agent outputs to detect if downstream processing has been tampered with.
- **Constitutional constraints**: Encode NanoPilot-specific safety principles in group CLAUDE.md files.

### 7.4 Long-Running Auto-Research

For NanoPilot's scheduled tasks and auto-research loops:
- Adopt the **initializer → worker → evaluator** pattern instead of monolithic agent runs.
- Use structured artifacts (JSON progress files in `data/`) as context bridges between sessions.
- Implement explicit quality rubrics for auto-generated research before delivery.

### 7.5 Extended Thinking Integration

For complex multi-step tasks routed through NanoPilot:
- Enable extended thinking for planning and evaluation phases (higher accuracy, auditable reasoning).
- Use standard (fast) mode for execution phases to control latency and cost.
- Expose thinking blocks in debug logs for troubleshooting agent behavior.

---

## Sources

- https://www.anthropic.com/research/building-effective-agents
- https://www.anthropic.com/engineering/multi-agent-research-system
- https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- https://www.anthropic.com/research/constitutional-ai-harmlessness-from-ai-feedback
- https://www.anthropic.com/research/prompt-injection-defenses
- https://www.anthropic.com/news/visible-extended-thinking
- https://www.anthropic.com/news/3-5-models-and-computer-use
- https://alignment.anthropic.com/2025/recommended-directions/
- https://code.claude.com/docs/en/agent-teams
- https://platform.claude.com/docs/en/build-with-claude/extended-thinking
- https://openreview.net/forum?id=NAbqM2cMjD (Prompt Infection)
- https://arxiv.org/abs/2506.11083 (RedDebate)
