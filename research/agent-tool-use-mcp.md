# Agent Tool Use & MCP Ecosystem

> Research document — July 2025

---

## 1. MCP Protocol Overview

The **Model Context Protocol (MCP)** is an open JSON-RPC 2.0 specification that standardises how AI agents connect to external tools and data sources. Created by Anthropic and now widely adopted (GitHub Copilot, Cursor, Windsurf, etc.), MCP decouples tool definitions from LLM providers.

### Core Primitives

| Primitive       | Direction       | Purpose                                    |
|-----------------|-----------------|--------------------------------------------|
| **Tools**       | Server → Client | Functions the agent can invoke              |
| **Resources**   | Server → Client | Read-only data the agent can reference      |
| **Prompts**     | Server → Client | Templated prompt fragments                  |
| **Sampling**    | Client → Server | Server requests an LLM completion           |

### Transports (spec 2025-03-26)

| Transport          | Mechanism                          | Best For                         |
|--------------------|------------------------------------|----------------------------------|
| **stdio**          | Client spawns server as subprocess; messages via stdin/stdout | Local CLI tools, IDE extensions, low-latency single-client |
| **Streamable HTTP** | Single `POST /mcp` endpoint; optional SSE upgrade for streaming | Remote/cloud servers, multi-client, production |

SSE (dual-endpoint) was deprecated in the 2025-03-26 spec. Streamable HTTP subsumes its capabilities via a single endpoint that can optionally upgrade to `text/event-stream`.

**Key design choices:** transport-agnostic message format, capability negotiation at connection time, stateless-by-default with optional session persistence.

---

## 2. MCP Server Landscape by Category

### Category Map

| Category                   | Notable Servers                                     | Tool Count |
|----------------------------|-----------------------------------------------------|------------|
| **Code & Git**             | GitHub, GitLab, Linear, Jira                        | 10-30 each |
| **Databases**              | PostgreSQL, MySQL, SQLite, Supabase, MongoDB        | 5-15 each  |
| **Browser Automation**     | Puppeteer, Playwright, Browserbase                  | 8-20 each  |
| **Search & Web**           | Brave Search, Firecrawl, Exa, Perplexity            | 3-8 each   |
| **Productivity**           | Notion, Google Drive, Slack, Trello, Asana           | 10-25 each |
| **Communication**          | Slack, Discord, Microsoft Teams                      | 5-15 each  |
| **File & Cloud Storage**   | Filesystem, Dropbox, S3                              | 5-10 each  |
| **Cloud Infrastructure**   | AWS, GCP, Cloudflare, Vercel                         | 10-40 each |
| **Code Execution**         | E2B, Jupyter, Docker sandboxes                       | 3-8 each   |

### Key Servers in Detail

**GitHub MCP Server** — Official. Repos, issues, PRs, Actions, code search. The most widely integrated MCP server in developer tooling.

**PostgreSQL MCP Server** — Schema exploration, query execution, read-only safety mode. De facto choice for database-driven agents.

**Playwright MCP Server** — Cross-browser automation (Chrome, Firefox, Safari). Navigate, screenshot, fill forms. Official Microsoft implementation gaining over Puppeteer for multi-browser support.

**Brave Search MCP Server** — Privacy-focused web search. Real-time information access without Google dependency. Lightweight tool surface (search, local search).

**Notion MCP Server** — Read/write pages and databases. Essential for knowledge-management integrations.

---

## 3. MCP Registries & Discovery

| Registry                          | Type          | Size         | Key Feature                          |
|-----------------------------------|---------------|--------------|--------------------------------------|
| **Official MCP Registry**         | Canonical     | Growing      | Machine-readable `server.json` metadata |
| **Smithery** (smithery.ai)        | CLI + hosted  | 5,000+ servers | `smithery mcp search/add` CLI, hosted proxying |
| **mcp.run**                       | Hosted        | Curated      | WebAssembly sandboxing, managed auth  |
| **Composio**                      | Platform      | 100+ connectors | Built-in OAuth, managed auth flows  |
| **OpenTools / FindMCP / mcpservers.org** | Directory | Aggregated   | Community-curated, categorised lists |

