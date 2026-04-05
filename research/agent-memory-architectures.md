# Agent Memory Architectures: A Comparative Research Document

**Date:** July 2025
**Scope:** How leading agent frameworks handle long-term memory, retrieval, and forgetting

---

## Table of Contents

1. [Introduction](#introduction)
2. [MemGPT / Letta](#memgpt--letta)
3. [LangGraph / LangChain](#langgraph--langchain)
4. [AutoGen](#autogen)
5. [CrewAI](#crewai)
6. [OpenAI Agents SDK](#openai-agents-sdk)
7. [Anthropic Claude](#anthropic-claude)
8. [Zep](#zep)
9. [Mem0](#mem0)
10. [Memory Paradigm Tradeoffs: RAG vs Structured vs Episodic](#memory-paradigm-tradeoffs)
11. [Memory Compression and Summarization Strategies](#memory-compression-and-summarization-strategies)
12. [NanoPilot's Current Approach](#nanopilots-current-approach)
13. [Comparative Summary Table](#comparative-summary-table)
14. [Gap Analysis for NanoPilot](#gap-analysis-for-nanopilot)

---

## Introduction

Agent memory is the critical differentiator between stateless LLM chatbots and genuinely useful AI assistants. As context windows grow but remain finite, and as agents are expected to operate across sessions spanning days, weeks, or months, memory architecture becomes a first-class engineering concern.

This document surveys the memory architectures of eight major agent frameworks and two dedicated memory services, compares their approaches along five dimensions (architecture, storage, retrieval, capacity limits, forgetting/eviction), and concludes with a gap analysis specific to NanoPilot.

The five evaluation dimensions for each system:

- **Architecture** — How memory is structured and layered
- **Storage Mechanism** — Where data lives (files, databases, vector stores, graphs)
- **Retrieval Strategy** — How relevant memories are found and injected into context
- **Capacity Limits** — Hard limits, scaling characteristics
- **Forgetting/Eviction Policy** — How the system handles memory overflow and staleness

---

## MemGPT / Letta

**Overview:** MemGPT (now part of the Letta framework) pioneered the OS-inspired tiered memory model for LLM agents. Published as "MemGPT: Towards LLMs as Operating Systems" (Oct 2023), it treats the LLM as a processor that manages its own virtual memory through explicit function calls.

| Dimension | Details |
|---|---|
| **Architecture** | Three-tier hierarchy: (1) **Main Context / Working Memory** — the active prompt window containing system instructions, recent messages, and working state; (2) **Recall Memory** — a searchable database of prior interactions, indexed for semantic retrieval; (3) **Archival Memory** — long-term persistent storage for evicted context, documents, and accumulated knowledge. |
| **Storage** | Main context is the LLM prompt itself (ephemeral). Recall memory uses a relational/semantic database. Archival memory uses a vector database (LanceDB by default) with embedding-based indexing. |
| **Retrieval** | The LLM triggers explicit function calls (`memory_search`, `archival_search`, `conversation_search`) to page data between tiers. Retrieval is semantic (embedding similarity) for archival, and chronological + semantic for recall. The agent decides what to retrieve — no automatic injection. |
| **Capacity** | Main context is bounded by the model's context window (typically 8K-128K tokens). Recall and archival are effectively unbounded (limited only by disk/vector DB capacity). |
| **Forgetting/Eviction** | When main context nears capacity, the system performs recursive summarization of older messages and evicts them to recall storage. The LLM can also explicitly call `memory_delete`, `memory_create`, and `memory_apply_patch` to self-edit its own memory — enabling strategic forgetting and knowledge restructuring. |

**Key Innovation:** The agent autonomously manages its own memory lifecycle. Rather than relying on external orchestration, the LLM decides when to store, retrieve, update, or delete memories. This self-editing capability enables continual learning and deliberate knowledge pruning.

**Limitations:** Function-call overhead adds latency to every interaction. The agent can make poor memory management decisions, especially with weaker models. No built-in cross-agent memory sharing.

---

## LangGraph / LangChain

**Overview:** LangGraph (LangChain's agent orchestration layer) implements memory through a sophisticated checkpointing system combined with pluggable long-term memory stores. Legacy `ConversationBufferMemory` handlers are deprecated in favor of this unified approach.

| Dimension | Details |
|---|---|
| **Architecture** | Two-layer model: (1) **Thread-scoped (short-term)** — conversation history within a session, managed as graph state that flows through workflow nodes; (2) **Cross-thread (long-term)** — persistent user/app data across sessions, namespaced by user ID or application. State updates are atomic with deterministic merging (append, overwrite, or combine). |
| **Storage** | Checkpoints are complete state snapshots stored in pluggable backends: in-memory (volatile), SQLite/Postgres (durable, production-recommended), Redis (high-performance with vector search), DynamoDB (serverless/enterprise). Each checkpoint is versioned with UUID and timestamp. |
| **Retrieval** | Thread-scoped: automatic inclusion of conversation history in state. Cross-thread: explicit key-value lookups or semantic search via integrated stores (Cognee for graph-backed semantic memory, Hindsight for BM25 + semantic + graph + temporal recall). Vector stores (Pinecone, Weaviate, Chroma) enable "search by meaning." |
| **Capacity** | Thread state grows with conversation length (bounded by context window for LLM calls). Checkpoints are disk-bounded. Long-term stores scale with backend capacity. |
| **Forgetting/Eviction** | Checkpoints can be pruned by age or count. No built-in summarization — developers implement their own trimming logic. Cross-thread memories persist until explicitly deleted. Namespace-based isolation prevents cross-user leakage. |

**Key Innovation:** The checkpointing architecture enables time-travel debugging, workflow resumability, and human-in-the-loop editing of agent state. Every significant action creates a restorable snapshot.

**Limitations:** No native summarization or compression. Memory management is largely manual — developers must build their own eviction policies. The ecosystem is fragmented across many third-party integrations.

---

## AutoGen

**Overview:** Microsoft's AutoGen (v0.4+, 2025) implements memory through a modular Memory Protocol with pluggable backends, designed for multi-agent collaboration scenarios.

| Dimension | Details |
|---|---|
| **Architecture** | Pluggable memory protocol with standard interface (`add`, `query`, `update_context`, `clear`, `close`). Supports both shared memory (all agents access a common pool) and distributed memory (each agent maintains local memory with synchronization). Asynchronous, event-driven message passing enables non-blocking memory operations. |
| **Storage** | Backend-agnostic: ChromaDB (vector), Redis (key-value), disk-based caches, structured/graph systems (Mem0, Neo4j). The protocol abstracts storage implementation, allowing hot-swapping of backends. |
| **Retrieval** | RAG-style: agents query their memory store for semantically relevant past facts, which are injected into the LLM prompt. Context enrichment via `update_context()` pulls relevant memories before each LLM call. Cross-agent memory sharing through shared stores or message passing. |
| **Capacity** | Determined by backend choice. Vector stores scale horizontally. In-memory caches are bounded by RAM. No inherent per-agent limits. |
| **Forgetting/Eviction** | Smart memory engines (e.g., Memori) promote key insights from long-term logs to active short-term context based on learned importance. No standardized eviction policy — depends on backend implementation. Namespace-based and access-control isolation for enterprise deployments. |

**Key Innovation:** The Memory Protocol as a first-class abstraction enables any storage backend to participate in the memory system without changing agent logic. Cross-language support (Python and .NET agents can share memory) is unique in the ecosystem.

**Limitations:** The protocol is flexible but minimal — sophisticated memory behaviors (summarization, temporal reasoning, entity tracking) must be built on top. Multi-agent memory consistency remains an open challenge.

---

## CrewAI

**Overview:** CrewAI implements the most taxonomically explicit memory system among popular frameworks, with four distinct memory types that mirror cognitive science categories.

| Dimension | Details |
|---|---|
| **Architecture** | Four memory types: (1) **Short-Term Memory (STM)** — current session context via vector DB + RAG; (2) **Long-Term Memory (LTM)** — cross-session learnings in persistent storage; (3) **Entity Memory** — structured facts about people, companies, concepts and their relationships; (4) **Contextual Memory** — real-time aggregator that dynamically combines STM, LTM, and Entity memory for each task. |
| **Storage** | STM and Entity: vector databases (ChromaDB, Qdrant) with embedding-based retrieval. LTM: SQLite3 or relational databases. External providers (Mem0) for production-grade persistent memory. |
| **Retrieval** | Composite scoring combining semantic similarity, recency, and task importance. The Contextual Memory aggregator dynamically determines what information from each memory type is relevant for the current operation. LLM-assisted categorization and scoring at both save-time and recall-time. |
| **Capacity** | STM: bounded by vector DB capacity per session. LTM: bounded by SQLite/DB capacity. Entity: bounded by vector DB. Configurable scoring weights for relevance tuning. |
| **Forgetting/Eviction** | STM is wiped per session by default. LTM persists indefinitely. Entity memory can be configured for persistence or session-scoped. Adaptive-depth recall allows the system to retrieve more or fewer memories based on composite scoring thresholds. |

**Key Innovation:** The four-type taxonomy with a Contextual Memory aggregator provides the most cognitively-inspired architecture. The `Memory` class exposes a unified API (`remember()` / `recall()`) that abstracts all four types, usable at agent, crew, or flow level.

**Limitations:** Vector DB dependency adds operational complexity. Entity memory's relationship tracking is relatively shallow compared to knowledge graphs. The aggregator's composite scoring requires careful tuning per use case.

---

## OpenAI Agents SDK

**Overview:** The OpenAI Agents SDK (2025) provides a layered memory approach with a Session protocol for short-term context and pluggable backends for long-term storage. It emphasizes automatic context handling and developer ergonomics.

| Dimension | Details |
|---|---|
| **Architecture** | Three conceptual layers: (1) **Session Memory** — recent conversation history via a `Session` protocol with `get_items`, `add_items`, `pop_item`; (2) **Episodic Memory** — compressed summaries of prior sessions for continuity across days/weeks; (3) **Long-Term Memory** — vector database integration for semantic recall across all time. Server-managed state available via `conversation_id` or `previous_response_id`. |
| **Storage** | Session: local (SQLite, Redis) or distributed. Server-managed: OpenAI's servers reconstruct state via response chaining. Long-term: external vector databases (Pinecone, Weaviate, Zep). |
| **Retrieval** | Session memory is automatically included in context. Episodic memory requires explicit summarization and storage by the developer. Long-term retrieval via semantic search against vector stores. Server-side state reconstruction optimizes token usage by avoiding redundant context. |
| **Capacity** | Session: bounded by storage backend. Server-managed: bounded by OpenAI's retention policies. Vector stores: effectively unbounded. |
| **Forgetting/Eviction** | Trimming and compression of session history to prevent prompt overload. Developers implement summarization cadence. Server-managed state has built-in retention limits. No native forgetting for vector-stored memories. |

**Key Innovation:** Server-managed state via response chaining eliminates the need to retransmit full history, significantly reducing token costs. The Session protocol provides a clean abstraction that handles most common memory patterns automatically.

**Limitations:** Episodic and long-term memory are not built-in — they require developer implementation and external services. The SDK provides abstractions but not implementations for persistent memory.

---

## Anthropic Claude

**Overview:** Anthropic takes an opinionated, file-based approach to agent memory that prioritizes project-scoped isolation, auditability, and simplicity. Combined with extended thinking for deeper reasoning, this creates a distinctive memory philosophy.

| Dimension | Details |
|---|---|
| **Architecture** | Project-scoped file-based memory with hierarchical layering: organization-level, project-level, and user-level memory files (typically Markdown, e.g., `CLAUDE.md`). Extended thinking provides deeper per-request reasoning via explicit "thinking" content blocks. Memory operations: `view`, `create`, `str_replace`, `insert`, `delete`, `rename`. |
| **Storage** | Plain Markdown files in a `memories/` directory structure. No vector databases, no knowledge graphs. Files are human-readable and version-controllable. Extended thinking state exists only within a single request (not persisted). |
| **Retrieval** | File-based: agents search and read memory files within their current project scope. No semantic search — retrieval is by file path and content scanning. Memory is never automatically injected; the agent explicitly searches when needed. Extended thinking: the model's internal reasoning chain can reference previously loaded context. |
| **Capacity** | Bounded by file system capacity and context window (for loaded files). No inherent limit on number of memory files. Extended thinking budget is configurable per request (token-limited). |
| **Forgetting/Eviction** | Explicit only — the agent or user must delete or edit memory files. No automatic summarization, compression, or eviction. Cross-project memory isolation is strict: no leakage between scopes. |

**Key Innovation:** Radical simplicity and auditability. Memory files are just Markdown — readable by humans, diffable in version control, and trivially debuggable. Project-scoped isolation prevents the "memory leakage" problem where personal context bleeds into professional interactions.

**Limitations:** No semantic search means retrieval is O(n) over files. No automatic memory formation — everything must be explicitly created. Scales poorly for high-volume, high-entity environments. Extended thinking doesn't persist across requests.

---

## Zep

**Overview:** Zep is a dedicated agent memory service built around a temporal knowledge graph (Graphiti engine). It provides the most sophisticated relationship and time-aware memory retrieval in the ecosystem.

| Dimension | Details |
|---|---|
| **Architecture** | Three memory constructs on a temporal knowledge graph: (1) **User Threads** — sequential conversation messages per session; (2) **User Graphs** — personal knowledge graphs storing user-specific facts, preferences, and context; (3) **Shared Graphs** — organization-level knowledge accessible by all agents. Graphiti synthesizes both unstructured (conversations) and structured (business data) information. |
| **Storage** | Neo4j-backed knowledge graph with temporal metadata on all nodes and edges. Each fact has validity timestamps enabling point-in-time queries. APIs for thread and graph operations. |
| **Retrieval** | Graph-based retrieval combining entity relationships, temporal context, and semantic similarity. Supports multi-hop reasoning across the graph. Dynamic retrieval based on relations, not just embedding similarity. Benchmarks show 18.5% accuracy improvement and 90% latency reduction vs. MemGPT on enterprise tasks (LongMemEval, DMR). |
| **Capacity** | Scales with Neo4j capacity (enterprise-grade). Real-time ingestion and querying. No inherent per-user or per-agent limits. |
| **Forgetting/Eviction** | Temporal validity enables natural "forgetting" — facts can expire or be superseded. The graph maintains full history for audit while presenting only currently-valid knowledge. State transitions are tracked, enabling queries like "what did the user prefer last month?" |

**Key Innovation:** Temporal reasoning is Zep's defining capability. Rather than treating all memories as equally valid, the knowledge graph tracks when facts became true and when they were superseded. This solves the "stale memory" problem that plagues simpler systems.

**Limitations:** Neo4j dependency adds operational complexity. Graph construction requires sophisticated entity and relation extraction. Higher latency for write operations (graph updates are more expensive than simple vector inserts).

---

## Mem0

**Overview:** Mem0 is a dedicated memory layer designed as middleware between agents and storage backends. It uses LLMs themselves to manage memory — extracting, consolidating, and retrieving salient information automatically.

| Dimension | Details |
|---|---|
| **Architecture** | Three-tier storage with three memory scopes: **Storage:** (1) Vector databases for semantic similarity search; (2) Graph databases (Neo4j, Neptune) for entity relationships; (3) SQLite for auditable history. **Scopes:** User Memory (cross-conversation), Session Memory (single conversation), Agent Memory (deployment-specific). |
| **Storage** | Vector DBs (dozens of providers), graph DBs (optional), SQLite for history/audit. Open-source self-hosted or managed cloud. Integrates with AWS, Azure, and major AI frameworks. |
| **Retrieval** | Hybrid: vector similarity search + graph traversal. The LLM extracts and scores facts at storage time, enabling higher-quality retrieval. Automatic information distillation — no manual tagging required. |
| **Capacity** | Scales to millions of users/requests. Enterprise-grade with HIPAA and SOC2 compliance options. TTL controls for governance. |
| **Forgetting/Eviction** | LLM-managed: the model decides what to store, update, or delete, resolving contradictions over time. TTL-based expiration for compliance. Non-deterministic updates (LLM-managed) can sometimes yield unpredictable memory evolution. |

**Key Innovation:** Using the LLM itself as the memory manager eliminates manual tagging and curation. Mem0 reports ~26% higher accuracy over OpenAI's memory and ~91% latency reduction vs. full-context approaches.

**Limitations:** Frequent LLM calls for memory management increase costs (offset by reduced context tokens). Non-deterministic memory updates can lead to unpredictable knowledge evolution. Multi-component deployment requires expertise in vector search, graph DBs, and prompt engineering.

---

## Memory Paradigm Tradeoffs

Three fundamental paradigms compete for how agents should organize and access memory:

### RAG (Retrieval-Augmented Generation)

- **Model:** Stateless — retrieves relevant documents/chunks from an external store at query time
- **Best for:** Document Q&A, knowledge base search, grounding in factual data
- **Strengths:** Scales well, grounds responses in real data, no session state overhead
- **Weaknesses:** No personalization, no temporal reasoning, no entity tracking, struggles with multi-hop logic
- **When to use:** The primary knowledge source is a document corpus, and user history is irrelevant

### Structured / Semantic Memory

- **Model:** Abstracted knowledge distilled from interactions into generalized concepts
- **Best for:** Decision support, cross-scenario knowledge synthesis, pattern matching
- **Strengths:** Efficient conceptual recall, supports broad knowledge connections, foundation for knowledge graphs
- **Weaknesses:** Expensive writes (distillation cost), loses temporal context, harder to audit
- **When to use:** Agents need to reason across many past interactions to synthesize new insights

### Episodic Memory

- **Model:** Chronological log of experiences with metadata (timestamps, participants, context)
- **Best for:** Personalization, audit trails, temporal reasoning, debugging
- **Strengths:** Perfect for "what happened when" queries, enables redaction/privacy, supports accountability
- **Weaknesses:** Grows linearly, requires summarization for efficiency, generalization needs additional processing
- **When to use:** The agent needs to remember specific interactions, track evolving user preferences, or provide explainable behavior

### The Hybrid Consensus (2025)

Modern systems increasingly combine all three paradigms. The emerging best practice:

1. **Episodic layer** captures raw interactions (for audit, personalization, debugging)
2. **Semantic layer** distills generalizations from episodes (for efficient cross-session recall)
3. **RAG layer** connects to external knowledge (for grounding in factual data)
4. A **retrieval orchestrator** dynamically selects which layers to query based on the current task

Research shows hybrid approaches outperform standalone RAG by up to 20% on long-context reasoning benchmarks.

---

## Memory Compression and Summarization Strategies

As conversations and agent histories grow beyond context window limits, compression becomes essential. The state of the art (2024-2025) includes:

### Structured Summarization
Preserves key task-relevant details (decisions, file changes, continuation points) in compressed form. Factory.ai found this outperforms generic chunking by maintaining agent effectiveness across extended contexts. Critical insight: optimize token allocation per task, not per request.

### Dynamic Memory Compression (DMC)
NVIDIA's approach adaptively compresses the KV cache during inference, achieving up to 8x more content in memory without retraining. Enables longer conversations and more concurrent users per GPU.

### Hierarchical Tiering
Buffer (fresh) → Core (summarized) → Archival (full history, searchable). The boundary between tiers is the critical tuning parameter — too aggressive summarization loses detail, too conservative wastes context tokens.

### Intelligent Eviction Strategies

| Strategy | Description | Tradeoff |
|---|---|---|
| **FIFO** | Drop oldest messages first | Simple but loses important early context |
| **LRU** | Drop least-recently-accessed | Better for conversational agents |
| **Relevance-scored** | Score by recency + semantic similarity + task utility | Best quality, highest complexity |
| **Forced retention** | Tag critical facts as "pinned" — never evicted | Prevents loss of key context, but pins accumulate |
| **Recursive summarization** | Summarize older content progressively | Preserves gist while freeing tokens |

### A-MEM (Agentic Zettelkasten)
The A-MEM system (2025) adapts note-linking strategies where each memory is an interconnected node with contextual descriptions, keywords, and links to related facts. Enables continual refinement and dynamic linking as new experience accumulates.

### Ongoing Challenges
- **Summarization fidelity:** Compression inevitably loses information — the question is which information to sacrifice
- **Evaluation:** Shifting from lexical metrics to task-based probes that test the agent's capability after compression
- **Cost:** Summarization requires LLM calls, creating a cost-latency tradeoff against simple truncation

---

## NanoPilot's Current Approach

NanoPilot implements a pragmatic, file-and-database memory architecture optimized for multi-group isolation and operational simplicity.

### Architecture

NanoPilot's memory has three components:

1. **Per-group `CLAUDE.md` files** — Markdown files in `groups/{name}/CLAUDE.md` serving as persistent identity and instruction memory for each agent group. These are human-readable, version-controllable, and loaded into the agent's context at container startup. Templates are copied from `groups/main/CLAUDE.md` or `groups/global/CLAUDE.md` when new groups are registered.

2. **SQLite message store** — A `better-sqlite3` database at `store/messages.db` containing:
   - `chats` — metadata about conversations (JID, name, last message time, channel, is_group)
   - `messages` — full message content with sender, timestamp, reply context, and bot message flags
   - `scheduled_tasks` — cron/interval tasks with run logs
   - `registered_groups` — group registration with trigger patterns and container config
   - `sessions` — per-group session IDs for Copilot state isolation
   - `router_state` — key-value state for the message router

3. **Per-container session isolation** — Each group gets an isolated `.copilot/` directory under `data/sessions/{group_folder}/.copilot/`, ensuring Copilot SDK state (conversation history, tool state) doesn't leak between groups. Container skills are synced from `container/skills/` into each group's session directory.

### Storage Mechanism

| Component | Storage | Lifetime | Scope |
|---|---|---|---|
| CLAUDE.md | Filesystem (Markdown) | Persistent (survives restarts) | Per-group |
| Messages DB | SQLite (`store/messages.db`) | Persistent | Global (all groups) |
| Copilot session state | Filesystem (`.copilot/`) | Persistent per group | Per-group (isolated) |
| Container working memory | Container ephemeral storage | Per-container run | Per-invocation |
| Global memory | `groups/global/` directory | Persistent | Read-only for non-main groups |

### Retrieval Strategy

- **CLAUDE.md:** Loaded directly into the agent's system prompt / context at container startup. No search — the entire file is injected.
- **Messages:** Queried by chat JID with configurable `MAX_MESSAGES_PER_PROMPT` (default: 10 most recent). Chronological, not semantic.
- **Copilot session:** Managed by the Copilot SDK internally — provides conversation continuity within a session.
- **Global memory:** Mounted read-only into non-main containers at `/workspace/global`.

### Capacity Limits

- CLAUDE.md: unbounded file size, but practically limited by context window
- Messages: `MAX_MESSAGES_PER_PROMPT` (default 10) controls how many messages are included in each prompt
- SQLite: effectively unbounded storage
- Container sessions: bounded by disk space under `data/sessions/`

### Forgetting/Eviction

- **No automatic forgetting.** CLAUDE.md files grow indefinitely unless manually edited.
- **No summarization.** Old messages are simply excluded by the `MAX_MESSAGES_PER_PROMPT` limit — they remain in SQLite but are not surfaced.
- **No semantic search.** Retrieval is purely recency-based (most recent N messages).
- **Container lifecycle:** Containers are killed after `IDLE_TIMEOUT` (default 30 minutes), but session state persists on disk.
- **Group isolation is strict:** Non-main groups cannot access other groups' data (only their own folder + read-only global).

### Strengths of NanoPilot's Approach

- **Simplicity:** No vector databases, no graph databases, no external services to manage
- **Auditability:** CLAUDE.md files are human-readable and diffable. SQLite is inspectable with standard tools
- **Isolation:** Per-group containers with filesystem-level separation provide strong security boundaries
- **Reliability:** Few moving parts means fewer failure modes
- **Low cost:** No LLM calls for memory management, no embedding generation, no vector store hosting

---

## Comparative Summary Table

| Framework | Architecture | Storage | Retrieval | Forgetting | Semantic Search | Cross-Session | Self-Editing |
|---|---|---|---|---|---|---|---|
| **MemGPT/Letta** | 3-tier (main/recall/archival) | Prompt + DB + Vector DB | Agent-initiated function calls | Recursive summarization + self-edit | Yes (vector) | Yes | Yes |
| **LangGraph** | 2-layer (thread/cross-thread) | Pluggable (SQLite/Postgres/Redis/DynamoDB) | Automatic (thread) + semantic (cross-thread) | Manual (developer-implemented) | Via integrations | Yes | No |
| **AutoGen** | Pluggable Memory Protocol | Backend-agnostic (Chroma/Redis/Mem0) | RAG-style context enrichment | Backend-dependent | Via backend | Yes | No |
| **CrewAI** | 4-type (STM/LTM/Entity/Contextual) | Vector DB + SQLite | Composite scoring (semantic + recency + importance) | STM session-scoped; LTM persistent | Yes (vector) | Yes (LTM) | No |
| **OpenAI SDK** | 3-layer (session/episodic/long-term) | Session store + server-managed + vector DB | Automatic (session) + semantic (long-term) | Trimming + summarization (dev-implemented) | Via external | Yes | No |
| **Claude** | File-based, project-scoped | Markdown files | File path + content scanning | Explicit delete only | No | Yes (files persist) | Yes (file edits) |
| **Zep** | Temporal knowledge graph | Neo4j + temporal metadata | Graph traversal + semantic + temporal | Temporal validity / supersession | Yes (graph + semantic) | Yes | Yes (graph updates) |
| **Mem0** | 3-scope (user/session/agent) | Vector DB + Graph DB + SQLite | Hybrid vector + graph | LLM-managed + TTL | Yes (vector + graph) | Yes | Yes (LLM-managed) |
| **NanoPilot** | File + SQLite + container isolation | Markdown + SQLite + filesystem | Recency-based (last N messages) + full file load | None (manual only) | No | Partial (CLAUDE.md persists) | Manual (file edit) |

---

## Gap Analysis for NanoPilot

### What NanoPilot Does Well

1. **Isolation model is best-in-class.** Per-group containers with filesystem separation is more secure than most frameworks' namespace-based approach. Few other systems achieve this level of tenant isolation.

2. **Auditability through simplicity.** Markdown + SQLite is inspectable by any developer with standard tools. No opaque vector stores or graph databases to debug.

3. **Operational reliability.** Zero external service dependencies for memory. No vector DB to host, no graph DB to maintain, no embedding pipeline to monitor.

4. **Cost efficiency.** No LLM calls for memory management, no embedding generation costs, no vector store hosting fees.

### What's Missing

#### Priority 1: Semantic Retrieval (High Impact, Medium Effort)

**Gap:** NanoPilot retrieves messages by recency only (`MAX_MESSAGES_PER_PROMPT` most recent). If a user references something from 50 messages ago, it's invisible to the agent.

**What others do:** MemGPT, CrewAI, Zep, and Mem0 all use embedding-based semantic search to surface relevant past context regardless of recency.

**Recommendation:** Add optional embedding-based search over the SQLite message store. This could be implemented as:
- A lightweight embedding model (e.g., `all-MiniLM-L6-v2` via ONNX) running locally
- A `message_embeddings` table in the existing SQLite database
- A retrieval step that combines the top-N recent messages with the top-K semantically relevant messages
- **Effort estimate:** Medium. SQLite + local embeddings avoids new infrastructure.

#### Priority 2: Memory Summarization / Compression (High Impact, Medium Effort)

**Gap:** CLAUDE.md files grow indefinitely with no compression. Over months of use, they will exceed context window limits or dilute important instructions with accumulated cruft.

**What others do:** MemGPT uses recursive summarization. Factory.ai found structured summarization (preserving decisions, artifacts, continuation points) outperforms generic approaches.

**Recommendation:** Implement periodic CLAUDE.md summarization:
- Schedule a background task (weekly or on-demand) that asks the agent to compress its own CLAUDE.md
- Preserve the original as `CLAUDE.md.archive.{date}` for audit
- Use structured summarization: retain identity, active preferences, and recent decisions; compress historical context
- **Effort estimate:** Medium. Uses existing container infrastructure.

#### Priority 3: Cross-Group Knowledge Sharing (Medium Impact, Low Effort)

**Gap:** Non-main groups only access their own folder + read-only `groups/global/`. There's no mechanism for knowledge distilled in one group to benefit another.

**What others do:** AutoGen's shared memory, Zep's shared graphs, and Mem0's user-scoped memory all enable cross-context knowledge transfer.

**Recommendation:** Enhance the global memory directory:
- Allow the main agent to write synthesized knowledge to `groups/global/knowledge/`
- Implement a `distill_knowledge` IPC command that extracts generalizable facts from a group's history
- Non-main groups already have read-only access to global — this just needs content
- **Effort estimate:** Low. The mount infrastructure already exists.

#### Priority 4: Entity Tracking (Medium Impact, High Effort)

**Gap:** NanoPilot has no entity memory — it doesn't track people, projects, or concepts across conversations.

**What others do:** CrewAI's Entity Memory, Zep's knowledge graph, and Mem0's graph layer all maintain entity-relationship models.

**Recommendation:** Start simple with a lightweight entity store:
- Add an `entities` table in SQLite: `(name, type, facts_json, last_updated, group_folder)`
- Have the agent populate it via IPC commands when it identifies important entities
- Include relevant entities in the prompt context alongside messages
- This is far simpler than a full knowledge graph but captures 80% of the value
- **Effort estimate:** High (requires agent cooperation and prompt engineering).

#### Priority 5: Temporal Memory / Decay (Low Impact, Low Effort)

**Gap:** All memories in NanoPilot are equally weighted regardless of age. A preference expressed 6 months ago carries the same weight as one from yesterday.

**What others do:** Zep's temporal knowledge graph tracks fact validity over time. CrewAI's composite scoring includes recency weighting. Mem0 supports TTL-based expiration.

**Recommendation:** Add lightweight temporal signals:
- Timestamp entries in CLAUDE.md with ISO dates (convention, not code change)
- Weight message retrieval by recency when combining recent + semantic results
- Add optional TTL on CLAUDE.md entries that the agent can set
- **Effort estimate:** Low. Mostly convention changes.

### What Should NOT Be Adopted

1. **Full knowledge graphs (Neo4j, etc.)** — The operational complexity is not justified for NanoPilot's personal assistant use case. Zep-style graphs make sense for enterprise multi-tenant scenarios, not single-user deployments.

2. **LLM-managed memory (Mem0 style)** — Using LLM calls to manage memory adds cost and non-determinism. NanoPilot's explicit file-based approach is more predictable and cheaper.

3. **Vector database as a service** — External vector DB hosting contradicts NanoPilot's self-hosted, zero-dependency philosophy. If semantic search is added, it should use local embeddings stored in SQLite.

### Implementation Priority Matrix

| Enhancement | Impact | Effort | Dependencies | Priority |
|---|---|---|---|---|
| Semantic retrieval (local embeddings + SQLite) | High | Medium | None | P1 |
| CLAUDE.md summarization | High | Medium | Existing containers | P2 |
| Global knowledge distillation | Medium | Low | Existing mount infrastructure | P3 |
| Entity tracking (SQLite-based) | Medium | High | Agent prompt changes | P4 |
| Temporal decay / weighting | Low | Low | Convention changes | P5 |

---

## References

### Frameworks and Services
- MemGPT: [arXiv:2310.08560](https://arxiv.org/abs/2310.08560) — "MemGPT: Towards LLMs as Operating Systems"
- Letta: [letta.com](https://www.letta.com/blog/memgpt-and-letta) — MemGPT evolution into Letta
- LangGraph Memory: [docs.langchain.com](https://docs.langchain.com/oss/python/langgraph/memory)
- LangGraph Checkpointing: [deepwiki.com](https://deepwiki.com/langchain-ai/langgraph/4.1-checkpointing-architecture)
- AutoGen Memory: [microsoft.github.io/autogen](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/memory.html)
- CrewAI Memory: [docs.crewai.com](https://docs.crewai.com/en/concepts/memory)
- OpenAI Agents SDK: [openai.github.io/openai-agents-python](https://openai.github.io/openai-agents-python/ref/memory/)
- Claude Memory Systems: [anthropic-cookbook](https://deepwiki.com/anthropics/anthropic-cookbook/4.2-memory-systems-for-agents)
- Zep: [arXiv:2501.13956](https://arxiv.org/abs/2501.13956) — "Zep: A Temporal Knowledge Graph Architecture for Agent Memory"
- Mem0: [arXiv:2504.19413](https://arxiv.org/html/2504.19413v1) — "Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory"

### Research Papers and Analysis
- A-MEM: [arXiv:2502.12110](https://arxiv.org/abs/2502.12110) — "A-MEM: Agentic Memory for LLM Agents"
- Multi-Agent Memory: [arXiv:2603.10062](https://arxiv.org/html/2603.10062v2) — "Multi-Agent Memory from a Computer Architecture Perspective"
- Episodic Memory for RAG: [arXiv:2511.07587](https://arxiv.org/abs/2511.07587) — "Beyond Fact Retrieval"
- Factory.ai: [Evaluating Context Compression](https://factory.ai/news/evaluating-compression)
- NVIDIA DMC: [Dynamic Memory Compression](https://developer.nvidia.com/blog/dynamic-memory-compression/)

### Industry Analysis
- Mem0 Technical Analysis: [southbridge.ai](https://www.southbridge.ai/blog/mem0-technical-analysis-report)
- Agent Memory Survey: [github.com/Shichun-Liu/Agent-Memory-Paper-List](https://github.com/Shichun-Liu/Agent-Memory-Paper-List)
- Memory Systems Comparison: [agentflow.academy](https://www.agentflow.academy/blog/memory-systems-ai-agents)
