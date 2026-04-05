# Multi-Agent Orchestration Patterns

> Research document — July 2025
> Covers major frameworks (OpenAI Swarm, CrewAI, LangGraph, AutoGen, Anthropic) and
> architectural patterns (hierarchy, debate, blackboard, pipeline, marketplace, consensus).

---

## 1. Overview

Multi-agent orchestration coordinates multiple LLM-powered agents to solve tasks that
exceed the capability of a single agent. The core tension in every pattern is between
**autonomy** (agents deciding what to do) and **control** (a coordinator dictating flow).

Patterns fall on a spectrum:

```
Rigid control ◄──────────────────────────────► Full autonomy
Pipeline → Hierarchy → Orchestrator-Worker → Handoff → Group Chat → Marketplace
```

---

## 2. Framework-Specific Patterns

### 2.1 OpenAI Swarm — Handoff-Based Routing

- **Concept:** Each agent is a system prompt + tool list. A "handoff" is a function that
  returns a *different agent*, transferring control while preserving the full message history.
- **Stateless:** Each orchestration call starts fresh; persistence is external.
- **Routing:** Agents decide when to hand off based on natural-language routines, not
  hardcoded state machines.
- **Strengths:** Explicit routing, easy to trace/debug, seamless context continuity.
- **Weakness:** Statelessness requires external session management for long-lived workflows.
- **Example flow:** Triage Agent → Refund Agent → Human Escalation Agent.
- **Production note:** OpenAI's Agent SDK extends Swarm's concepts for production use.

### 2.2 CrewAI — Role-Based Task Delegation

- **Concept:** Agents have explicit roles, backstories, goals, and tool access. Tasks are
  assigned based on specialization. Crews execute via sequential, hierarchical, or
  consensus processes.
- **Delegation:** `allow_delegation=True` gives agents a Delegate Work tool and an
  Ask Question tool to collaborate dynamically.
- **Memory:** Supports short-term and long-term memory across tasks.
- **Process types:**
  - **Sequential** — ordered pipeline (Researcher → Writer → Editor).
  - **Hierarchical** — manager agent supervises and delegates to workers.
  - **Consensus** — agents vote or collaboratively decide.
- **Strengths:** Clear accountability via roles; modular team composition.
- **Weakness:** Needs bounded iteration limits to prevent infinite delegation loops.

### 2.3 LangGraph — Graph-Based Supervisor Workflows

- **Concept:** Agents are nodes in a state-machine graph. Edges encode transitions.
  A supervisor node inspects state and routes to specialized worker nodes.
- **Supervisor pattern:** Central agent receives input, delegates to domain-specific
  workers, collects results, and optionally re-routes for refinement.
- **Human-in-the-loop:** Graph edges can pause for human approval before critical actions.
- **Strengths:** Visual/debuggable graph; fine-grained control over state transitions.
- **Best practice (2024):** Manual supervisor via tool-calling is preferred over the
  `langgraph-supervisor` library for flexibility.

### 2.4 AutoGen — Conversation-Based Orchestration

- **Two-Agent Chat:** Simple back-and-forth between two agents (e.g., Coder + Critic).
- **Group Chat:** Multiple agents share a conversation context. A GroupChatManager
  selects the next speaker via round-robin, random, manual, or LLM-based selection.
- **Nested Chat:** An agent spawns a sub-conversation (e.g., Writer consults Reviewer
  in a side thread), then merges results back into the main conversation.
- **Strengths:** Flexible speaker selection; shared context enables iterative refinement.
- **Weakness:** All agents see the full history — context windows can bloat quickly.

### 2.5 Anthropic — Orchestrator-Worker + Composable Primitives

- **Philosophy:** Start simple. Use workflows (static paths) before agents (dynamic paths).
  Only add multi-agent complexity when single-agent approaches fail.
- **Orchestrator-Worker:** A lead agent plans, delegates subtasks to parallel workers,
  each worker compresses findings, lead synthesizes a unified response.
- **Other primitives:** Prompt chaining, routing, parallelization, evaluator-optimizer.
- **Key insight:** Workers mitigate path dependency — each explores independently,
  preventing the single-thread tunnel vision of monolithic agents.
- **Measured impact:** 90%+ improvement over single-agent on research/synthesis tasks.
- **Cost note:** Multi-agent systems use 10–15× more tokens than single-agent chat.

---

## 3. Architectural Patterns (Framework-Agnostic)

### 3.1 Hierarchy / Supervisor

A central coordinator delegates to specialized workers and aggregates results.
Workers do not communicate directly. Used by LangGraph supervisor and CrewAI hierarchical mode.

### 3.2 Pipeline

Tasks flow sequentially through stages, each handled by a different agent.
Output of stage N is input to stage N+1. Simple, predictable, but vulnerable to
bottlenecks and error propagation. Used by CrewAI sequential and prompt chaining patterns.

### 3.3 Handoff / Relay

Control transfers between peer agents based on runtime decisions. No central
coordinator — agents self-organize handoffs. Used by OpenAI Swarm.

### 3.4 Debate / Adversarial

Multiple agents take opposing perspectives, argue in structured rounds, and a judge
synthesizes the outcome. Improves accuracy on reasoning-heavy tasks by stress-testing
answers through counterarguments.

### 3.5 Blackboard

