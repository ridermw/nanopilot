# Agent Safety & Sandboxing

> Research document — NanoPilot context. Last updated: August 2025.

## 1. Threat Model for Autonomous Agents

Autonomous LLM agents introduce a unique threat surface that combines traditional software risks with novel AI-specific vectors:

| Threat | Description | Impact |
|--------|-------------|--------|
| **Prompt injection** | Malicious input hijacks agent behavior (direct or indirect via retrieved content) | Arbitrary tool execution, data exfiltration |
| **Container escape** | Exploit in runtime (runc, Docker, kernel) breaks sandbox isolation | Full host compromise |
| **Token theft** | Agent extracts credentials from env vars, mounted files, or memory | Lateral movement, impersonation |
| **Resource exhaustion** | Runaway loops consume CPU, memory, or API quota | Denial of service, cost explosion |
| **Data exfiltration** | Agent sends sensitive data to external endpoints via network or tool calls | Privacy violation, IP theft |
| **Privilege escalation** | Agent writes to host filesystem, modifies its own code, or changes config | Persistent compromise across restarts |
| **Supply chain poisoning** | Compromised base images, dependencies, or skill branches inject malicious code | Silent persistent backdoor |

The OWASP Top 10 for LLM Applications (2025) codifies these into a formal taxonomy:
1. Prompt Injection, 2. Sensitive Information Disclosure, 3. Supply Chain Vulnerabilities,
4. Data/Model Poisoning, 5. Improper Output Handling, 6. Excessive Agency,
7. System Prompt Leakage, 8. Vector/Embedding Weaknesses, 9. Misinformation, 10. Unbounded Consumption.

---

## 2. Sandboxing Approaches Compared

### Docker / OCI Containers (Standard)
- **Isolation:** Linux namespaces + cgroups. Shared host kernel.
- **Escape risk:** Moderate — CVEs in runc/containerd are recurring (CVE-2024-21626, CVE-2025-9074).
- **Mitigations:** Non-root user, drop all capabilities, seccomp/AppArmor profiles, read-only root filesystem.
- **Startup:** ~1-3s. Near-zero overhead at runtime.

### gVisor
- **Isolation:** User-space kernel ("Sentry") intercepts syscalls. Written in Go (memory-safe).
- **Strength:** Blocks entire classes of kernel exploits. No shared syscall surface.
- **Tradeoff:** 40-60% startup latency overhead. Some syscall compatibility gaps.
- **Use case:** Multi-tenant or untrusted workloads where kernel isolation matters.

### Kata Containers
- **Isolation:** Each container gets its own lightweight VM with dedicated kernel via KVM.
- **Strength:** Hardware-grade isolation — even a compromised guest kernel cannot escape.
- **Tradeoff:** Higher memory footprint, slower cold starts (~2-5s).
- **Use case:** Maximum isolation for secrets handling or third-party code execution.

### E2B (Code Interpreter SDK)
- **Architecture:** Cloud-hosted Firecracker microVMs. Ephemeral by design (max 24h pro).
- **Startup:** 80-200ms. Stateful within a session.
- **SDK:** Python + JS. Built-in file ops, package installation.
- **Tradeoff:** Cloud-only, ephemeral, no GPU support, per-session pricing.

### Modal
- **Architecture:** Serverless containers with gVisor isolation. Python-first.
- **Strength:** Native GPU support, 20k+ concurrent sandboxes, snapshotting.
- **Startup:** ~1-2s cold start.
- **Tradeoff:** Slightly slower than microVM specialists. Not designed for desktop/local.

### Fly.io Machines / Sprites
- **Architecture:** Firecracker microVMs. Per-request or persistent VMs.
- **Strength:** 1-12s cold start, persistent state across sessions, checkpoint/restore.
- **Startup:** Subsecond for warm machines. Multi-region.
- **Tradeoff:** Higher operational complexity than pure container approaches.

### Apple Containers (macOS)
- **Architecture:** One lightweight VM per container via macOS Virtualization.framework. Swift-based.
- **Strength:** Hardware-level isolation, sub-second startup on Apple Silicon, OCI-compatible.
- **Startup:** <1s. Dedicated IP per container.
- **Tradeoff:** macOS + Apple Silicon only. New ecosystem, limited tooling.

