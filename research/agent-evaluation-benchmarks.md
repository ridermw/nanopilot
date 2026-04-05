# Agent Evaluation & Benchmarks

> Research document — July 2025
> Context: Understanding how AI agents are evaluated, what the major benchmarks measure, their limitations, and how to apply these insights to NanoPilot agent testing.

---

## Overview

The agent evaluation landscape is fragmented, fast-moving, and increasingly scrutinized. Dozens of benchmarks exist, each measuring a narrow slice of "agent capability." Companies cherry-pick favorable results. Benchmarks saturate within months of release. Despite this, a clear taxonomy has emerged:

| Category | What It Tests | Examples |
|----------|--------------|---------|
| **Code generation** | Single-function synthesis | HumanEval, MBPP |
| **Software engineering** | End-to-end issue resolution | SWE-bench, SWE-bench Verified |
| **General assistant** | Multi-step reasoning + tools | GAIA |
| **Multi-domain agent** | Breadth across 8 environments | AgentBench |
| **Web navigation** | Browser-based task completion | WebArena, VisualWebArena |
| **Tool / API use** | Correct function calling | ToolBench, API-Bank, BFCL |

The critical insight: **no single benchmark captures real-world agent quality.** The best evaluation strategies combine multiple dimensions — task completion, cost, latency, safety, and human preference.

---

## Major Benchmarks

### 1. SWE-bench & SWE-bench Verified

**What it measures:** Can an agent resolve real GitHub issues by generating correct patches against Python repositories? SWE-bench Verified is a human-validated 500-problem subset for more reliable scoring.

**Current SOTA:** Top agents (Claude Opus 4.5, Gemini 3.1 Pro, GPT-5.2) resolve ~78–81% of Verified problems. Open models (Qwen3, DeepSeek) are competitive but trail by 3–5 points.

**Limitations:**
- Python-only; no multi-language coverage
- Scaffolding (agentic harness) matters enormously — same model scores vary 15%+ across harnesses
- SWE-bench Live and Multilingual variants address staleness, but adoption is still growing
- Encourages over-optimization on patch generation rather than holistic SE practices

### 2. GAIA (General AI Assistant)

**What it measures:** Multi-step reasoning, tool use, web browsing, and multimodal understanding through ~450 real-world questions across 3 difficulty levels.

**Current SOTA:** Top multi-agent systems (using ensembles of GPT-5, Claude 4.6, Gemini 3 Pro) reach ~92% overall — matching estimated human performance (~92%). Level 3 (hardest) scores reach ~85–89%.

**Limitations:**
- Question set is static and relatively small — risk of overfitting
- Early GPT-4 scored only 15–40%; the rapid climb suggests benchmark saturation
- Favors systems with web access and tool orchestration — not pure reasoning

### 3. AgentBench

**What it measures:** LLM-as-agent performance across 8 interactive environments: OS shell, database queries, knowledge graphs, card games, lateral thinking, household tasks, web shopping, and web browsing.

**Current SOTA:** Commercial models (GPT-4, Claude Opus) consistently outperform open-source alternatives. Overall scores are a mean of per-environment success rates.

**Limitations:**
- Significant gap between commercial and open-source models reveals benchmark may favor scale
- Multi-step reasoning failures dominate — the benchmark surfaces weaknesses but doesn't prescribe fixes
- Environments are simulated; transfer to production is uncertain

### 4. WebArena & VisualWebArena

**What it measures:** Autonomous web navigation — completing tasks across e-commerce, forums, GitLab-like interfaces, and CMS systems in containerized browser environments. VisualWebArena adds multimodal/visual grounding (910+ tasks).

**Current SOTA:** AWA 1.5 reaches ~57% on WebArena. Human performance is 88.7% on VisualWebArena vs. best agent at ~16.4% — the largest human-agent gap of any major benchmark.

**Limitations:**
- The visual gap is enormous — current VLMs struggle with real GUI understanding
- WebArena Verified (2025) addresses ambiguity in evaluation, but the benchmark remains expensive to run
- Docker-based environments are heavyweight; few teams reproduce results independently

