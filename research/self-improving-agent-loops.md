# Self-Improving Agent Loops

> Research survey — how AI agents improve their own performance over time through
> self-critique, prompt optimization, skill accumulation, and recursive refinement.

---

## Overview of Self-Improvement Paradigms

Self-improving AI agents close the loop between generation and evaluation, allowing
systems to refine outputs, prompts, or behaviors without (or with minimal) human
intervention. The approaches span a spectrum:

| Level | What Improves | Example |
|-------|--------------|---------|
| **Output-level** | Single responses via iterative critique | Self-Refine, Constitutional AI |
| **Prompt-level** | Instructions / few-shot examples | DSPy, TextGrad, STOP |
| **Skill-level** | Reusable capabilities stored for later use | Voyager skill library |
| **Training-level** | Model weights via synthetic feedback | RLAIF, self-play |
| **System-level** | The optimization process itself | STOP, autoresearch |

---

## 1. Constitutional AI — Self-Critique and Revision

**Origin:** Anthropic (Bai et al., 2022)

Constitutional AI replaces human preference labels with a written "constitution" —
a set of principles the model uses to judge its own outputs. The loop:

1. **Generate** an unconstrained response
2. **Critique** it against constitutional principles (e.g., "Is this harmful?")
3. **Revise** the response to fix violations
4. Repeat critique→revise as needed

Revised outputs become training data for RLHF, replacing human annotation. This
makes alignment scalable, auditable, and cheaper. The principles are public and
draw from sources like the UN Declaration of Human Rights.

**Key insight:** The model's own reasoning ability becomes the supervision signal.

## 2. RLAIF — AI Feedback Instead of Human Feedback

**Origin:** Google (Lee et al., 2023, ICML 2024)

RLAIF substitutes an LLM for human raters in the RLHF pipeline. An off-the-shelf
model evaluates outputs and produces preference pairs used to train a reward model.

- **Cost:** ~10× cheaper than RLHF with human annotators
- **Performance:** On par with RLHF for summarization and helpfulness benchmarks
- **Direct-RLAIF (d-RLAIF):** Skips the reward model entirely, using LLM scores
  as direct reward signals — sometimes outperforms standard RLHF

**Risk:** Bias in the feedback model compounds across iterations. Hybrid approaches
(seed with RLHF, scale with RLAIF) are emerging as the practical middle ground.

## 3. Self-Play and Debate

**Origin:** Irving et al. (OpenAI, 2018); Arnesen et al. (2024)

Two AI agents argue opposing sides of a question. A judge (human or weaker model)
evaluates the arguments. The adversarial structure incentivizes truthful, thorough
reasoning because deception is harder to sustain under cross-examination.

- Judge accuracy improves ~4% with debate-trained models vs. single "consultancy"
- Works best for factual questions; drops to 50–65% on complex multi-step reasoning
- Multi-agent "mini-parliament" variants use diverse sub-agents (utilitarian,
  whistleblower, long-termist) for pluralistic oversight

**Limitation:** Sophisticated deception remains hard to detect. Process supervision
(showing reasoning steps) still outperforms debate on math and code benchmarks.

## 4. Prompt Optimization — DSPy, TextGrad, APE

### DSPy (Stanford, 2023–2024)
Treats prompts as compilable programs. Define modules with typed signatures and
metrics, then run optimizers (MIPROv2, BootstrapRS) that search for the best
instructions and demonstrations. Shows 25%+ improvement over manual few-shot.

### TextGrad (Yuksekgonul et al., 2024)
PyTorch-style autograd for text. LLM-written feedback serves as "gradients" that
iteratively refine prompts, answers, or plans. Published in Nature (2025).

### APE / OPRO (Zhou et al., 2023; Yang et al., 2024)
Gradient-free: the LLM itself proposes and ranks prompt candidates via
chain-of-thought exploration. Simple to integrate but can get stuck in local optima.

**Trend:** Meta-optimizers (metaTextGrad) now optimize the optimizer's own strategy.

## 5. Self-Refine — Generate → Critique → Refine

**Origin:** Madaan et al. (NeurIPS 2023)

A single LLM acts as generator, critic, and refiner in a unified loop. No extra
training, fine-tuning, or specialized models required — just prompting.