**Trend:** Registries are converging on the official registry spec with `server.json` manifests containing capabilities, endpoints, versioning, and deployment metadata. Smithery dominates CLI-based discovery; Composio leads for managed auth.

---

## 4. Tool Selection Strategies

### 4.1 Patterns

| Pattern                 | How It Works                                              | Trade-offs                          |
|-------------------------|-----------------------------------------------------------|-------------------------------------|
| **Direct Function Calling** | LLM outputs structured JSON matching a tool schema in one shot | Fast, cheap, deterministic; brittle on ambiguous tasks |
| **ReAct Loop**          | Observe → Reason → Act → Reflect → repeat                | Handles ambiguity, multi-step; expensive, can loop |
| **Hybrid (Plan + Execute)** | ReAct for planning, direct calls for execution          | Best of both; complex to implement  |
| **Dynamic Tool Loading** | Meta-tool retrieves relevant tools from registry via semantic search | Scales to 1000s of tools; adds retrieval latency |
| **Parallel Tool Calls** | LLM emits multiple independent calls in one turn          | Faster for embarrassingly parallel tasks |

### 4.2 Dynamic Tool Selection (Emerging)

The "Dynamic MCP ReAct Agent" pattern (arxiv 2509.20386) uses a meta-tool to semantically search a large tool registry, loading only relevant tools per turn. This reduces context window consumption by ~50% without accuracy loss — critical when registries exceed hundreds of servers.

### 4.3 Error Handling

Modern agents employ explicit reflection on failed tool calls, conditional routing to alternative tools, and early termination heuristics to avoid unproductive loops.

---

## 5. Benchmarks

### Berkeley Function Calling Leaderboard (BFCL v4)

The de facto standard for measuring LLM tool-use capability. Tests span:

| Category             | Description                                         |
|----------------------|-----------------------------------------------------|
| Simple               | One API, one function call                          |
| Multiple             | Select correct function from several candidates     |
| Parallel             | Multiple calls in one response                      |
| Relevance Detection  | Correctly abstain when no tool applies               |
| Multi-turn / Stateful| Maintain state across conversation turns             |
| Agentic (v4)         | Memory, web search, adversarial robustness           |

**Metrics:** AST Accuracy (structural correctness), Execution Accuracy (correct output), Relevance Accuracy, Latency, Cost.

**Top models (Oct 2025):** GLM-4.5 FC (70.85%), Claude Opus 4.1 (70.36%), Claude Sonnet 4 (70.29%), GPT-5 (59.22%).

### ToolBench

Complementary benchmark covering 16,000+ RESTful APIs with auto-generated instruction data. Broader API coverage but primarily single-turn; less focus on agentic multi-step workflows than BFCL.

### Other Benchmarks

τ-Bench, API-Bank, HammerBench, MCPMark, ComplexFuncBench — each with niche focus areas (latency, complex schemas, multi-language).

---

## 6. Comparison Table: MCP vs Alternatives

| Dimension            | MCP                        | OpenAI Function Calling     | LangChain Tools           | Custom REST/gRPC        |
|----------------------|----------------------------|-----------------------------|---------------------------|-------------------------|
| **Standard**         | Open spec (JSON-RPC)       | Proprietary schema          | Framework-specific        | Ad hoc                  |
| **Transport**        | stdio / Streamable HTTP    | HTTP (OpenAI API)           | In-process Python         | Any                     |
| **Discovery**        | Registries, `server.json`  | None (hardcoded)            | Manual registration       | None                    |
| **Isolation**        | Process-level (stdio) or network | N/A                    | In-process                | Network                 |
| **Multi-provider**   | ✅ Any LLM client           | ❌ OpenAI only               | ✅ Via adapters            | ✅ Manual                |
| **Ecosystem size**   | 5,000+ servers              | N/A                         | 100s of integrations      | Unlimited but bespoke   |
| **Auth**             | Emerging (OAuth, Composio) | API key                     | Manual                    | Manual                  |
| **Streaming**        | SSE upgrade on HTTP        | SSE (chat completions)      | Callbacks                 | Depends                 |