### 5. ToolBench & API-Bank

**What it measures:** Correct tool/API selection, argument generation, and multi-step chaining.

- **ToolBench:** 3,451 tools, 16,464 APIs across 49 categories. Tests retrieval, planning, and invocation.
- **API-Bank:** 73 curated APIs, 314 dialogues, 753 annotated calls. Tests planning, retrieval, and argument correctness.

**Limitations:**
- ToolBench relies on LLM-generated solution paths — potential circular evaluation
- API-Bank is small and curated — limited coverage of real-world API complexity
- Neither measures error recovery or graceful degradation when APIs fail

### 6. Berkeley Function Calling Leaderboard (BFCL)

**What it measures:** Precision of LLM function calling — single-turn, multi-turn, parallel calls, hallucination detection, and abstention (knowing when *not* to call a function). Uses AST-based comparison for robust matching. V4 includes live executable testing and agentic multi-turn evaluation.

**Current SOTA:** Top models score 90%+ on single-turn; multi-turn and agentic scenarios remain harder. 2,000+ test cases across Python, Java, JavaScript, and REST.

**Limitations:**
- Function calling ≠ agent capability — correct invocation is necessary but not sufficient
- AST matching can miss semantically equivalent but structurally different calls
- Scores don't capture latency, cost, or real-world API integration challenges

### 7. HumanEval & MBPP

**What it measures:** Functional correctness of single-function code generation from natural language prompts (Python).

**Current SOTA:** GPT-4o at ~91% on HumanEval, ~74% on MBPP. These benchmarks are approaching saturation.

**Limitations:**
- Short, self-contained problems — no multi-file, no context, no debugging
- Pass@k metric rewards generating many attempts, not first-try reliability
- Python-only; doesn't test real-world languages or frameworks
- Security, maintainability, and efficiency are not measured
- Newer benchmarks (BigCodeBench, LiveCodeBench) show 15–35% accuracy drops on harder problems

---

## Comparison Table

| Benchmark | Domain | Primary Metric | SOTA (approx.) | Open Source? | Year |
|-----------|--------|---------------|-----------------|-------------|------|
| SWE-bench Verified | Software engineering | % issues resolved | ~81% | ✅ Dataset, ✅ Harness | 2024 |
| GAIA | General assistant | % correct (3 levels) | ~92% | ✅ Dataset | 2023 |
| AgentBench | Multi-domain (8 envs) | Mean success rate | Varies by env | ✅ Full | 2023 |
| WebArena | Web navigation | Task completion % | ~57% | ✅ Full | 2023 |
| VisualWebArena | Visual web navigation | Task completion % | ~16% | ✅ Full | 2024 |
| ToolBench | API/tool use | Success rate | Varies | ✅ Full | 2023 |
| API-Bank | API use (curated) | Planning/call accuracy | Varies | ✅ Dataset | 2023 |
| BFCL | Function calling | AST match accuracy % | ~90%+ (single) | ✅ Full | 2024 |
| HumanEval | Code generation | Pass@k | ~91% | ✅ Dataset | 2021 |
| MBPP | Code generation | Pass@k | ~74% | ✅ Dataset | 2021 |

---

## The Cherry-Picking Problem

Companies routinely exploit benchmark weaknesses:

1. **Cost-blind reporting.** Agents that make hundreds of internal LLM calls to maximize accuracy report only the headline number. Princeton research shows approaches with similar accuracy can differ in cost by 100×.

2. **Weak test exploitation.** Amazon/Stanford/MIT studies found agents can "pass" benchmarks without solving them as intended — overestimating performance by 100%+ and misranking agents by 40%+.

3. **Data leakage.** Reviews of ~100 papers found widespread unintentional contamination — test data used during training or hyperparameter tuning. Popular benchmarks get "memorized."

4. **Selective submission.** On public leaderboards, proprietary models are selectively entered or retracted to show only peak results. Little transparency on failure rates.

5. **Goodhart's Law.** When a measure becomes a target, it ceases to be a good measure. Labs optimize for narrow benchmark scenarios that don't transfer to production.