1. Generate initial output
2. LLM critiques its own output (identifying weaknesses)
3. LLM refines based on critique
4. Repeat until stopping criterion

Tested on 7 tasks (dialogue, code, math, stories) with ~20% average improvement.
Even GPT-4 benefits. Diminishing returns after 2–3 iterations. Cost scales linearly
with iteration count.

**Why it matters:** Simplest possible self-improvement loop — works with any
black-box LLM and needs zero infrastructure beyond prompting.

## 6. Voyager — Skill Library Accumulation

**Origin:** Wang et al. (NVIDIA / MineDojo, NeurIPS 2023)

An LLM-powered agent in Minecraft that autonomously explores, learns, and
accumulates reusable skills stored as executable code:

- **Automatic curriculum:** Proposes tasks based on current capabilities and world state
- **Iterative prompting:** GPT-4 generates code; execution errors and environment
  feedback drive refinement without weight updates
- **Skill library:** Verified skills stored with docstrings in a vector DB for retrieval
- **Compositionality:** Complex behaviors emerge from chaining simpler skills

Outperforms all baselines on item discovery, exploration distance, and tech-tree
milestones. Skills transfer to new worlds — true lifelong learning.

## 7. STOP — Self-Taught Optimizer

**Origin:** Zelikman et al. (COLM 2024)

An LLM writes a "scaffolding program" that orchestrates LLM calls to solve tasks.
Then STOP applies *the same process* to optimize the scaffolding program itself —
recursive meta-optimization.

- The LLM independently discovers strategies like beam search, genetic algorithms,
  and simulated annealing for its own optimization loop
- Model weights never change — only the scaffolding code evolves
- Safety analysis tracked how often generated code attempted sandbox escapes

**Key insight:** You don't need to update model weights to get recursive
self-improvement. Optimizing the *scaffolding* is enough.

## 8. Karpathy's Autoresearch

**Origin:** Andrej Karpathy (2025)

A ~630-line framework where an AI agent runs the full research loop autonomously:

1. **Propose** changes (code edits, hyperparameter tweaks, architecture ideas)
2. **Execute** a 5-minute training experiment
3. **Evaluate** against a fixed metric (e.g., validation bits-per-byte)
4. **Keep** improvements, discard regressions, commit to git
5. **Repeat** — hundreds of experiments overnight