### Comparison Table

| Approach | Isolation Level | Cold Start | Cost Model | GPU | Local/Cloud |
|----------|----------------|------------|------------|-----|-------------|
| Docker (standard) | Namespace/cgroup | 1-3s | Self-hosted | Yes | Both |
| Docker + gVisor | User-space kernel | 2-5s | Self-hosted | Limited | Both |
| Kata Containers | Hardware VM | 2-5s | Self-hosted | Yes | Both |
| E2B | Firecracker microVM | 80-200ms | Per-session | No | Cloud |
| Modal | gVisor containers | 1-2s | Per-compute | Yes | Cloud |
| Fly.io Sprites | Firecracker microVM | 1-12s | Per-resource | No | Cloud |
| Apple Containers | macOS VM | <1s | Free/local | No | Local only |

---

## 3. Prompt Injection Defense Patterns

### Input Layer
- **Delimiter isolation:** Randomized, session-specific delimiters separate system instructions from user content. Rotate per session to prevent guessing.
- **Input validation:** Regex filters for known patterns ("ignore previous instructions", `[SYSTEM]`). Whitelist schemas for structured inputs.
- **Character normalization:** Enforce Unicode NFC, strip zero-width characters, encode special chars.

### Architectural Layer
- **Privilege separation:** User input is always placed after hardcoded system instructions with explicit "treat the following as data" framing.
- **Least privilege tools:** Agent can only invoke tools on a strict allowlist. Dangerous tools require secondary confirmation.
- **Dual-LLM verification:** A secondary model or rule engine validates outputs before execution.

### Output Layer
- **Action gatekeeping:** Parse LLM output; only permit actions from a predefined safe set.
- **PII/secret scanning:** Post-process responses for credential patterns, API keys, PII before delivery.
- **Canary tokens:** Embed invisible markers in prompts; if echoed in output, flag potential injection.

### Monitoring Layer
- **Comprehensive logging:** All inputs, outputs, and tool invocations logged immutably.
- **Anomaly detection:** Flag unusual patterns — unexpected tool calls, output length spikes, repeated failures.

---

## 4. Resource Limits

| Resource | Mechanism | Example | Notes |
|----------|-----------|---------|-------|
| CPU | cgroups cpu.cfs_quota_us | 100ms per 100ms period (1 core) | Throttles on overuse |
| Memory | cgroups memory.max | 512MB hard limit | OOM-kills on exceed |
| Network | Network namespace / iptables | Block all egress or allowlist domains | Prevents exfiltration |
| Time | Wall-clock timeout | 5-minute deadline | Supervisor enforces |
| Disk | tmpfs size limit | 100MB writable space | Prevents disk fill |
| Processes | pids.max cgroup | 64 max PIDs | Prevents fork bombs |

---

## 5. Human-in-the-Loop Patterns

| Pattern | Trigger | Human Role | System Behavior |
|---------|---------|------------|-----------------|
| **Approval gate** | Irreversible ops (delete, send, deploy) | Approve/deny | Block until decision |
| **Confidence threshold** | Model uncertainty below policy limit | Review/correct | Escalate automatically |
| **Escalation** | Repeated failures or anomaly detection | Fix/redirect | Transfer with context |
| **Graduated autonomy** | Trust earned over time | Periodic audit | Relax gates progressively |
| **Sampled audit** | Random or Nth-action selection | Spot-check | Non-blocking monitoring |

**Best practices:** Gates should be enforced at the orchestration layer (config/code), not in the prompt. All decisions must be logged with immutable audit trails. Use risk-based placement: gate on reversibility x blast radius x data sensitivity.

---

## 6. Agent Permission Models