**Takeaway:** Treat any single-number benchmark claim with skepticism. Demand cost, latency, and methodology transparency.

---

## Emerging Evaluation Approaches

The field is converging on multi-dimensional evaluation:

- **Task completion + cost Pareto fronts** — evaluate accuracy *and* efficiency together
- **LLM-as-judge** — use strong LLMs to score outputs at scale (cheaper than human eval, 80%+ agreement with humans)
- **Trajectory-based analysis** — measure not just final outcomes but intermediate reasoning quality and error recovery
- **Human preference (Elo-style)** — pairwise comparisons capture subjective quality that benchmarks miss
- **Continuous production monitoring** — shadow evaluation, drift detection, and regression alerts in live systems
- **Domain-specific eval suites** — τ-bench (customer service), SWE-bench Live (monthly-updated coding tasks)

---

## Implications for NanoPilot

NanoPilot agents run in containers, receive messages via channels (WhatsApp, Telegram, Slack), use tools (browser, file system, MCP servers), and maintain per-group memory. Here's how to build meaningful evaluation:

### Metrics to Track

| Metric | What It Captures | How to Measure |
|--------|-----------------|----------------|
| **Task completion rate** | Did the agent fulfill the user's request? | Structured test scenarios with expected outcomes |
| **Tool call accuracy** | Are the right tools called with correct args? | Log tool invocations, compare against golden paths |
| **Response latency** | Time from message receipt to reply | Timestamp diffs in message loop |
| **Cost per task** | Token usage and API calls per completion | Aggregate from Copilot SDK usage logs |
| **Error recovery rate** | Does the agent recover from tool failures? | Inject failures, measure graceful handling |
| **Memory coherence** | Does the agent use group memory correctly? | Multi-turn scenarios testing recall accuracy |

### Building Regression Tests

1. **Golden scenario suite.** Create 20–50 representative message→response pairs covering common NanoPilot use cases (scheduling, code questions, file operations, multi-turn conversations). Run agents against these after every container rebuild.

2. **Tool call assertions.** For each scenario, assert which tools were called, in what order, and with what arguments. Use structured logging from `container/agent-runner/` to capture invocations.

3. **LLM-as-judge scoring.** For open-ended responses, use a separate LLM call to score helpfulness, accuracy, and safety on a 1–5 scale. Track scores over time for regression detection.

4. **Failure injection tests.** Simulate tool failures (Docker unavailable, API timeouts, malformed input) and verify the agent degrades gracefully rather than crashing or hallucinating.

5. **Cost tracking.** Log token counts per scenario. Alert when a model upgrade or prompt change causes >20% cost increase without corresponding quality improvement.

6. **Channel-specific tests.** Each channel (WhatsApp, Telegram, Slack) has formatting and length constraints. Test that agent output renders correctly after channel formatting is applied.

### What NOT to Do

- Don't chase public benchmarks — NanoPilot's value is domain-specific, not general
- Don't rely solely on unit tests — agent behavior is non-deterministic; use statistical pass rates (e.g., 9/10 runs succeed)
- Don't ignore cost — a perfect agent that costs $5/message is worse than a good agent at $0.05/message

---

## References

- SWE-bench: https://swebench.com — Princeton/Anthropic, ICLR 2024
- GAIA: https://arxiv.org/abs/2311.12983 — Meta/HuggingFace, ICLR 2024
- AgentBench: https://arxiv.org/abs/2308.03688 — Tsinghua, ICLR 2024
- WebArena: https://webarena.dev — CMU, 2023
- VisualWebArena: https://arxiv.org/abs/2401.13649 — CMU, 2024
- ToolBench: https://github.com/OpenBMB/ToolBench — OpenBMB, ICLR 2024 Spotlight
- API-Bank: https://arxiv.org/abs/2304.08244 — 2023
- BFCL: https://gorilla.cs.berkeley.edu/leaderboard.html — Berkeley, ICML 2025
- HumanEval: OpenAI Codex paper, 2021
- MBPP: Google Research, 2021
- Benchmark criticism: VentureBeat, "AI agent benchmarks are misleading" (2025); arxiv.org/abs/2502.06559