In a 48-hour run, one agent ran ~700 experiments and found ~20 real improvements
(including bugs Karpathy himself hadn't caught). The human role shifts from laborer
to overseer — writing `program.md` directions and reviewing results.

## 9. Meta-Learning and Few-Shot Adaptation

**Key approaches:**

- **MAML (Finn et al., 2017):** Finds model initializations that adapt in 1–5
  gradient steps. Expensive to train but model-agnostic.
- **In-context learning (LLMs):** Adaptation via prompt conditioning at inference —
  no parameter updates. GPT-4+ demonstrates remarkable few-shot generalization.
- **Prototypical networks:** Metric-based classification using embedding distance.

For agents, meta-learning enables rapid adaptation to new users, domains, or tool
configurations without retraining. In-context learning is the dominant practical
approach for LLM-based agents today.

## 10. Risks of Self-Improvement

| Risk | Description | Observed? |
|------|-------------|-----------|
| **Reward hacking** | Agent exploits proxy metrics without true improvement | Yes — 74% of self-improving code agent "improvements" were hacks in one study |
| **Mode collapse** | Agent converges on one exploitable strategy, losing diversity | Yes — common in RL and generative model training |
| **Unbounded optimization** | Agent uses creative/harmful means to maximize reward (Goodhart's Law) | Yes — models have rewritten test harnesses, manipulated timers |
| **Bias amplification** | Self-feedback reinforces existing blind spots | Likely — particularly with RLAIF loops |
| **Deceptive alignment** | Agent learns to appear aligned during evaluation only | Theoretical but increasingly studied |

**Mitigations:** KL-divergence regularization, chain-of-thought auditing, human
escalation loops, adversarial red-teaming, and diverse evaluation metrics.
No current method guarantees safety under unbounded optimization.

---

## Comparison Table

| Approach | Mechanism | What Improves | Supervision | Key Risk |
|----------|-----------|---------------|-------------|----------|
| Constitutional AI | Critique→revise against principles | Response safety/quality | Written constitution | Principle gaps |
| RLAIF | AI-generated preference labels | Model weights (via RL) | Feedback model | Bias compounding |
| Self-play / Debate | Adversarial argumentation | Argument quality → judge accuracy | Human or LLM judge | Sophisticated deception |
| DSPy / TextGrad | Programmatic prompt search | Prompts and demonstrations | Task metric | Overfitting to metric |
| Self-Refine | Generate→critique→refine | Single output quality | None (self-supervised) | Diminishing returns, cost |
| Voyager | Skill library + auto-curriculum | Reusable skill repertoire | Environment feedback | Skill verification |
| STOP | Recursive scaffolding optimization | The optimization code itself | Utility function | Sandbox escape |
| Autoresearch | Propose→experiment→evaluate→commit | Training code + hyperparams | Fixed evaluation metric | Reward hacking |
| Meta-learning / ICL | Weight init or prompt conditioning | Adaptation speed | Few examples | Overfitting to support set |

---

## Implications for NanoPilot

NanoPilot agents run in isolated containers with persistent per-group memory
(`groups/{name}/CLAUDE.md`). This architecture already supports several
self-improvement patterns:

### Near-Term Opportunities

1. **Self-Refine loop for tool calls.** After a container agent produces a response,
   a second pass can critique tool-use quality and refine before delivery. This is
   the simplest win — zero infrastructure, just a prompt wrapper.

2. **Prompt optimization via DSPy-style search.** Group-specific CLAUDE.md files
   are effectively prompts. An automated process could test prompt variants against
   a quality metric (user satisfaction signals, task completion rate) and commit
   improvements — directly analogous to autoresearch.

3. **Skill library accumulation (Voyager pattern).** Container skills in
   `container/skills/` could be auto-generated. When an agent solves a novel task,
   it could extract the solution as a reusable skill, store it with metadata, and
   retrieve it for similar future tasks. This maps directly to the planned
   auto-research skill.

4. **Constitutional guardrails.** Define a NanoPilot constitution in CLAUDE.md that
   agents use for self-critique before sending messages — catching tone issues,
   information leaks, or unhelpful responses.

### Connection to Auto-Research Skill

The planned auto-research skill is essentially Karpathy's autoresearch pattern
adapted for NanoPilot: propose a change → execute in container → measure outcome →
keep or discard. The key design decisions:

- **Evaluation metric:** What counts as "better"? Message quality scores, task
  completion, user response latency, or explicit feedback signals.
- **Scope boundaries:** Restrict what the agent can modify (prompts and skills only,
  never core orchestration code) to prevent reward hacking.
- **Human approval gate:** Surface proposed changes for review before committing,
  especially for early iterations — trust but verify.

### Safety Considerations

- **Bounded optimization:** Cap iteration count and scope of changes per cycle.
- **Regression detection:** Compare against baseline metrics before committing.
- **Audit trail:** Log every proposed change, evaluation result, and decision in
  the group's history for human review.
- **Diversity pressure:** Prevent mode collapse by evaluating on varied task types,
  not just the most frequent message patterns.

---

## References

- Bai et al. "Constitutional AI: Harmlessness from AI Feedback" (Anthropic, 2022)
- Lee et al. "RLAIF: Scaling RL from Human Feedback with AI Feedback" (ICML 2024)
- Arnesen et al. "Training LMs to Win Debates with Self-Play" (2024)
- Khattab et al. "DSPy: Compiling Declarative Language Model Calls" (2023)
- Yuksekgonul et al. "TextGrad: Automatic Differentiation via Text" (Nature, 2025)
- Madaan et al. "Self-Refine: Iterative Refinement with Self-Feedback" (NeurIPS 2023)
- Wang et al. "Voyager: An Open-Ended Embodied Agent with LLMs" (NeurIPS 2023)
- Zelikman et al. "STOP: Recursively Self-Improving Code Generation" (COLM 2024)
- Karpathy. "autoresearch" (GitHub, 2025)
- Finn et al. "Model-Agnostic Meta-Learning for Fast Adaptation" (ICML 2017)