Agents share a common workspace (the "blackboard"). A control component decides which
agent acts next based on workspace state. Supports heterogeneous reasoning (rule-based,
neural, symbolic). Well-suited for ill-structured problems requiring collective expertise.

### 3.6 Marketplace / Market-Based

Agents bid for tasks or resources dynamically. No fixed workflow — coordination emerges
from negotiation. Scales well for distributed scheduling and resource allocation.

### 3.7 Consensus / Voting

Multiple agents independently generate solutions; a voting or aggregation mechanism
selects the best. Increases robustness by diversifying proposals. Often combined with
debate or blackboard as a termination criterion.

---

## 4. Comparison Table

| Pattern | Coordination | Failure Handling | Best Use Case |
|---|---|---|---|
| **Hierarchy/Supervisor** | Central coordinator | Coordinator retries or reassigns | Complex tasks with clear subtask boundaries |
| **Pipeline** | Sequential handoff | Stage-level retry; error propagates forward | Linear workflows (ETL, content generation) |
| **Handoff/Relay** | Peer-to-peer transfer | Handoff back to triage or escalate to human | Customer support, multi-domain routing |
| **Debate/Adversarial** | Structured rounds + judge | Judge breaks deadlocks; iteration cap | Fact-checking, complex reasoning, red-teaming |
| **Blackboard** | Shared workspace + controller | Controller re-invokes agents on stale state | Ill-structured problems, multi-domain synthesis |
| **Marketplace** | Bidding/negotiation | Re-auction failed tasks | Dynamic resource allocation, crowdsourcing |
| **Consensus/Voting** | Independent then aggregate | Majority rules; outliers discarded | High-stakes decisions, quality assurance |
| **Group Chat** | Shared context, speaker selection | Manager redirects; iteration limit | Brainstorming, iterative refinement |
| **Orchestrator-Worker** | Lead plans, workers execute in parallel | Lead re-plans on worker failure | Research, synthesis, broad exploration |

---

## 5. Applicability to NanoPilot

NanoPilot's current architecture maps to several of these patterns:

### Current Architecture Mapping

| NanoPilot Feature | Pattern Alignment |
|---|---|
| **Telegram Swarm skill** | Group Chat — each subagent has its own bot identity in a Telegram group, mimicking multi-agent group chat with distinct personas |
| **Group isolation** | Hierarchy — each group operates independently with its own CLAUDE.md memory, similar to isolated worker agents under a coordinator |
| **Container-per-task** | Orchestrator-Worker — the host process (src/index.ts) acts as orchestrator, spawning isolated container workers per invocation |
| **IPC via filesystem** | Blackboard — the `data/` and `groups/` directories function as a shared workspace; the IPC watcher (src/ipc.ts) acts as the blackboard controller |
| **Channel registry** | Router/Handoff — messages are classified and routed to the correct channel handler at startup |

### Opportunities

1. **Debate pattern for quality:** A "critic" container could review the primary agent's
   output before delivery — the existing container isolation makes this cheap to add.

2. **Pipeline for multi-step tasks:** Chain containers sequentially (research → draft →
   edit) using IPC files as stage boundaries. NanoPilot's filesystem IPC already supports
   this without new infrastructure.

3. **Consensus for high-stakes responses:** Spawn 2–3 containers with the same prompt,
   aggregate via majority vote or LLM judge. Token-expensive but feasible for critical tasks.

4. **Marketplace for skill routing:** Instead of static trigger patterns, agents could
   "bid" on incoming messages based on confidence — the router selects the highest-bidding
   skill. This would generalize the current pattern-matching router.

5. **Nested conversations:** The Telegram Swarm already supports multi-bot group identity.
   Extending this to support nested sub-conversations (AutoGen-style) where a subagent
   spawns a private side-thread before responding to the group would add depth.

### Constraints to Consider

- **Token cost:** Multi-agent patterns multiply token usage 10–15× (Anthropic's data).
  NanoPilot's container-per-task model already isolates costs, but adding debate or
  consensus layers needs budget awareness.
- **Latency:** Each additional agent hop adds container startup + LLM inference time.
  Pipeline and debate patterns should be reserved for async/non-real-time tasks.
- **Filesystem IPC throughput:** The current file-watcher IPC works for low-frequency
  coordination but may need upgrading (e.g., Unix sockets) for high-throughput
  multi-agent communication patterns like marketplace bidding.

---

## References

- [OpenAI Swarm (GitHub)](https://github.com/openai/swarm)
- [OpenAI Cookbook: Orchestrating Agents](https://developers.openai.com/cookbook/examples/orchestrating_agents)
- [CrewAI Documentation](https://docs.crewai.com/en/concepts/collaboration)
- [LangGraph Multi-Agent Workflows](https://blog.langchain.com/langgraph-multi-agent-workflows/)
- [AutoGen Conversation Patterns](https://microsoft.github.io/autogen/0.2/docs/tutorial/conversation-patterns/)
- [Anthropic: How We Built Our Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [bMAS: Blackboard LLM Multi-Agent System (arXiv)](https://arxiv.org/html/2507.01701v1)
- [Microsoft: Designing Multi-Agent Intelligence](https://developer.microsoft.com/blog/designing-multi-agent-intelligence)
- [Agentic Design Patterns: Handoff Orchestration](https://agentic-design.ai/patterns/multi-agent/handoff-orchestration)