---

## 7. Gap Analysis for NanoPilot

### Current NanoPilot Tool Surface

NanoPilot runs the Copilot SDK inside Docker containers with per-group filesystem isolation. The agent currently has access to:

| Tool               | Category         | Description                              |
|--------------------|------------------|------------------------------------------|
| `send_message`     | Communication    | Send outbound messages via channels       |
| `schedule_task`    | Task Management  | Schedule future agent invocations         |
| `pause_task`       | Task Management  | Pause a running scheduled task            |
| `resume_task`      | Task Management  | Resume a paused task                      |
| `cancel_task`      | Task Management  | Cancel a scheduled task                   |
| `list_tasks`       | Task Management  | List all scheduled tasks                  |
| `register_group`   | Administration   | Register a new group for agent access     |
| `agent-browser`    | Browser          | Headless browser for web interaction      |

### Identified Gaps

| Gap Area                    | What's Missing                                         | MCP Servers That Could Fill It          | Priority |
|-----------------------------|--------------------------------------------------------|-----------------------------------------|----------|
| **Database Access**         | No direct DB query/exploration capability               | PostgreSQL, SQLite, Supabase MCP        | High     |
| **Code & Git**              | No repo management from within agent containers         | GitHub MCP (already used by host SDK)   | Medium   |
| **Web Search**              | No real-time information retrieval                      | Brave Search, Exa, Perplexity MCP       | High     |
| **File/Knowledge Mgmt**     | Limited to container-local filesystem                   | Notion, Google Drive MCP                | Medium   |
| **Code Execution Sandbox**  | Container runs agent, not arbitrary user code           | E2B, Jupyter MCP                        | Low      |
| **Calendar/Email**          | Partial (Gmail skill exists); no calendar               | Google Calendar MCP, Gmail MCP          | Medium   |
| **Monitoring/Observability**| No tool-use telemetry or cost tracking                  | Custom MCP or OpenTelemetry integration | Medium   |

### Integration Strategy

1. **stdio is the natural fit.** NanoPilot already spawns containers; MCP servers can be co-spawned as stdio subprocesses inside the container, inheriting the isolation boundary. No networking overhead.

2. **Dynamic tool loading matters.** As NanoPilot gains MCP servers, the tool count will grow beyond what fits in a single context window. Implementing semantic tool retrieval (or category-based filtering per group) prevents context bloat.

3. **Copilot SDK compatibility.** The Copilot SDK already speaks MCP natively — adding MCP servers to the container's `mcp-config.json` may be sufficient for many integrations without custom NanoPilot code.

4. **Security boundary.** MCP servers inside the container inherit NanoPilot's existing isolation (per-group filesystem, no cross-group access). Network-accessible MCP servers (Streamable HTTP) would need explicit allowlisting.

5. **Benchmark awareness.** NanoPilot uses the Copilot SDK (Claude/GPT backend). BFCL v4 shows Claude Sonnet 4 at 70.29% tool-use accuracy — strong but not perfect. Error handling and retry logic in the agent runner remain important.

---

## References

- MCP Specification (2025-03-26): https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
- Dynamic ReAct for MCP: https://arxiv.org/html/2509.20386v1
- BFCL v4 Leaderboard: https://gorilla.cs.berkeley.edu/leaderboard.html
- ToolBench: https://www.philschmid.de/benchmark-compedium
- Smithery Registry: https://smithery.ai/
- Official MCP Registry: https://registry.modelcontextprotocol.io/
- Composio: https://composio.dev/
- Function Calling vs ReAct: https://particula.tech/blog/function-calling-vs-react-agents-patterns
- MCP Awesome Servers: https://mcp-awesome.com/