- **Tool allowlists:** Static config (YAML/JSON) defining which tools the agent may invoke. Default-deny.
- **Capability tokens:** Scoped, time-limited permission objects (like CapNet) — agent receives a signed token specifying allowed actions, resources, and expiry.
- **Hierarchical delegation:** Parent agents can delegate sub-capabilities to child agents, but never exceed their own authority. Revocation cascades.
- **Filesystem allowlists:** Restrict accessible paths via mount validation. Block sensitive patterns (.ssh, .env, credentials).
- **Network allowlists:** Restrict outbound HTTP to known-good domains only.
- **Runtime enforcement:** All tool dispatch checks capability map before execution. Tool names from the LLM are untrusted input.

---

## 7. Assessment of NanoPilot

### What NanoPilot Does Well

| Control | Implementation | OWASP Risk Addressed |
|---------|---------------|---------------------|
| **Read-only project mount** | Project root mounted `:ro`; writable paths (store, group) mounted separately | Excessive Agency (#6) |
| **/dev/null .env shadow** | `.env` overlaid with `/dev/null` so agent cannot read channel tokens | Sensitive Info Disclosure (#2) |
| **Token via stdin** | GitHub token passed via `container.stdin.write(JSON.stringify(input))`, never in env vars or Docker args | Sensitive Info Disclosure (#2) |
| **Mount security module** | `mount-security.ts` validates mounts against external allowlist. Blocks `.ssh`, `.gnupg`, `.aws`, credentials patterns. Symlink resolution via `realpathSync`. | Excessive Agency (#6) |
| **Non-main read-only** | `nonMainReadOnly` policy forces additional mounts to read-only for non-main groups | Excessive Agency (#6) |
| **Group isolation** | Each group gets its own folder; non-main groups cannot see the project root | Sensitive Info Disclosure (#2) |
| **Container path validation** | Rejects `..`, absolute paths, and colons in container paths (prevents `-v` injection) | Prompt Injection (#1) |
| **Token redaction** | `gho_`, `ghu_`, `ghp_`, `github_pat_` patterns redacted from all log output | Sensitive Info Disclosure (#2) |

### What Could Be Improved

| Gap | Risk | Recommendation |
|-----|------|----------------|
| **No seccomp/AppArmor profile** | Container escape via kernel exploit | Add `--security-opt seccomp=profile.json` and `--security-opt no-new-privileges` |
| **No capability dropping** | Unnecessary Linux capabilities | Add `--cap-drop ALL` to container launch |
| **No network restrictions** | Agent can make arbitrary outbound HTTP — exfiltration risk | Add `--network=none` or allowlist-only egress |
| **No CPU/memory limits** | Runaway agent can exhaust host resources | Add `--memory=512m --cpus=1 --pids-limit=64` |
| **No wall-clock timeout at Docker level** | Timeout is app-level only | Add `--stop-timeout` and a supervisor deadline |
| **No gVisor/Kata runtime option** | Standard runc shares host kernel | Support `--runtime=runsc` for high-security groups |
| **No human-in-the-loop gates** | All agent actions execute without approval | Add approval gates for destructive ops |
| **No output filtering** | Responses not scanned for leaked secrets | Add post-response secret scanning before channel delivery |
| **No Apple Container default** | Missing native macOS isolation | NanoPilot has `convert-to-apple-container` skill — consider making it default on macOS |

### Recommended Priority Actions

1. **`--cap-drop ALL --security-opt no-new-privileges`** — zero-effort, high impact hardening.
2. **`--memory=512m --cpus=1 --pids-limit=64`** — prevents resource exhaustion.
3. **`--network=none` for non-main groups** (main may need network for tool calls).
4. **Output secret scanning** — regex scan responses for token/key patterns before delivery.
5. **Consider gVisor runtime** for untrusted or multi-user deployments.

---

## References

- OWASP Top 10 for LLM Applications 2025 — https://owasp.org/www-project-top-10-for-large-language-model-applications/
- OWASP AI Agent Security Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html
- gVisor container security platform — https://gvisor.dev/
- E2B Code Interpreter SDK — https://e2b.dev/docs
- Modal coding agents — https://modal.com/solutions/coding-agents
- Fly.io Machines/Sprites — https://fly.io/docs/machines/
- Apple Containers — https://github.com/apple/container
- tldrsec prompt injection defenses — https://github.com/tldrsec/prompt-injection-defenses
